import { describe, expect, it } from "bun:test";
import { parquetWriteBuffer } from "hyparquet-writer";
import type { TemplateDefinition } from "../templates/schema";
import { validateFile } from "./index";

describe("Validation Engine - Dynamic Template Definition", () => {
  const baseTemplate: TemplateDefinition = {
    id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    name: "Master Transaksi",
    slug: "master_transaksi",
    description: "Template transaksi utama",
    delimiter: ";",
    status: "aktif",
    version: 1,
    volume: { catalog: "main", schema: "sales", name: "master_transaksi" },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    columns: [
      {
        name: "kode_outlet",
        required: true,
        rule: { type: "digits", length: 6 },
      },
      {
        name: "jumlah_item",
        required: true,
        rule: { type: "integer", min: 1, max: 100 },
      },
      {
        name: "nominal_rupiah",
        required: true,
        rule: {
          type: "decimal",
          allowComma: true,
          allowDot: true,
          allowScientific: true,
          allowedText: ["FREE_TRIAL", "N/A"],
          min: 0,
        },
      },
      {
        name: "tgl_transaksi",
        required: true,
        rule: { type: "date", format: "yyyy-MM-dd" },
      },
      {
        name: "status_bayar",
        required: true,
        rule: { type: "list", values: ["LUNAS", "PENDING", "BATAL"] },
      },
      {
        name: "catatan",
        required: false,
        rule: {
          type: "text",
          minLength: 3,
          maxLength: 50,
          allowedValues: ["Reguler", "Promo", "Khusus"],
        },
      },
    ],
  };

  const toInput = (name: string, content: string | Uint8Array) => {
    const bytes =
      typeof content === "string"
        ? new TextEncoder().encode(content)
        : content;
    return {
      name,
      size: bytes.length,
      bytes,
    };
  };

  describe("Aturan Berkas Dasar & Ekstensi", () => {
    it("menolak berkas Excel .xlsx dengan pesan panduan ramah", async () => {
      const input = toInput("transaksi.xlsx", "mock");
      const res = await validateFile(input, baseTemplate);
      expect(res.ok).toBe(false);
      expect(res.errors[0].code).toBe("EXCEL_FILE_UPLOADED");
      expect(res.errors[0].message).toContain("Simpan file sebagai CSV");
    });

    it("menolak berkas Excel .xls dengan pesan panduan ramah", async () => {
      const input = toInput("transaksi.xls", "mock");
      const res = await validateFile(input, baseTemplate);
      expect(res.ok).toBe(false);
      expect(res.errors[0].code).toBe("EXCEL_FILE_UPLOADED");
    });

    it("menolak ekstensi yang tidak didukung", async () => {
      const input = toInput("transaksi.txt", "mock");
      const res = await validateFile(input, baseTemplate);
      expect(res.ok).toBe(false);
      expect(res.errors[0].code).toBe("INVALID_EXTENSION");
    });

    it("menolak berkas kosong", async () => {
      const input = toInput("transaksi.csv", new Uint8Array([]));
      const res = await validateFile(input, baseTemplate);
      expect(res.ok).toBe(false);
      expect(res.errors[0].code).toBe("EMPTY_FILE");
    });

    it("menolak berkas dengan pengodean UTF-8 yang tidak valid", async () => {
      const input = toInput("transaksi.csv", new Uint8Array([0xff, 0xfe, 0xff]));
      const res = await validateFile(input, baseTemplate);
      expect(res.ok).toBe(false);
      expect(res.errors[0].code).toBe("INVALID_UTF8");
    });

    it("memberikan peringatan BOM UTF-8 namun tetap memproses validasi berkas", async () => {
      const csv =
        "\uFEFFkode_outlet;jumlah_item;nominal_rupiah;tgl_transaksi;status_bayar;catatan\r\n" +
        "123456;10;50000;2026-05-12;LUNAS;Reguler\r\n";
      const input = toInput("transaksi.csv", csv);
      const res = await validateFile(input, baseTemplate);
      expect(res.ok).toBe(true);
      expect(res.warnings.some((w) => w.code === "BOM_PRESENT")).toBe(true);
    });

    it("menolak berkas jika delimiter yang terdeteksi tidak sama dengan template", async () => {
      const csv =
        "kode_outlet,jumlah_item,nominal_rupiah,tgl_transaksi,status_bayar,catatan\r\n" +
        "123456,10,50000,2026-05-12,LUNAS,Reguler\r\n";
      const input = toInput("transaksi.csv", csv);
      const res = await validateFile(input, baseTemplate);
      expect(res.ok).toBe(false);
      expect(res.errors[0].code).toBe("DELIMITER_MISMATCH");
    });
  });

  describe("Struktur Header dan Baris CSV", () => {
    it("menolak berkas tanpa baris data (hanya header)", async () => {
      const csv = "kode_outlet;jumlah_item;nominal_rupiah;tgl_transaksi;status_bayar;catatan\r\n";
      const input = toInput("transaksi.csv", csv);
      const res = await validateFile(input, baseTemplate);
      expect(res.ok).toBe(false);
      expect(res.errors[0].code).toBe("NO_DATA_ROWS");
    });

    it("menolak jika ada kolom template yang hilang", async () => {
      const csv = "kode_outlet;jumlah_item;nominal_rupiah;status_bayar\r\n123456;10;50000;LUNAS\r\n";
      const input = toInput("transaksi.csv", csv);
      const res = await validateFile(input, baseTemplate);
      expect(res.ok).toBe(false);
      expect(res.errors.some((e) => e.code === "MISSING_COLUMN")).toBe(true);
    });

    it("menolak jika ada kolom asing tambahan yang tidak dikenal", async () => {
      const csv =
        "kode_outlet;jumlah_item;nominal_rupiah;tgl_transaksi;status_bayar;catatan;kolom_asing\r\n" +
        "123456;10;50000;2026-05-12;LUNAS;Reguler;extra\r\n";
      const input = toInput("transaksi.csv", csv);
      const res = await validateFile(input, baseTemplate);
      expect(res.ok).toBe(false);
      expect(res.errors.some((e) => e.code === "UNKNOWN_COLUMN")).toBe(true);
    });

    it("memberikan peringatan ketika urutan kolom berbeda dengan template", async () => {
      const csv =
        "jumlah_item;kode_outlet;nominal_rupiah;tgl_transaksi;status_bayar;catatan\r\n" +
        "10;123456;50000;2026-05-12;LUNAS;Reguler\r\n";
      const input = toInput("transaksi.csv", csv);
      const res = await validateFile(input, baseTemplate);
      expect(res.ok).toBe(true);
      expect(res.warnings.some((w) => w.code === "COLUMN_ORDER_MISMATCH")).toBe(true);
    });

    it("memberikan peringatan baris kosong dan tidak menganggapnya sebagai error", async () => {
      const csv =
        "kode_outlet;jumlah_item;nominal_rupiah;tgl_transaksi;status_bayar;catatan\r\n" +
        "123456;10;50000;2026-05-12;LUNAS;Reguler\r\n" +
        ";;;;;\r\n" +
        "654321;20;75000;2026-05-13;PENDING;Promo\r\n";
      const input = toInput("transaksi.csv", csv);
      const res = await validateFile(input, baseTemplate);
      expect(res.ok).toBe(true);
      expect(res.warnings.some((w) => w.code === "BLANK_ROW")).toBe(true);
      expect(res.summary.rowCount).toBe(2);
    });
  });

  describe("Validasi Nilai Sel Berdasarkan Jenis Aturan", () => {
    it("lolos untuk baris data yang memenuhi seluruh aturan", async () => {
      const csv =
        "kode_outlet;jumlah_item;nominal_rupiah;tgl_transaksi;status_bayar;catatan\r\n" +
        "123456;10;50000.50;2026-05-12;LUNAS;Reguler\r\n" +
        "998877;50;1,75E+04;2026-01-31;PENDING;\r\n" +
        "112233;99;FREE_TRIAL;2026-12-01;BATAL;Khusus\r\n";
      const input = toInput("transaksi.csv", csv);
      const res = await validateFile(input, baseTemplate);
      expect(res.ok).toBe(true);
      expect(res.errors.length).toBe(0);
      expect(res.summary.rowCount).toBe(3);
    });

    it("rule digits: lolos jika tepat 6 digit, gagal jika kurang atau mengandung huruf", async () => {
      const failDigits =
        "kode_outlet;jumlah_item;nominal_rupiah;tgl_transaksi;status_bayar;catatan\r\n" +
        "12345;10;50000;2026-05-12;LUNAS;Reguler\r\n";
      const res1 = await validateFile(toInput("fail.csv", failDigits), baseTemplate);
      expect(res1.ok).toBe(false);
      expect(res1.errors.some((e) => e.code === "INVALID_DIGITS")).toBe(true);

      const failLetter =
        "kode_outlet;jumlah_item;nominal_rupiah;tgl_transaksi;status_bayar;catatan\r\n" +
        "12345A;10;50000;2026-05-12;LUNAS;Reguler\r\n";
      const res2 = await validateFile(toInput("fail.csv", failLetter), baseTemplate);
      expect(res2.ok).toBe(false);
      expect(res2.errors.some((e) => e.code === "INVALID_DIGITS")).toBe(true);
    });

    it("rule integer: lolos dalam rentang min-max, gagal di luar rentang", async () => {
      const failRange =
        "kode_outlet;jumlah_item;nominal_rupiah;tgl_transaksi;status_bayar;catatan\r\n" +
        "123456;150;50000;2026-05-12;LUNAS;Reguler\r\n";
      const res = await validateFile(toInput("fail.csv", failRange), baseTemplate);
      expect(res.ok).toBe(false);
      expect(res.errors.some((e) => e.code === "INVALID_INTEGER_RANGE")).toBe(true);
    });

    it("rule decimal: menerima titik, koma, notasi ilmiah, dan teks khusus", async () => {
      const validCsv =
        "kode_outlet;jumlah_item;nominal_rupiah;tgl_transaksi;status_bayar;catatan\r\n" +
        "123456;10;FREE_TRIAL;2026-05-12;LUNAS;Reguler\r\n" +
        "123456;10;1.25e-3;2026-05-12;LUNAS;Reguler\r\n";
      const res = await validateFile(toInput("valid.csv", validCsv), baseTemplate);
      expect(res.ok).toBe(true);

      const failDecimal =
        "kode_outlet;jumlah_item;nominal_rupiah;tgl_transaksi;status_bayar;catatan\r\n" +
        "123456;10;bukan_angka;2026-05-12;LUNAS;Reguler\r\n";
      const resFail = await validateFile(toInput("fail.csv", failDecimal), baseTemplate);
      expect(resFail.ok).toBe(false);
      expect(resFail.errors.some((e) => e.code === "INVALID_DECIMAL")).toBe(true);
    });

    it("rule date: lolos format yyyy-MM-dd valid, gagal format tanggal tidak sesuai", async () => {
      const failDate =
        "kode_outlet;jumlah_item;nominal_rupiah;tgl_transaksi;status_bayar;catatan\r\n" +
        "123456;10;50000;12/05/2026;LUNAS;Reguler\r\n";
      const res = await validateFile(toInput("fail.csv", failDate), baseTemplate);
      expect(res.ok).toBe(false);
      expect(res.errors.some((e) => e.code === "INVALID_DATE")).toBe(true);
    });

    it("rule list: lolos jika dalam daftar pilihan, gagal jika nilai di luar daftar", async () => {
      const failList =
        "kode_outlet;jumlah_item;nominal_rupiah;tgl_transaksi;status_bayar;catatan\r\n" +
        "123456;10;50000;2026-05-12;HUTANG;Reguler\r\n";
      const res = await validateFile(toInput("fail.csv", failList), baseTemplate);
      expect(res.ok).toBe(false);
      expect(res.errors.some((e) => e.code === "INVALID_LIST_VALUE")).toBe(true);
    });

    it("rule text: memvalidasi minLength, maxLength, dan allowedValues", async () => {
      const failLength =
        "kode_outlet;jumlah_item;nominal_rupiah;tgl_transaksi;status_bayar;catatan\r\n" +
        "123456;10;50000;2026-05-12;LUNAS;ab\r\n";
      const res1 = await validateFile(toInput("fail.csv", failLength), baseTemplate);
      expect(res1.ok).toBe(false);
      expect(res1.errors.some((e) => e.code === "INVALID_TEXT_LENGTH")).toBe(true);

      const failAllowed =
        "kode_outlet;jumlah_item;nominal_rupiah;tgl_transaksi;status_bayar;catatan\r\n" +
        "123456;10;50000;2026-05-12;LUNAS;VipMember\r\n";
      const res2 = await validateFile(toInput("fail.csv", failAllowed), baseTemplate);
      expect(res2.ok).toBe(false);
      expect(res2.errors.some((e) => e.code === "INVALID_ALLOWED_VALUE")).toBe(true);
    });

    it("kolom wajib yang kosong ditolak dengan REQUIRED_FIELD_EMPTY", async () => {
      const failEmpty =
        "kode_outlet;jumlah_item;nominal_rupiah;tgl_transaksi;status_bayar;catatan\r\n" +
        ";10;50000;2026-05-12;LUNAS;Reguler\r\n";
      const res = await validateFile(toInput("fail.csv", failEmpty), baseTemplate);
      expect(res.ok).toBe(false);
      expect(res.errors.some((e) => e.code === "REQUIRED_FIELD_EMPTY")).toBe(true);
    });
  });

  describe("Peringatan Agregat", () => {
    it("menghasilkan tepat satu warning agregat untuk spasi di awal/akhir per kolom", async () => {
      let csv = "kode_outlet;jumlah_item;nominal_rupiah;tgl_transaksi;status_bayar;catatan\r\n";
      for (let i = 0; i < 5; i++) {
        csv += "123456;10;50000;2026-05-12;LUNAS ; Reguler \r\n";
      }
      const res = await validateFile(toInput("spaces.csv", csv), baseTemplate);
      expect(res.ok).toBe(true);
      const spaceWarnings = res.warnings.filter((w) => w.code === "WHITESPACE_TRIM_WARNING");
      expect(spaceWarnings.length).toBe(2);
    });

    it("menghasilkan tepat satu warning agregat saat pemisah titik dan koma bercampur pada kolom desimal", async () => {
      const csv =
        "kode_outlet;jumlah_item;nominal_rupiah;tgl_transaksi;status_bayar;catatan\r\n" +
        "123456;10;5000.75;2026-05-12;LUNAS;Reguler\r\n" +
        "123456;10;5000,25;2026-05-12;LUNAS;Reguler\r\n";
      const res = await validateFile(toInput("mixed.csv", csv), baseTemplate);
      expect(res.ok).toBe(true);
      const mixed = res.warnings.filter((w) => w.code === "MIXED_DECIMAL_SEPARATORS");
      expect(mixed.length).toBe(1);
      expect(mixed[0].message).toContain("titik (1 nilai");
      expect(mixed[0].message).toContain("koma (1 nilai");
    });
  });

  describe("Performa Skala Besar (40.000 Baris & Batas 200 Issues)", () => {
    it("memvalidasi 40.000 baris dalam hitungan detik dan membatasi array issue maksimal 200", async () => {
      const row = "123456;10;50000;2026-05-12;LUNAS;Reguler\r\n";
      const header = "kode_outlet;jumlah_item;nominal_rupiah;tgl_transaksi;status_bayar;catatan\r\n";
      const bigCsv = header + row.repeat(40000);

      const start = Date.now();
      const res = await validateFile(toInput("big.csv", bigCsv), baseTemplate);
      const elapsed = Date.now() - start;

      expect(res.ok).toBe(true);
      expect(res.summary.rowCount).toBe(40000);
      expect(elapsed).toBeLessThan(5000);

      const invalidRow = "99;10;50000;2026-05-12;LUNAS;Reguler\r\n";
      const invalidBigCsv = header + invalidRow.repeat(500);
      const resFail = await validateFile(toInput("big_fail.csv", invalidBigCsv), baseTemplate);
      expect(resFail.ok).toBe(false);
      expect(resFail.errors.length).toBe(200);
      expect(resFail.summary.totalErrors).toBe(500);
    });
  });

  describe("Validasi Berkas Parquet", () => {
    it("lolos validasi Parquet yang sesuai struktur schema dan isi sel", async () => {
      const buf = new Uint8Array(
        parquetWriteBuffer({
          columnData: [
            { name: "kode_outlet", data: ["111222", "333444"] },
            { name: "jumlah_item", data: [10, 20] },
            { name: "nominal_rupiah", data: [50000.5, 75000.0] },
            { name: "tgl_transaksi", data: ["2026-05-12", "2026-05-13"] },
            { name: "status_bayar", data: ["LUNAS", "PENDING"] },
            { name: "catatan", data: ["Reguler", "Promo"] },
          ],
        })
      );

      const res = await validateFile(
        { name: "transaksi.parquet", size: buf.byteLength, bytes: buf },
        baseTemplate
      );
      expect(res.ok).toBe(true);
      expect(res.errors.length).toBe(0);
      expect(res.summary.rowCount).toBe(2);
    });

    it("gagal validasi Parquet jika ada kolom yang hilang atau tipe tidak kompatibel", async () => {
      const buf = new Uint8Array(
        parquetWriteBuffer({
          columnData: [
            { name: "kode_outlet", data: ["111222"] },
            { name: "jumlah_item", data: [10] },
          ],
        })
      );

      const res = await validateFile(
        { name: "transaksi.parquet", size: buf.byteLength, bytes: buf },
        baseTemplate
      );
      expect(res.ok).toBe(false);
      expect(res.errors.some((e) => e.code === "MISSING_COLUMN")).toBe(true);
    });

    it("gagal jika kolom wajib di Parquet bersifat opsional dan seluruh nilainya null", async () => {
      const buf = new Uint8Array(
        parquetWriteBuffer({
          columnData: [
            { name: "kode_outlet", data: [null, null] },
            { name: "jumlah_item", data: [10, 20] },
            { name: "nominal_rupiah", data: [50000, 75000] },
            { name: "tgl_transaksi", data: ["2026-05-12", "2026-05-13"] },
            { name: "status_bayar", data: ["LUNAS", "PENDING"] },
            { name: "catatan", data: ["Reguler", "Promo"] },
          ],
        })
      );

      const res = await validateFile(
        { name: "transaksi.parquet", size: buf.byteLength, bytes: buf },
        baseTemplate
      );
      expect(res.ok).toBe(false);
      expect(res.errors.some((e) => e.code === "REQUIRED_FIELD_ALL_NULL" || e.code === "REQUIRED_FIELD_EMPTY")).toBe(true);
    });

    it("memberikan peringatan 'Isi sel tidak diperiksa untuk file besar' jika ukuran melebihi batas scan", async () => {
      const buf = new Uint8Array(
        parquetWriteBuffer({
          columnData: [
            { name: "kode_outlet", data: ["111222"] },
            { name: "jumlah_item", data: [10] },
            { name: "nominal_rupiah", data: [50000] },
            { name: "tgl_transaksi", data: ["2026-05-12"] },
            { name: "status_bayar", data: ["LUNAS"] },
            { name: "catatan", data: ["Reguler"] },
          ],
        })
      );

      const res = await validateFile(
        { name: "transaksi.parquet", size: buf.byteLength, bytes: buf },
        baseTemplate,
        { maxParquetRowScanBytes: 50 }
      );
      expect(res.warnings.some((w) => w.code === "LARGE_PARQUET_SKIPPED")).toBe(true);
      expect(res.warnings.find((w) => w.code === "LARGE_PARQUET_SKIPPED")?.message).toBe(
        "Isi sel tidak diperiksa untuk file besar."
      );
    });
  });
});
