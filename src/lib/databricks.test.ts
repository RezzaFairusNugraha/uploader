import { afterEach, describe, expect, it } from "bun:test";
import { createDatabricksClient, runConnectionTest } from "./databricks";

describe("Databricks Client & Connection Test", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("Fungsi Klien Databricks & Mock Fetch", () => {
    const client = createDatabricksClient(
      "https://dbc-test.cloud.databricks.com",
      "dapi-test-token"
    );

    it("getSchema: berhasil mengambil schema saat status 200", async () => {
      globalThis.fetch = (async (url) => {
        expect(String(url)).toContain(
          "/api/2.1/unity-catalog/schemas/main.sales"
        );
        return new Response(
          JSON.stringify({ name: "sales", catalog_name: "main" }),
          { status: 200 }
        );
      }) as unknown as typeof fetch;

      const res = await client.getSchema("main", "sales");
      expect(res.success).toBe(true);
      expect(res.data?.name).toBe("sales");
    });

    it("getSchema: menangani 404 sebagai katalog atau skema tidak ditemukan", async () => {
      globalThis.fetch = (async () =>
        new Response("Not Found", { status: 404 })) as unknown as typeof fetch;

      const res = await client.getSchema("unknown_cat", "unknown_schema");
      expect(res.success).toBe(false);
      expect(res.error).toBe("Katalog atau skema tidak ditemukan");
    });

    it("getVolume: berhasil mengambil volume saat status 200", async () => {
      globalThis.fetch = (async (url) => {
        expect(String(url)).toContain(
          "/api/2.1/unity-catalog/volumes/main.sales.my_vol"
        );
        return new Response(
          JSON.stringify({
            name: "my_vol",
            catalog_name: "main",
            schema_name: "sales",
            volume_type: "MANAGED",
          }),
          { status: 200 }
        );
      }) as unknown as typeof fetch;

      const res = await client.getVolume("main", "sales", "my_vol");
      expect(res.success).toBe(true);
      expect(res.data?.name).toBe("my_vol");
    });

    it("getVolume: menangani 404 sebagai volume tidak ditemukan", async () => {
      globalThis.fetch = (async () =>
        new Response("Not Found", { status: 404 })) as unknown as typeof fetch;

      const res = await client.getVolume("main", "sales", "not_exist");
      expect(res.success).toBe(false);
      expect(res.error).toBe("Volume tidak ditemukan");
    });

    it("createVolume: berhasil membuat volume dengan status 200/201", async () => {
      let capturedBody: { volume_type?: string; name?: string } | null = null;
      globalThis.fetch = (async (_url, init) => {
        capturedBody = JSON.parse(init?.body as string);
        return new Response(
          JSON.stringify({
            name: "new_vol",
            catalog_name: "main",
            schema_name: "sales",
            volume_type: "MANAGED",
          }),
          { status: 200 }
        );
      }) as unknown as typeof fetch;

      const res = await client.createVolume("main", "sales", "new_vol");
      expect(res.success).toBe(true);
      expect(capturedBody.volume_type).toBe("MANAGED");
      expect(capturedBody.name).toBe("new_vol");
    });

    it("createVolume: idempoten saat status 409 (volume sudah ada)", async () => {
      globalThis.fetch = (async () =>
        new Response(JSON.stringify({ message: "Volume already exists" }), {
          status: 409,
        })) as unknown as typeof fetch;

      const res = await client.createVolume("main", "sales", "existing_vol");
      expect(res.success).toBe(true);
      expect(res.status).toBe(409);
    });

    it("createVolume: 403 dipetakan dengan izin CREATE VOLUME, USE CATALOG, dan USE SCHEMA", async () => {
      globalThis.fetch = (async () =>
        new Response("Forbidden", { status: 403 })) as unknown as typeof fetch;

      const res = await client.createVolume("main", "sales", "no_perm_vol");
      expect(res.success).toBe(false);
      expect(res.error).toContain("CREATE VOLUME");
      expect(res.error).toContain("USE CATALOG");
      expect(res.error).toContain("USE SCHEMA");
    });

    it("createDirectory: idempoten dan berhasil saat 200 atau 409", async () => {
      globalThis.fetch = (async () =>
        new Response("{}", { status: 200 })) as unknown as typeof fetch;

      const res = await client.createDirectory("/Volumes/main/sales/v/csv");
      expect(res.success).toBe(true);

      globalThis.fetch = (async () =>
        new Response("Directory exists", { status: 409 })) as unknown as typeof fetch;

      const res409 = await client.createDirectory("/Volumes/main/sales/v/csv");
      expect(res409.success).toBe(true);
    });

    it("menangani token 401 dan kegagalan jaringan secara aman tanpa membocorkan token", async () => {
      globalThis.fetch = (async () =>
        new Response("Unauthorized", { status: 401 })) as unknown as typeof fetch;

      const res401 = await client.checkDirectory("/Volumes/main/sales/files");
      expect(res401.success).toBe(false);
      expect(res401.error).toBe("Token tidak valid atau kedaluwarsa");

      globalThis.fetch = (async () => {
        throw new Error("Network offline");
      }) as unknown as typeof fetch;

      const resNetwork = await client.checkDirectory("/Volumes/main/sales/files");
      expect(resNetwork.success).toBe(false);
      expect(resNetwork.error).toContain("Host tidak terjangkau");
    });

    it("deleteSchema: tidak pernah mengirim parameter force", async () => {
      let calledUrl = "";
      let calledBody: unknown = undefined;
      globalThis.fetch = (async (url, init) => {
        calledUrl = String(url);
        calledBody = init?.body;
        return new Response(null, { status: 200 });
      }) as unknown as typeof fetch;

      const res = await client.deleteSchema("main.my_schema");
      expect(res.success).toBe(true);
      expect(calledUrl).toContain("/api/2.1/unity-catalog/schemas/main.my_schema");
      expect(calledUrl).not.toContain("force");
      expect(calledBody).toBeUndefined();
    });
  });

  describe("Uji Koneksi Read-Only (runConnectionTest)", () => {
    const dummySettings = {
      workspaceUrl: "https://dbc-test.cloud.databricks.com",
      token: "valid-secret-token",
      catalog: "main",
      maxFileSizeMb: 100,
    };

    it("berhasil melewati semua tahap dan menyertakan catatan izin membuat folder baru", async () => {
      globalThis.fetch = (async (url) => {
        const str = String(url);
        if (str.includes("/catalogs/main")) {
          return new Response(JSON.stringify({ name: "main" }), {
            status: 200,
          });
        }
        if (str.includes("/schemas?")) {
          return new Response(JSON.stringify({ schemas: [] }), {
            status: 200,
          });
        }
        return new Response("Not Found", { status: 404 });
      }) as unknown as typeof fetch;

      const result = await runConnectionTest(dummySettings);
      expect(result.success).toBe(true);
      expect(result.steps.length).toBe(3);
      expect(result.steps[0].success).toBe(true);
      expect(result.steps[1].success).toBe(true);
      expect(result.steps[2].success).toBe(true);
      expect(result.steps[2].message).toBe(
        "Izin membuat folder baru baru terbukti saat template pertama dibuat."
      );
    });

    it("menghentikan langkah berikutnya jika token 401", async () => {
      globalThis.fetch = (async () =>
        new Response("Unauthorized", { status: 401 })) as unknown as typeof fetch;

      const result = await runConnectionTest(dummySettings);
      expect(result.success).toBe(false);
      expect(result.steps[0].success).toBe(false);
      expect(result.steps[1].message).toBe("Pemeriksaan dilewati");
      expect(result.steps[2].message).toBe("Pemeriksaan dilewati");
    });

    it("menghentikan langkah jika katalog/skema 404", async () => {
      globalThis.fetch = (async () =>
        new Response("Not Found", { status: 404 })) as unknown as typeof fetch;

      const result = await runConnectionTest(dummySettings);
      expect(result.success).toBe(false);
      expect(result.steps[0].success).toBe(true);
      expect(result.steps[1].success).toBe(false);
      expect(result.steps[1].message).toBe("Katalog atau skema tidak ditemukan");
      expect(result.steps[2].message).toBe("Pemeriksaan dilewati");
    });
  });
});
