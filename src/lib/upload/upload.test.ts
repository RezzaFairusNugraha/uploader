import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { parquetWriteBuffer } from "hyparquet-writer";
import { POST as uploadRoute } from "@/app/api/upload/route";
import { USER_COPY } from "@/lib/copy";
import {
  FakeInMemoryTemplateRepository,
  setTemplateRepository,
} from "@/lib/templates/repository";
import type { TemplateDefinition } from "@/lib/templates/schema";
import {
  FakeInMemoryUploadLogRepository,
  setUploadLogRepository,
} from "./log";
import {
  buildDestinationFileName,
  buildVolumePath,
  formatTimestamp,
  sanitizeFileName,
} from "./filename";

describe("Upload Flow & Forwarding ke Databricks Volume", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  let templateRepo: FakeInMemoryTemplateRepository;
  let logRepo: FakeInMemoryUploadLogRepository;

  beforeEach(() => {
    templateRepo = new FakeInMemoryTemplateRepository();
    setTemplateRepository(templateRepo);

    logRepo = new FakeInMemoryUploadLogRepository();
    setUploadLogRepository(logRepo);

    delete process.env.DATABRICKS_HOST;
    delete process.env.DATABRICKS_TOKEN;
    delete process.env.DATABRICKS_CATALOG;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  describe("File Name Builder & Path Sanitization", () => {
    it("membersihkan nama file dari karakter terlarang dan path traversal", () => {
      expect(sanitizeFileName("Target Brand Distribution.csv")).toBe(
        "Target_Brand_Distribution.csv"
      );
      expect(sanitizeFileName("file with $pecial #chars!.csv")).toBe(
        "file_with__pecial__chars_.csv"
      );
      expect(sanitizeFileName("../../../secret/data.csv")).toBe(
        "data.csv"
      );
    });

    it("membuat nama file tujuan dengan format {YYYYMMDD-HHmmss}__{original}", () => {
      const fixedDate = new Date("2026-10-24T15:30:45Z");
      const formattedTs = formatTimestamp(fixedDate);
      const destName = buildDestinationFileName(
        "target_brand",
        "laporan bulanan.csv",
        fixedDate
      );

      expect(destName).toBe(
        `${formattedTs}__laporan_bulanan.csv`
      );
      expect(destName).toMatch(
        /^\d{8}-\d{6}__laporan_bulanan\.csv$/
      );
    });

    it("membangun path volume lengkap Unity Catalog", () => {
      const pathCsv = buildVolumePath(
        "main",
        "sales",
        "transaksi_toko",
        "csv",
        "transaksi_20261024_data.csv"
      );
      expect(pathCsv).toBe(
        "/Volumes/main/sales/transaksi_toko/csv/transaksi_20261024_data.csv"
      );

      const pathParquet = buildVolumePath(
        "main",
        "sales",
        "transaksi_toko",
        "parquet",
        "transaksi_20261024_data.parquet"
      );
      expect(pathParquet).toBe(
        "/Volumes/main/sales/transaksi_toko/parquet/transaksi_20261024_data.parquet"
      );
    });
  });

  describe("Endpoint Server POST /api/upload", () => {
    const setupValidSettings = (maxFileSizeMb: number = 5) => {
      process.env.DATABRICKS_HOST = "https://dbc-test.cloud.databricks.com";
      process.env.DATABRICKS_TOKEN = "test-token-valid";
      process.env.DATABRICKS_CATALOG = "main";
      process.env.MAX_UPLOAD_MB = String(maxFileSizeMb);
    };

    const createTestTemplate = async (
      status: "aktif" | "membuat" | "diarsipkan" | "gagal" = "aktif"
    ): Promise<TemplateDefinition> => {
      const tpl: TemplateDefinition = {
        id: "4fa85f64-5717-4562-b3fc-2c963f66afa7",
        name: "Transaksi Toko",
        slug: "transaksi_toko",
        description: "Template transaksi",
        delimiter: ";",
        status,
        version: 1,
        volume: { catalog: "main", schema: "sales", name: "transaksi_toko" },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        columns: [
          {
            name: "id_outlet",
            required: true,
            rule: { type: "digits", length: 4 },
          },
          {
            name: "total_rupiah",
            required: true,
            rule: { type: "integer", min: 100 },
          },
        ],
      };
      await templateRepo.create(tpl);
      return tpl;
    };

    it("menolak jika berkas atau templateId tidak disertakan", async () => {
      const formData = new FormData();
      const request = new Request("http://localhost:3000/api/upload", {
        method: "POST",
        body: formData,
      });

      const response = await uploadRoute(request);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Template wajib dipilih");
    });

    it("menolak berkas jika pengaturan Databricks belum dikonfigurasi", async () => {
      const tpl = await createTestTemplate("aktif");
      const formData = new FormData();
      formData.append(
        "file",
        new File(["id_outlet;total_rupiah\r\n1234;500\r\n"], "test.csv")
      );
      formData.append("templateId", tpl.id);

      const request = new Request("http://localhost:3000/api/upload", {
        method: "POST",
        body: formData,
      });

      const response = await uploadRoute(request);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe(USER_COPY.connection.notConnected);
    });

    it("menolak template jika statusnya bukan 'aktif'", async () => {
      setupValidSettings();
      const draftTpl = await createTestTemplate("membuat");

      const formData = new FormData();
      formData.append(
        "file",
        new File(["id_outlet;total_rupiah\r\n1234;500\r\n"], "test.csv")
      );
      formData.append("templateId", draftTpl.id);

      const request = new Request("http://localhost:3000/api/upload", {
        method: "POST",
        body: formData,
      });

      const response = await uploadRoute(request);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Template belum aktif atau telah diarsipkan");
    });

    it("berhasil memvalidasi dan meneruskan berkas CSV valid serta mencatat log upload", async () => {
      setupValidSettings();
      const tpl = await createTestTemplate("aktif");

      const validContent = "id_outlet;total_rupiah\r\n1234;5000\r\n5678;25000\r\n";
      const fileBytes = new TextEncoder().encode(validContent);

      let capturedUrl = "";
      let capturedMethod = "";
      let capturedBody: Uint8Array | null = null;

      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        capturedUrl = String(input);
        capturedMethod = init?.method || "";
        if (init?.body instanceof Uint8Array) {
          capturedBody = init.body;
        }
        return new Response("{}", { status: 200 });
      }) as unknown as typeof fetch;

      const formData = new FormData();
      formData.append(
        "file",
        new File([fileBytes], "data_transaksi.csv")
      );
      formData.append("templateId", tpl.id);

      const request = new Request("http://localhost:3000/api/upload", {
        method: "POST",
        body: formData,
      });

      const response = await uploadRoute(request);
      expect(response.status).toBe(200);

      expect(capturedMethod).toBe("PUT");
      expect(capturedUrl).toContain(
        "/api/2.0/fs/files/Volumes/main/sales/transaksi_toko/csv/"
      );
      expect(capturedUrl).toContain("data_transaksi.csv");
      expect(capturedBody).toEqual(fileBytes);

      const logs = await logRepo.listRecent();
      expect(logs.length).toBe(1);
      expect(logs[0].status).toBe("berhasil");
      expect(logs[0].rowCount).toBe(2);
      expect(logs[0].format).toBe("csv");
    });

    it("menolak berkas CSV dengan data tidak valid dan mencatat log gagal", async () => {
      setupValidSettings();
      const tpl = await createTestTemplate("aktif");

      const invalidContent = "id_outlet;total_rupiah\r\n12;50\r\n";
      const fileBytes = new TextEncoder().encode(invalidContent);

      const formData = new FormData();
      formData.append(
        "file",
        new File([fileBytes], "transaksi_salah.csv")
      );
      formData.append("templateId", tpl.id);

      const request = new Request("http://localhost:3000/api/upload", {
        method: "POST",
        body: formData,
      });

      const response = await uploadRoute(request);
      expect(response.status).toBe(422);
      const data = await response.json();
      expect(data.error).toBe("Validasi berkas gagal");
      expect(data.errors.length).toBeGreaterThan(0);
    });

    it("berhasil memvalidasi dan mengunggah berkas Parquet ke subfolder parquet/", async () => {
      setupValidSettings();
      const tpl = await createTestTemplate("aktif");

      const parquetBuffer = parquetWriteBuffer({
        columnData: [
          { name: "id_outlet", data: ["1111", "2222"] },
          { name: "total_rupiah", data: [500, 1500] },
        ],
      });

      let capturedUrl = "";
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        capturedUrl = String(input);
        return new Response("{}", { status: 200 });
      }) as unknown as typeof fetch;

      const formData = new FormData();
      formData.append(
        "file",
        new File([parquetBuffer], "data.parquet")
      );
      formData.append("templateId", tpl.id);

      const request = new Request("http://localhost:3000/api/upload", {
        method: "POST",
        body: formData,
      });

      const response = await uploadRoute(request);
      expect(response.status).toBe(200);
      expect(capturedUrl).toContain(
        "/api/2.0/fs/files/Volumes/main/sales/transaksi_toko/parquet/"
      );
      expect(capturedUrl).toContain("data.parquet");

      const logs = await logRepo.listRecent();
      expect(logs.length).toBe(1);
      expect(logs[0].status).toBe("berhasil");
      expect(logs[0].format).toBe("parquet");
    });
  });
});
