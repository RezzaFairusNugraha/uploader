import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { parquetWriteBuffer } from "hyparquet-writer";
import { POST as uploadRoute } from "@/app/api/upload/route";
import { FakeInMemorySettingsStore, setSettingsStore } from "@/lib/settings";
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
  let templateRepo: FakeInMemoryTemplateRepository;
  let settingsStore: FakeInMemorySettingsStore;
  let logRepo: FakeInMemoryUploadLogRepository;
  const dummyKey = Buffer.from("01234567890123456789012345678901", "utf8");

  beforeEach(() => {
    templateRepo = new FakeInMemoryTemplateRepository();
    setTemplateRepository(templateRepo);

    settingsStore = new FakeInMemorySettingsStore(dummyKey);
    setSettingsStore(settingsStore);

    logRepo = new FakeInMemoryUploadLogRepository();
    setUploadLogRepository(logRepo);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("File Name Builder & Path Sanitization", () => {
    it("membersihkan nama file dari karakter terlarang dan path traversal", () => {
      expect(sanitizeFileName("Target Brand Distribution.csv")).toBe(
        "Target_Brand_Distribution.csv"
      );
      expect(sanitizeFileName("file with $pecial #chars!.csv")).toBe(
        "file_with__pecial__chars_.csv"
      );
      expect(sanitizeFileName("../../etc/passwd.csv")).toBe("passwd.csv");
      expect(sanitizeFileName("..\\..\\secret\\data.csv")).toBe("data.csv");
      expect(sanitizeFileName("/var/log/upload.csv")).toBe("upload.csv");
    });

    it("membangun nama file destinasi dengan format {yyyyMMdd-HHmmss}__{sanitizedOriginalName}.{ext}", () => {
      const fixedDate = new Date("2026-10-21T08:15:30Z");
      const name = buildDestinationFileName(
        "transaksi_harian",
        "../../Laporan Bulanan.csv",
        fixedDate
      );
      const ts = formatTimestamp(fixedDate);
      expect(name).toBe(`${ts}__Laporan_Bulanan.csv`);
    });

    it("membangun path volume lengkap /Volumes/<catalog>/<schema>/<slug>/csv/ atau parquet/", () => {
      const volumePathCsv = buildVolumePath(
        "main_cat",
        "sales_schema",
        "transaksi_harian",
        "csv",
        "20261021-081530__data.csv"
      );
      expect(volumePathCsv).toBe(
        "/Volumes/main_cat/sales_schema/transaksi_harian/csv/20261021-081530__data.csv"
      );

      const volumePathParquet = buildVolumePath(
        "main_cat",
        "sales_schema",
        "transaksi_harian",
        "parquet",
        "20261021-081530__data.parquet"
      );
      expect(volumePathParquet).toBe(
        "/Volumes/main_cat/sales_schema/transaksi_harian/parquet/20261021-081530__data.parquet"
      );
    });
  });

  describe("Endpoint Server POST /api/upload", () => {
    const setupValidSettings = async (maxFileSizeMb: number = 5) => {
      await settingsStore.save({
        workspaceUrl: "https://dbc-test.cloud.databricks.com",
        token: "test-token-valid",
        catalog: "main",
        schema: "sales",
        maxFileSizeMb,
      });
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
      expect(data.error).toBe("Berkas dan template wajib disertakan");
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
      expect(data.error).toContain("Koneksi ke penyimpanan data belum lengkap");
    });

    it("menolak template jika statusnya bukan 'aktif'", async () => {
      await setupValidSettings();
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
      await setupValidSettings();
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

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.destinationPath).toContain(
        "/Volumes/main/sales/transaksi_toko/csv/"
      );
      expect(data.destinationPath).toContain("__data_transaksi.csv");

      expect(capturedMethod).toBe("PUT");
      expect(capturedUrl).toContain("/api/2.0/fs/files/Volumes/main/sales/transaksi_toko/csv/");
      expect(capturedUrl).toContain("?overwrite=false");
      expect(capturedBody).not.toBeNull();
      if (capturedBody) {
        expect(Buffer.compare(Buffer.from(capturedBody), Buffer.from(fileBytes))).toBe(0);
      }

      const logs = await logRepo.listByTemplate(tpl.id);
      expect(logs.length).toBe(1);
      expect(logs[0].status).toBe("berhasil");
      expect(logs[0].originalName).toBe("data_transaksi.csv");
    });

    it("berhasil memvalidasi dan meneruskan berkas Parquet valid ke folder parquet/ serta mencatat log", async () => {
      await setupValidSettings();
      const tpl = await createTestTemplate("aktif");

      const parquetBuffer = new Uint8Array(
        parquetWriteBuffer({
          columnData: [
            { name: "id_outlet", data: ["1234", "5678"] },
            { name: "total_rupiah", data: [1500, 3000] },
          ],
        })
      );

      let capturedUrl = "";
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        capturedUrl = String(input);
        return new Response("{}", { status: 200 });
      }) as unknown as typeof fetch;

      const formData = new FormData();
      formData.append(
        "file",
        new File([parquetBuffer], "outlet.parquet")
      );
      formData.append("templateId", tpl.id);

      const request = new Request("http://localhost:3000/api/upload", {
        method: "POST",
        body: formData,
      });

      const response = await uploadRoute(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.destinationPath).toContain(
        "/Volumes/main/sales/transaksi_toko/parquet/"
      );
      expect(capturedUrl).toContain("/Volumes/main/sales/transaksi_toko/parquet/");

      const logs = await logRepo.listByTemplate(tpl.id);
      expect(logs.length).toBe(1);
      expect(logs[0].format).toBe("parquet");
    });

    it("menolak berkas yang tidak valid dengan status 422 dan daftar error", async () => {
      await setupValidSettings();
      const tpl = await createTestTemplate("aktif");

      const invalidContent = "id_outlet;total_rupiah\r\n12;50\r\n";
      const formData = new FormData();
      formData.append(
        "file",
        new File([invalidContent], "salah.csv")
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

    it("mencegah path traversal pada nama berkas yang diunggah", async () => {
      await setupValidSettings();
      const tpl = await createTestTemplate("aktif");

      const validContent = "id_outlet;total_rupiah\r\n1234;500\r\n";

      globalThis.fetch = (async () => {
        return new Response("{}", { status: 200 });
      }) as unknown as typeof fetch;

      const formData = new FormData();
      formData.append(
        "file",
        new File([validContent], "../../etc/passwd.csv")
      );
      formData.append("templateId", tpl.id);

      const request = new Request("http://localhost:3000/api/upload", {
        method: "POST",
        body: formData,
      });

      const response = await uploadRoute(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.destinationPath).toContain(
        "/Volumes/main/sales/transaksi_toko/csv/"
      );
      expect(data.destinationPath).not.toContain("..");
      expect(data.destinationPath).toContain("__passwd.csv");
    });

    it("menolak berkas yang melebihi batas ukuran pengaturan", async () => {
      await setupValidSettings(1);
      const tpl = await createTestTemplate("aktif");

      const largeContent = "a".repeat(2 * 1024 * 1024);
      const formData = new FormData();
      formData.append("file", new File([largeContent], "data.csv"));
      formData.append("templateId", tpl.id);

      const request = new Request("http://localhost:3000/api/upload", {
        method: "POST",
        body: formData,
      });

      const response = await uploadRoute(request);
      expect(response.status).toBe(422);

      const data = await response.json();
      expect(
        data.errors.some((e: { code: string }) => e.code === "FILE_TOO_LARGE")
      ).toBe(true);
    });
  });
});
