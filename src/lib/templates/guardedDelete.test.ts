import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { GET as deletePreviewRoute } from "@/app/api/templates/[id]/delete-preview/route";
import { POST as deleteRoute } from "@/app/api/templates/[id]/delete/route";
import { signAdminToken } from "@/lib/adminAuth";
import { createDatabricksClient } from "@/lib/databricks";
import { FakeInMemorySettingsStore, setSettingsStore } from "@/lib/settings";
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
  let settingsStore: FakeInMemorySettingsStore;
  let uploadLogRepo: FakeInMemoryUploadLogRepository;
  const originalFetch = globalThis.fetch;
  const dummyKey = Buffer.from("01234567890123456789012345678901", "utf8");

  const validToken = signAdminToken();

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
    volumeCreatedByApp: true,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    columns: [{ name: "id", required: true, rule: { type: "integer" } }],
  };

  beforeEach(async () => {
    templateRepo = new FakeInMemoryTemplateRepository();
    setTemplateRepository(templateRepo);

    versionRepo = new FakeInMemoryTemplateVersionRepository();
    setTemplateVersionRepository(versionRepo);

    settingsStore = new FakeInMemorySettingsStore(dummyKey);
    setSettingsStore(settingsStore);

    uploadLogRepo = new FakeInMemoryUploadLogRepository();
    setUploadLogRepository(uploadLogRepo);

    await settingsStore.save({
      workspaceUrl: "https://dbc-test.cloud.databricks.com",
      token: "secret-token",
      catalog: "main",
      schema: "sales",
      maxFileSizeMb: 100,
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("delete refused for an active template", async () => {
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

    const current = await templateRepo.get(sampleArchivedTemplate.id);
    expect(current?.status).toBe("diarsipkan");
  });

  it("delete refused for a missing admin session", async () => {
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
          deletedBy: "Admin Budi",
        }),
      }
    );

    const res = await deleteRoute(req, {
      params: Promise.resolve({ id: sampleArchivedTemplate.id }),
    });
    expect(res.status).toBe(401);

    const current = await templateRepo.get(sampleArchivedTemplate.id);
    expect(current?.status).toBe("diarsipkan");
  });

  it("adopted volume does not call deleteVolume", async () => {
    let deleteVolumeCalled = false;
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      const urlStr = url.toString();
      if (init?.method === "DELETE" && urlStr.includes("/unity-catalog/volumes/")) {
        deleteVolumeCalled = true;
      }
      return new Response(JSON.stringify({ contents: [] }), { status: 200 });
    }) as typeof fetch;

    const adoptedTemplate: TemplateDefinition = {
      ...sampleArchivedTemplate,
      id: crypto.randomUUID(),
      name: "Template Adopsi",
      slug: "template_adopsi",
      volumeCreatedByApp: false,
    };
    await templateRepo.create(adoptedTemplate);

    const req = new Request(
      `http://localhost/api/templates/${adoptedTemplate.id}/delete`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `admin_session=${validToken}`,
        },
        body: JSON.stringify({
          confirmName: adoptedTemplate.name,
          deletedBy: "User Siti",
        }),
      }
    );

    const res = await deleteRoute(req, {
      params: Promise.resolve({ id: adoptedTemplate.id }),
    });
    expect(res.status).toBe(200);
    expect(deleteVolumeCalled).toBe(false);

    const updated = await templateRepo.get(adoptedTemplate.id);
    expect(updated?.status).toBe("dihapus");
    expect(updated?.deletedBy).toContain("User Siti");

    const versions = await versionRepo.listByTemplate(adoptedTemplate.id);
    expect(versions.length).toBe(1);
    expect(versions[0].changeSummary).toContain(
      "Folder penyimpanan tidak ikut dihapus karena tidak dibuat oleh aplikasi."
    );
  });

  it("app-created volume calls deleteVolume once and then marks the template deleted", async () => {
    let deleteVolumeCallCount = 0;
    let deletedVolumeFullName = "";

    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      const urlStr = url.toString();
      if (init?.method === "DELETE" && urlStr.includes("/unity-catalog/volumes/")) {
        deleteVolumeCallCount++;
        deletedVolumeFullName = urlStr;
        return new Response(null, { status: 200 });
      }
      if (urlStr.includes("/api/2.0/fs/directories")) {
        return new Response(
          JSON.stringify({
            contents: [{ path: "file1.csv", is_directory: false, file_size: 1024 }],
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as typeof fetch;

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
          confirmName: sampleArchivedTemplate.name,
          deletedBy: "User Budi",
        }),
      }
    );

    const res = await deleteRoute(req, {
      params: Promise.resolve({ id: sampleArchivedTemplate.id }),
    });
    expect(res.status).toBe(200);
    expect(deleteVolumeCallCount).toBe(1);
    expect(deletedVolumeFullName).toContain("main.sales.laporan_penjualan");

    const updated = await templateRepo.get(sampleArchivedTemplate.id);
    expect(updated?.status).toBe("dihapus");
    expect(updated?.deletedAt).toBeDefined();

    const versions = await versionRepo.listByTemplate(sampleArchivedTemplate.id);
    expect(versions.length).toBe(1);
    expect(versions[0].changeSummary).toContain(
      "Template dihapus permanen beserta folder penyimpanan"
    );
  });

  it("404 on deleteVolume is treated as success", async () => {
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      const urlStr = url.toString();
      if (init?.method === "DELETE" && urlStr.includes("/unity-catalog/volumes/")) {
        return new Response(
          JSON.stringify({ error_code: "NOT_FOUND", message: "Volume not found" }),
          { status: 404 }
        );
      }
      return new Response(JSON.stringify({ contents: [] }), { status: 200 });
    }) as typeof fetch;

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
          confirmName: sampleArchivedTemplate.name,
          deletedBy: "Admin",
        }),
      }
    );

    const res = await deleteRoute(req, {
      params: Promise.resolve({ id: sampleArchivedTemplate.id }),
    });
    expect(res.status).toBe(200);

    const updated = await templateRepo.get(sampleArchivedTemplate.id);
    expect(updated?.status).toBe("dihapus");
  });

  it("a 403 or a network error leaves the template unchanged", async () => {
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      const urlStr = url.toString();
      if (init?.method === "DELETE" && urlStr.includes("/unity-catalog/volumes/")) {
        return new Response(
          JSON.stringify({ error_code: "PERMISSION_DENIED" }),
          { status: 403 }
        );
      }
      return new Response(JSON.stringify({ contents: [] }), { status: 200 });
    }) as typeof fetch;

    await templateRepo.create(sampleArchivedTemplate);

    const req403 = new Request(
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

    const res403 = await deleteRoute(req403, {
      params: Promise.resolve({ id: sampleArchivedTemplate.id }),
    });
    expect(res403.status).toBe(403);

    let current = await templateRepo.get(sampleArchivedTemplate.id);
    expect(current?.status).toBe("diarsipkan");

    globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        throw new Error("Network connection dropped");
      }
      return new Response(JSON.stringify({ contents: [] }), { status: 200 });
    }) as typeof fetch;

    const reqNetwork = new Request(
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

    const resNetwork = await deleteRoute(reqNetwork, {
      params: Promise.resolve({ id: sampleArchivedTemplate.id }),
    });
    expect(resNetwork.status).toBe(500);

    current = await templateRepo.get(sampleArchivedTemplate.id);
    expect(current?.status).toBe("diarsipkan");
  });

  it("slug can be reused after deletion", async () => {
    const original = await templateRepo.create(sampleArchivedTemplate);
    expect(await templateRepo.getBySlug(original.slug)).toBeDefined();

    await templateRepo.markDeleted(original.id, "Admin Budi");
    expect(await templateRepo.getBySlug(original.slug)).toBeNull();

    const activeList = await templateRepo.list();
    expect(activeList.some((t) => t.id === original.id)).toBe(false);

    const newTemplate: TemplateDefinition = {
      ...sampleArchivedTemplate,
      id: crypto.randomUUID(),
      name: "Laporan Penjualan Baru",
      slug: sampleArchivedTemplate.slug,
      status: "aktif",
    };

    const recreated = await templateRepo.create(newTemplate);
    expect(recreated.id).toBe(newTemplate.id);
    expect(recreated.slug).toBe(sampleArchivedTemplate.slug);

    const fetchedBySlug = await templateRepo.getBySlug(sampleArchivedTemplate.slug);
    expect(fetchedBySlug?.id).toBe(newTemplate.id);
  });

  it("the preview counts files and reports the capped flag", async () => {
    globalThis.fetch = (async (url: string | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes("/api/2.0/fs/directories")) {
        if (!urlStr.includes("page_token")) {
          const files = Array.from({ length: 3000 }, (_, i) => ({
            path: `csv/file_${i}.csv`,
            is_directory: false,
            file_size: 100,
          }));
          return new Response(
            JSON.stringify({ contents: files, next_page_token: "page2" }),
            { status: 200 }
          );
        } else {
          const files = Array.from({ length: 2500 }, (_, i) => ({
            path: `csv/file_${i + 3000}.csv`,
            is_directory: false,
            file_size: 100,
          }));
          return new Response(JSON.stringify({ contents: files }), { status: 200 });
        }
      }
      return new Response(JSON.stringify({ contents: [] }), { status: 200 });
    }) as typeof fetch;

    const client = createDatabricksClient(
      "https://dbc-test.cloud.databricks.com",
      "valid-token"
    );

    const summary = await client.listVolumeContents("laporan_penjualan", "main", "sales");
    expect(summary.success).toBe(true);
    expect(summary.data?.capped).toBe(true);
    expect(summary.data?.totalFiles).toBe(5000);
    expect(summary.data?.totalSize).toBe(500000);

    await templateRepo.create(sampleArchivedTemplate);
    const reqPreview = new Request(
      `http://localhost/api/templates/${sampleArchivedTemplate.id}/delete-preview`,
      {
        method: "GET",
        headers: {
          cookie: `admin_session=${validToken}`,
        },
      }
    );

    const previewRes = await deletePreviewRoute(reqPreview, {
      params: Promise.resolve({ id: sampleArchivedTemplate.id }),
    });
    expect(previewRes.status).toBe(200);

    const previewData = await previewRes.json();
    expect(previewData.volumeOwnedByApp).toBe(true);
    expect(previewData.capped).toBe(true);
  });
});
