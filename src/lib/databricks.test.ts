import { afterEach, describe, expect, it } from "bun:test";
import { createDatabricksClient, runConnectionTest } from "./databricks";

describe("Databricks Client & Connection Test", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("Pemetaan Kesalahan Klien Databricks", () => {
    it("menangani kode status 200", async () => {
      globalThis.fetch = (async () =>
        new Response(JSON.stringify({ files: [] }), {
          status: 200,
        })) as unknown as typeof fetch;

      const client = createDatabricksClient(
        "https://dbc-test.cloud.databricks.com",
        "fake-token"
      );
      const result = await client.checkDirectory("/Volumes/main/sales/files");
      expect(result.success).toBe(true);
    });

    it("menangani kode status 401 sebagai token tidak valid atau kedaluwarsa", async () => {
      globalThis.fetch = (async () =>
        new Response("Unauthorized", {
          status: 401,
        })) as unknown as typeof fetch;

      const client = createDatabricksClient(
        "https://dbc-test.cloud.databricks.com",
        "fake-token"
      );
      const result = await client.checkDirectory("/Volumes/main/sales/files");
      expect(result.success).toBe(false);
      expect(result.error).toBe("Token tidak valid atau kedaluwarsa");
    });

    it("menangani kode status 403 sebagai izin kurang", async () => {
      globalThis.fetch = (async () =>
        new Response("Forbidden", { status: 403 })) as unknown as typeof fetch;

      const client = createDatabricksClient(
        "https://dbc-test.cloud.databricks.com",
        "fake-token"
      );
      const result = await client.checkDirectory("/Volumes/main/sales/files");
      expect(result.success).toBe(false);
      expect(result.error).toBe(
        "Izin kurang (butuh READ VOLUME dan WRITE VOLUME)"
      );
    });

    it("menangani kode status 404 sebagai path tidak ditemukan", async () => {
      globalThis.fetch = (async () =>
        new Response("Not Found", { status: 404 })) as unknown as typeof fetch;

      const client = createDatabricksClient(
        "https://dbc-test.cloud.databricks.com",
        "fake-token"
      );
      const result = await client.checkDirectory("/Volumes/main/sales/files");
      expect(result.success).toBe(false);
      expect(result.error).toBe("Path tidak ditemukan");
    });

    it("menangani kegagalan jaringan sebagai host tidak terjangkau", async () => {
      globalThis.fetch = (async () => {
        throw new Error("Network connection failed");
      }) as unknown as typeof fetch;

      const client = createDatabricksClient(
        "https://dbc-test.cloud.databricks.com",
        "fake-token"
      );
      const result = await client.checkDirectory("/Volumes/main/sales/files");
      expect(result.success).toBe(false);
      expect(result.error).toBe("Host tidak terjangkau");
    });
  });

  describe("Uji Koneksi Read-Only Bertahap", () => {
    it("berhasil melewati keempat langkah jika semua direktori tersedia", async () => {
      globalThis.fetch = (async () =>
        new Response("{}", { status: 200 })) as unknown as typeof fetch;

      const result = await runConnectionTest({
        workspaceUrl: "https://dbc-test.cloud.databricks.com",
        token: "fake-token",
        catalog: "main",
        schema: "sales",
        volume: "files",
        subfolderCsv: "csv",
        subfolderParquet: "parquet",
        maxFileSizeMb: 100,
      });

      expect(result.success).toBe(true);
      expect(result.steps.length).toBe(4);
      expect(result.steps.every((s) => s.success)).toBe(true);
    });

    it("menghentikan langkah selanjutnya jika host tidak terjangkau", async () => {
      globalThis.fetch = (async () => {
        throw new Error("ENOTFOUND");
      }) as unknown as typeof fetch;

      const result = await runConnectionTest({
        workspaceUrl: "https://dbc-test.cloud.databricks.com",
        token: "fake-token",
        catalog: "main",
        schema: "sales",
        volume: "files",
        subfolderCsv: "csv",
        subfolderParquet: "parquet",
        maxFileSizeMb: 100,
      });

      expect(result.success).toBe(false);
      expect(result.steps[0].success).toBe(false);
      expect(result.steps[0].message).toBe("Host tidak terjangkau");
      expect(result.steps[1].success).toBe(false);
      expect(result.steps[1].message).toBe("Pemeriksaan dilewati");
    });

    it("mendeteksi jika subfolder CSV tidak ditemukan", async () => {
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/csv")) {
          return new Response("Not Found", { status: 404 });
        }
        return new Response("{}", { status: 200 });
      }) as unknown as typeof fetch;

      const result = await runConnectionTest({
        workspaceUrl: "https://dbc-test.cloud.databricks.com",
        token: "fake-token",
        catalog: "main",
        schema: "sales",
        volume: "files",
        subfolderCsv: "csv",
        subfolderParquet: "parquet",
        maxFileSizeMb: 100,
      });

      expect(result.success).toBe(false);
      expect(result.steps[0].success).toBe(true);
      expect(result.steps[1].success).toBe(true);
      expect(result.steps[2].success).toBe(false);
      expect(result.steps[2].fix).toContain("Buat folder 'csv'");
      expect(result.steps[3].success).toBe(true);
    });
  });
});
