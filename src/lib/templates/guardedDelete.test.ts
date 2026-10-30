import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { GET as deletePreviewRoute } from "@/app/api/templates/[id]/delete-preview/route";
import { POST as deleteRoute } from "@/app/api/templates/[id]/delete/route";
import { DELETE as cancelTemplateRoute } from "@/app/api/templates/[id]/route";
import { signAdminToken } from "@/lib/adminAuth";
import {
  FakeInMemoryTemplateRepository,
  setTemplateRepository,
} from "./repository";
import type { TemplateDefinition } from "./schema";
import {
  FakeInMemoryTemplateVersionRepository,
  setTemplateVersionRepository,
} from "./versions";
import {
  FakeInMemoryUploadLogRepository,
  setUploadLogRepository,
} from "@/lib/upload/log";

describe("Guarded Permanent Delete Flow", () => {
  let templateRepo: FakeInMemoryTemplateRepository;
  let versionRepo: FakeInMemoryTemplateVersionRepository;
  let uploadLogRepo: FakeInMemoryUploadLogRepository;
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  const sampleArchivedTemplate: TemplateDefinition = {
    id: crypto.randomUUID(),
    name: "Laporan Penjualan",
    slug: "laporan_penjualan",
    description: "Data penjualan bulanan",
    delimiter: ";",
    status: "diarsipkan",
    volume: {
      catalog: "main",
      schema: "sales",
      name: "laporan_penjualan",
    },
    schemaCreatedByApp: true,
    volumeCreatedByApp: true,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    columns: [{ name: "id", required: true, rule: { type: "integer" } }],
  };

  beforeEach(() => {
    templateRepo = new FakeInMemoryTemplateRepository();
    setTemplateRepository(templateRepo);

    versionRepo = new FakeInMemoryTemplateVersionRepository();
    setTemplateVersionRepository(versionRepo);

    uploadLogRepo = new FakeInMemoryUploadLogRepository();
    setUploadLogRepository(uploadLogRepo);

    process.env.DATABRICKS_HOST = "https://dbc-test.cloud.databricks.com";
    process.env.DATABRICKS_TOKEN = "secret-token";
    process.env.DATABRICKS_CATALOG = "main";
    process.env.ADMIN_PASSWORD = "admin_password_123";
    process.env.SESSION_SECRET = "super_long_secret_key_at_least_32_characters_123456";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  it("delete refused for an active template", async () => {
    const validToken = signAdminToken();
    const activeTemplate: TemplateDefinition = {
      ...sampleArchivedTemplate,
      id: crypto.randomUUID(),
      name: "Template Aktif",
      slug: "template_aktif",
      status: "aktif",
    };
    await templateRepo.create(activeTemplate);

    const req = new Request(
      `http://localhost/api/templates/${activeTemplate.id}/delete`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `admin_session=${validToken}`,
        },
        body: JSON.stringify({
          confirmName: activeTemplate.name,
          deletedBy: "Admin Budi",
        }),
      }
    );

    const res = await deleteRoute(req, {
      params: Promise.resolve({ id: activeTemplate.id }),
    });
    expect(res.status).toBe(400);

    const current = await templateRepo.get(activeTemplate.id);
    expect(current?.status).toBe("aktif");
  });

  it("delete refused for a wrong confirmName", async () => {
    const validToken = signAdminToken();
    await templateRepo.create(sampleArchivedTemplate);

    const req = new Request(
      `http://localhost/api/templates/${sampleArchivedTemplate.id}/delete`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `admin_session=${validToken}`,
        },
        body: JSON.stringify({
          confirmName: "Nama Yang Salah",
          deletedBy: "Admin Budi",
        }),
      }
    );

    const res = await deleteRoute(req, {
      params: Promise.resolve({ id: sampleArchivedTemplate.id }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Nama konfirmasi tidak sesuai dengan nama template.");
  });

  it("delete requires admin session", async () => {
    await templateRepo.create(sampleArchivedTemplate);

    const req = new Request(
      `http://localhost/api/templates/${sampleArchivedTemplate.id}/delete`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          confirmName: sampleArchivedTemplate.name,
        }),
      }
    );

    const res = await deleteRoute(req, {
      params: Promise.resolve({ id: sampleArchivedTemplate.id }),
    });
    expect(res.status).toBe(401);
  });

  it("deletes volume then schema in order when flags are true and schema is empty, never sending force", async () => {
    const validToken = signAdminToken();
    await templateRepo.create(sampleArchivedTemplate);

    const calls: { method: string; url: string }[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method || "GET";
      calls.push({ method, url });

      if (url.includes("/api/2.1/unity-catalog/volumes/")) {
        return new Response("{}", { status: 200 });
      }
      if (url.includes("/api/2.1/unity-catalog/schemas/")) {
        return new Response("{}", { status: 200 });
      }
      if (url.includes("/api/2.1/unity-catalog/tables")) {
        return new Response(JSON.stringify({ tables: [] }), { status: 200 });
      }
      if (url.includes("/api/2.1/unity-catalog/volumes?")) {
        return new Response(JSON.stringify({ volumes: [] }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const req = new Request(
      `http://localhost/api/templates/${sampleArchivedTemplate.id}/delete`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `admin_session=${validToken}`,
        },
        body: JSON.stringify({
          confirmName: sampleArchivedTemplate.name,
          deletedBy: "Admin",
        }),
      }
    );

    const res = await deleteRoute(req, {
      params: Promise.resolve({ id: sampleArchivedTemplate.id }),
    });
    expect(res.status).toBe(200);

    const deleteCalls = calls.filter((c) => c.method === "DELETE");
    expect(deleteCalls.length).toBe(2);
    expect(deleteCalls[0].url).toContain("/volumes/main.sales.laporan_penjualan");
    expect(deleteCalls[1].url).toContain("/schemas/main.sales");

    for (const c of calls) {
      expect(c.url).not.toContain("force=true");
    }
  });

  it("keeps schema when schema is not empty and reports notice", async () => {
    const validToken = signAdminToken();
    await templateRepo.create(sampleArchivedTemplate);

    const calls: { method: string; url: string }[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method || "GET";
      calls.push({ method, url });

      if (url.includes("/api/2.1/unity-catalog/tables")) {
        return new Response(JSON.stringify({ tables: [{ name: "table_other" }] }), { status: 200 });
      }
      if (url.includes("/api/2.1/unity-catalog/volumes?")) {
        return new Response(JSON.stringify({ volumes: [] }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const req = new Request(
      `http://localhost/api/templates/${sampleArchivedTemplate.id}/delete`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `admin_session=${validToken}`,
        },
        body: JSON.stringify({
          confirmName: sampleArchivedTemplate.name,
          deletedBy: "Admin",
        }),
      }
    );

    const res = await deleteRoute(req, {
      params: Promise.resolve({ id: sampleArchivedTemplate.id }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.notice).toBe("Folder induk tidak dihapus karena masih berisi objek lain.");

    const deleteCalls = calls.filter((c) => c.method === "DELETE");
    expect(deleteCalls.length).toBe(1);
    expect(deleteCalls[0].url).toContain("/volumes/");
  });

  it("older templates with flags false only lose their definition without touching Databricks", async () => {
    const validToken = signAdminToken();
    const olderTemplate: TemplateDefinition = {
      ...sampleArchivedTemplate,
      id: crypto.randomUUID(),
      schemaCreatedByApp: false,
      volumeCreatedByApp: false,
    };
    await templateRepo.create(olderTemplate);

    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const req = new Request(
      `http://localhost/api/templates/${olderTemplate.id}/delete`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `admin_session=${validToken}`,
        },
        body: JSON.stringify({
          confirmName: olderTemplate.name,
        }),
      }
    );

    const res = await deleteRoute(req, {
      params: Promise.resolve({ id: olderTemplate.id }),
    });
    expect(res.status).toBe(200);
    expect(fetchCalled).toBe(false);

    const current = await templateRepo.get(olderTemplate.id);
    expect(current?.status).toBe("dihapus");
  });
});
