import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createDatabricksClient } from "@/lib/databricks";
import {
  FakeInMemorySettingsStore,
  getConnectionState,
  setSettingsStore,
} from "@/lib/settings";
import {
  checkSchemaCollision,
  FakeInMemoryTemplateRepository,
  provisionTemplate,
  resolveVolumeName,
  setTemplateRepository,
  validateSchemaName,
  type TemplateDefinition,
} from "./index";

describe("Template Provisioning Flow (One Schema & One Volume per Template)", () => {
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
      schema: "target_penjualan",
      name: "file_storage",
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
      defaultVolumeName: "file_storage",
      maxFileSizeMb: 100,
    });

    await repo.create(validTemplate);
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
  });

  it("urutan pembuatan: membuat schema dengan marker, volume, folder csv, folder parquet, dan mengaktifkan template", async () => {
    const callOrder: string[] = [];
    let schemaBody: { name?: string; catalog_name?: string; comment?: string } | null = null;

    globalThis.fetch = (async (url, init) => {
      const urlStr = String(url);
      const method = init?.method || "GET";

      if (urlStr.includes("/schemas/main.target_penjualan") && method === "GET") {
        callOrder.push("getSchema");
        return new Response("Not found", { status: 404 });
      }

      if (urlStr.endsWith("/schemas") && method === "POST") {
        callOrder.push("createSchema");
        schemaBody = JSON.parse(init?.body as string);
        return new Response(
          JSON.stringify({ name: "target_penjualan", catalog_name: "main" }),
          { status: 200 }
        );
      }

      if (urlStr.includes("/volumes/main.target_penjualan.file_storage") && method === "GET") {
        callOrder.push("getVolume");
        return new Response("Not found", { status: 404 });
      }

      if (urlStr.endsWith("/volumes") && method === "POST") {
        callOrder.push("createVolume");
        return new Response(JSON.stringify({ name: "file_storage" }), {
          status: 200,
        });
      }

      if (urlStr.includes("/fs/directories") && method === "PUT") {
        if (urlStr.includes("/csv")) callOrder.push("createCsv");
        if (urlStr.includes("/parquet")) callOrder.push("createParquet");
        return new Response("{}", { status: 200 });
      }

      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const result = await provisionTemplate(validTemplate.id);
    expect(result.success).toBe(true);
    expect(result.template.status).toBe("aktif");
    expect(result.template.schemaCreatedByApp).toBe(true);
    expect(result.template.volumeCreatedByApp).toBe(true);
    expect(schemaBody?.comment).toBe(
      `Dibuat oleh Data Uploader (template ${validTemplate.id})`
    );
    expect(callOrder).toEqual([
      "getSchema",
      "createSchema",
      "getVolume",
      "createVolume",
      "createCsv",
      "createParquet",
    ]);
    expect(result.steps.map((s) => s.name)).toEqual([
      "Menyimpan template",
      "Membuat folder induk",
      "Membuat folder penyimpanan",
      "Menyiapkan folder CSV",
      "Menyiapkan folder Parquet",
      "Siap dipakai",
    ]);
  });

  it("resume ketika marker cocok pada schema yang sudah ada", async () => {
    let createSchemaCalled = false;

    globalThis.fetch = (async (url, init) => {
      const urlStr = String(url);
      const method = init?.method || "GET";

      if (urlStr.includes("/schemas/main.target_penjualan") && method === "GET") {
        return new Response(
          JSON.stringify({
            name: "target_penjualan",
            catalog_name: "main",
            comment: `Dibuat oleh Data Uploader (template ${validTemplate.id})`,
          }),
          { status: 200 }
        );
      }

      if (urlStr.endsWith("/schemas") && method === "POST") {
        createSchemaCalled = true;
        return new Response("{}", { status: 200 });
      }

      if (urlStr.includes("/volumes/main.target_penjualan.file_storage") && method === "GET") {
        return new Response("Not found", { status: 404 });
      }

      if (urlStr.endsWith("/volumes") && method === "POST") {
        return new Response(JSON.stringify({ name: "file_storage" }), {
          status: 200,
        });
      }

      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const result = await provisionTemplate(validTemplate.id);
    expect(result.success).toBe(true);
    expect(createSchemaCalled).toBe(false);
    expect(result.template.schemaCreatedByApp).toBe(true);
    expect(result.template.volumeCreatedByApp).toBe(true);
  });

  it("adopsi ketika schema sudah ada tanpa marker", async () => {
    globalThis.fetch = (async (url, init) => {
      const urlStr = String(url);
      const method = init?.method || "GET";

      if (urlStr.includes("/schemas/main.target_penjualan") && method === "GET") {
        return new Response(
          JSON.stringify({
            name: "target_penjualan",
            catalog_name: "main",
            comment: "Dibuat secara manual oleh tim data",
          }),
          { status: 200 }
        );
      }

      if (urlStr.includes("/volumes/main.target_penjualan.file_storage") && method === "GET") {
        return new Response(
          JSON.stringify({
            name: "file_storage",
            catalog_name: "main",
            schema_name: "target_penjualan",
            volume_type: "MANAGED",
          }),
          { status: 200 }
        );
      }

      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const initialAttempt = await provisionTemplate(validTemplate.id, {
      adoptExisting: false,
    });
    expect(initialAttempt.success).toBe(false);
    expect(initialAttempt.schemaExists).toBe(true);
    expect(initialAttempt.template.status).toBe("gagal");

    const adoptResult = await provisionTemplate(validTemplate.id, {
      adoptExisting: true,
    });
    expect(adoptResult.success).toBe(true);
    expect(adoptResult.template.status).toBe("aktif");
    expect(adoptResult.template.schemaCreatedByApp).toBe(false);
    expect(adoptResult.template.volumeCreatedByApp).toBe(false);
  });

  it("403 pada createSchema dipetakan ke pesan izin membuat folder penyimpanan baru", async () => {
    globalThis.fetch = (async (url, init) => {
      const urlStr = String(url);
      const method = init?.method || "GET";

      if (urlStr.includes("/schemas/main.target_penjualan") && method === "GET") {
        return new Response("Not found", { status: 404 });
      }

      if (urlStr.endsWith("/schemas") && method === "POST") {
        return new Response("Forbidden", { status: 403 });
      }

      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const result = await provisionTemplate(validTemplate.id);
    expect(result.success).toBe(false);
    expect(result.error).toBe(
      "Akun koneksi belum punya izin membuat folder penyimpanan baru. Hubungi admin."
    );
    expect(result.errorDetail).toContain("USE CATALOG");
    expect(result.errorDetail).toContain("CREATE SCHEMA");
  });

  it("validasi penamaan termasuk nama tercadang dan benturan langsung (live collision)", async () => {
    expect(validateSchemaName("information_schema").valid).toBe(false);
    expect(validateSchemaName("default").valid).toBe(false);
    expect(validateSchemaName("ab").valid).toBe(false);
    expect(validateSchemaName("1_invalid").valid).toBe(false);
    expect(validateSchemaName("valid_folder_123").valid).toBe(true);

    expect(resolveVolumeName("my_slug", "file_storage")).toBe("file_storage");
    expect(resolveVolumeName("my_slug", "")).toBe("my_slug");
    expect(resolveVolumeName("my_slug", undefined)).toBe("my_slug");

    globalThis.fetch = (async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("/schemas/main.existing_folder")) {
        return new Response(
          JSON.stringify({ name: "existing_folder", catalog_name: "main" }),
          { status: 200 }
        );
      }
      return new Response("Not found", { status: 404 });
    }) as unknown as typeof fetch;

    const client = createDatabricksClient(
      "https://dbc-test.cloud.databricks.com",
      "token"
    );

    const colTrue = await checkSchemaCollision(client, "main", "existing_folder");
    expect(colTrue.collision).toBe(true);
    expect(colTrue.error).toBe("Nama folder sudah dipakai. Pilih nama lain.");

    const colFalse = await checkSchemaCollision(client, "main", "new_folder");
    expect(colFalse.collision).toBe(false);
  });

  it("status koneksi berfungsi tanpa schema global dan template lama tetap berjalan", async () => {
    const connState = await getConnectionState();
    expect(connState.ready).toBe(true);
    expect(connState.missing).toEqual([]);

    const legacyTemplate: TemplateDefinition = {
      ...validTemplate,
      id: crypto.randomUUID(),
      name: "Template Lama",
      slug: "template_lama",
      volume: {
        catalog: "legacy_cat",
        schema: "legacy_schema",
        name: "legacy_vol",
      },
    };
    const createdLegacy = await repo.create(legacyTemplate);
    expect(createdLegacy.volume.catalog).toBe("legacy_cat");
    expect(createdLegacy.volume.schema).toBe("legacy_schema");
    expect(createdLegacy.volume.name).toBe("legacy_vol");
  });
});
