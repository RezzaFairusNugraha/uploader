import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { FakeInMemorySettingsStore, setSettingsStore } from "@/lib/settings";
import {
  FakeInMemoryTemplateRepository,
  provisionTemplate,
  setTemplateRepository,
  type TemplateDefinition,
} from "./index";

describe("Template Provisioning Flow (Databricks Client & Retry)", () => {
  let repo: FakeInMemoryTemplateRepository;
  let settingsStore: FakeInMemorySettingsStore;
  const originalFetch = globalThis.fetch;
  const dummyKey = Buffer.from("01234567890123456789012345678901", "utf8");

  const validTemplate: TemplateDefinition = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    name: "Target Penjualan",
    slug: "target_penjualan",
    description: "Template target",
    delimiter: ";",
    status: "membuat",
    volume: {
      catalog: "main",
      schema: "sales",
      name: "target_penjualan",
    },
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    columns: [
      {
        name: "kode",
        required: true,
        rule: { type: "digits", length: 9 },
      },
    ],
  };

  beforeEach(async () => {
    repo = new FakeInMemoryTemplateRepository();
    setTemplateRepository(repo);

    settingsStore = new FakeInMemorySettingsStore(dummyKey);
    setSettingsStore(settingsStore);

    await settingsStore.save({
      workspaceUrl: "https://dbc-test.cloud.databricks.com",
      token: "valid-secret-token",
      catalog: "main",
      schema: "sales",
      maxFileSizeMb: 100,
    });

    await repo.create(validTemplate);
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
  });

  it("happy path: membuat volume, folder csv, folder parquet, dan mengubah status menjadi 'aktif'", async () => {
    const createdDirs: string[] = [];
    let volumeCreated = false;

    globalThis.fetch = (async (url, init) => {
      const urlStr = String(url);
      const method = init?.method || "GET";

      if (urlStr.includes("/volumes/main.sales.target_penjualan")) {
        return new Response("Not found", { status: 404 });
      }

      if (urlStr.endsWith("/volumes") && method === "POST") {
        volumeCreated = true;
        return new Response(JSON.stringify({ name: "target_penjualan" }), {
          status: 200,
        });
      }

      if (urlStr.includes("/fs/directories") && method === "PUT") {
        createdDirs.push(urlStr);
        return new Response("{}", { status: 200 });
      }

      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const result = await provisionTemplate(validTemplate.id);
    expect(result.success).toBe(true);
    expect(result.template.status).toBe("aktif");
    expect(volumeCreated).toBe(true);
    expect(createdDirs.some((d) => d.includes("/csv"))).toBe(true);
    expect(createdDirs.some((d) => d.includes("/parquet"))).toBe(true);
  });

  it("volume exists: jika volume sudah ada dan reuseExistingVolume false, mengembalikan error volumeExists", async () => {
    globalThis.fetch = (async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("/volumes/main.sales.target_penjualan")) {
        return new Response(JSON.stringify({ name: "target_penjualan" }), {
          status: 200,
        });
      }
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const result = await provisionTemplate(validTemplate.id, {
      reuseExistingVolume: false,
    });
    expect(result.success).toBe(false);
    expect(result.volumeExists).toBe(true);
    expect(result.template.status).toBe("gagal");

    const retryReuse = await provisionTemplate(validTemplate.id, {
      reuseExistingVolume: true,
    });
    expect(retryReuse.success).toBe(true);
    expect(retryReuse.template.status).toBe("aktif");
  });

  it("403 error on createVolume: memberikan pesan hak akses kurang dan status 'gagal'", async () => {
    globalThis.fetch = (async (url, init) => {
      const urlStr = String(url);
      const method = init?.method || "GET";

      if (urlStr.includes("/volumes/main.sales.target_penjualan") && method === "GET") {
        return new Response("Not found", { status: 404 });
      }

      if (urlStr.endsWith("/volumes") && method === "POST") {
        return new Response("Forbidden", { status: 403 });
      }

      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const result = await provisionTemplate(validTemplate.id);
    expect(result.success).toBe(false);
    expect(result.template.status).toBe("gagal");
    expect(result.steps[1].fix).toContain("CREATE VOLUME");
  });

  it("retry after failure: dapat dicoba lagi setelah kegagalan sebelumnya", async () => {
    let callCount = 0;
    globalThis.fetch = (async (url, init) => {
      callCount++;
      const urlStr = String(url);
      const method = init?.method || "GET";

      if (urlStr.includes("/volumes/main.sales.target_penjualan") && method === "GET") {
        return new Response("Not found", { status: 404 });
      }

      if (urlStr.endsWith("/volumes") && method === "POST") {
        if (callCount <= 2) {
          return new Response("Server error", { status: 500 });
        }
        return new Response(JSON.stringify({ name: "target_penjualan" }), {
          status: 200,
        });
      }

      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const failResult = await provisionTemplate(validTemplate.id);
    expect(failResult.success).toBe(false);

    const successResult = await provisionTemplate(validTemplate.id);
    expect(successResult.success).toBe(true);
    expect(successResult.template.status).toBe("aktif");
  });
});
