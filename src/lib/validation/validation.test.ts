import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "bun:test";
import {
  dataResearchTemplate,
  hariBesarTemplate,
  targetBrandDistributionTemplate,
} from "../templates";
import { validateFile } from "./index";

describe("Validation Engine", () => {
  const samplesDir = path.join(process.cwd(), "samples");

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

  describe("Uji Berkas Sampel Nyata", () => {
    it("memvalidasi Target Brand Distribution.csv tanpa error", async () => {
      const filePath = path.join(
        samplesDir,
        "Target Brand Distribution.csv"
      );
      const rawBytes = await fs.readFile(filePath);
      const input = {
        name: "Target Brand Distribution.csv",
        size: rawBytes.length,
        bytes: new Uint8Array(rawBytes),
      };

      const result = validateFile(input, targetBrandDistributionTemplate);
      expect(result.ok).toBe(true);
      expect(result.errors.length).toBe(0);
      expect(result.summary.rowCount).toBe(3);
      expect(result.summary.columnCount).toBe(9);
      expect(result.summary.detectedDelimiter).toBe(";");
    });

    it("memvalidasi Hari Besar Contoh.csv tanpa error dan menghasilkan 2 warning baris kosong", async () => {
      const filePath = path.join(samplesDir, "Hari Besar Contoh.csv");
      const rawBytes = await fs.readFile(filePath);
      const input = {
        name: "Hari Besar Contoh.csv",
        size: rawBytes.length,
        bytes: new Uint8Array(rawBytes),
      };

      const result = validateFile(input, hariBesarTemplate);
      expect(result.ok).toBe(true);
      expect(result.errors.length).toBe(0);
      expect(result.warnings.length).toBe(2);
      expect(result.warnings.every((w) => w.code === "BLANK_ROW")).toBe(true);
      expect(result.summary.rowCount).toBe(3);
    });
  });

  describe("Uji Kasus Kegagalan Berkas", () => {
    it("menolak berkas Excel (.xlsx / .xls) dengan pesan khusus", () => {
      const input = toInput("data.xlsx", "mock");
      const result = validateFile(input, hariBesarTemplate);

      expect(result.ok).toBe(false);
      expect(result.errors[0].message).toBe(
        "Simpan file sebagai CSV (pemisah titik koma) lalu unggah lagi."
      );
    });

    it("menolak berkas dengan ekstensi tidak sesuai", () => {
      const input = toInput("data.txt", "mock");
      const result = validateFile(input, hariBesarTemplate);

      expect(result.ok).toBe(false);
      expect(result.errors[0].code).toBe("INVALID_EXTENSION");
    });

    it("menolak berkas kosong", () => {
      const input = toInput("data.csv", new Uint8Array([]));
      const result = validateFile(input, hariBesarTemplate);

      expect(result.ok).toBe(false);
      expect(result.errors[0].code).toBe("EMPTY_FILE");
    });

    it("menolak berkas dengan pengodean UTF-8 tidak valid", () => {
      const invalidBytes = new Uint8Array([0xff, 0xfe, 0xff]);
      const input = toInput("data.csv", invalidBytes);
      const result = validateFile(input, hariBesarTemplate);

      expect(result.ok).toBe(false);
      expect(result.errors[0].code).toBe("INVALID_UTF8");
    });

    it("menghasilkan peringatan jika terdapat BOM pada berkas UTF-8", () => {
      const content =
        "\uFEFFYear;Week;KeteranganHariBesar\r\n2026;1;Tahun baru\r\n";
      const input = toInput("data.csv", content);
      const result = validateFile(input, hariBesarTemplate);

      expect(result.ok).toBe(true);
      expect(result.warnings.some((w) => w.code === "BOM_PRESENT")).toBe(true);
    });

    it("menolak berkas yang menggunakan koma saat template membutuhkan titik koma", () => {
      const content = "Year,Week,KeteranganHariBesar\r\n2026,1,Tahun baru\r\n";
      const input = toInput("data.csv", content);
      const result = validateFile(input, hariBesarTemplate);

      expect(result.ok).toBe(false);
      expect(result.errors[0].code).toBe("DELIMITER_MISMATCH");
      expect(result.errors[0].message).toBe(
        "Pemisah file adalah ',' padahal template memakai ';'"
      );
    });

    it("menolak berkas jika hanya berisi header tanpa baris data", () => {
      const content = "Year;Week;KeteranganHariBesar\r\n";
      const input = toInput("data.csv", content);
      const result = validateFile(input, hariBesarTemplate);

      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.code === "NO_DATA_ROWS")).toBe(true);
    });
  });

  describe("Uji Struktur Kolom", () => {
    it("mendeteksi kolom wajib yang hilang", () => {
      const content = "Year;Week\r\n2026;1\r\n";
      const input = toInput("data.csv", content);
      const result = validateFile(input, hariBesarTemplate);

      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.code === "MISSING_COLUMN")).toBe(true);
    });

    it("mendeteksi kolom tambahan yang tidak dikenal", () => {
      const content =
        "Year;Week;KeteranganHariBesar;KolomTambahan\r\n2026;1;Libur;Ada\r\n";
      const input = toInput("data.csv", content);
      const result = validateFile(input, hariBesarTemplate);

      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.code === "UNKNOWN_COLUMN")).toBe(true);
    });

    it("memberikan peringatan jika urutan kolom berbeda dari template", () => {
      const content =
        "Week;Year;KeteranganHariBesar\r\n1;2026;Tahun baru\r\n";
      const input = toInput("data.csv", content);
      const result = validateFile(input, hariBesarTemplate);

      expect(result.ok).toBe(true);
      expect(
        result.warnings.some((w) => w.code === "COLUMN_ORDER_MISMATCH")
      ).toBe(true);
    });

    it("mendeteksi ketidaksesuaian jumlah kolom pada baris data", () => {
      const content =
        "Year;Week;KeteranganHariBesar\r\n2026;1;Libur;EkstraData\r\n";
      const input = toInput("data.csv", content);
      const result = validateFile(input, hariBesarTemplate);

      expect(result.ok).toBe(false);
      expect(
        result.errors.some((e) => e.code === "ROW_COLUMN_COUNT_MISMATCH")
      ).toBe(true);
    });
  });

  describe("Uji Nilai Sel Berdasarkan Aturan Template", () => {
    it("menolak material_group_code dengan 8 digit angka", () => {
      const content =
        'material_group_code;tgt_year;tgt_quarter;regional_code;area_short;rayon_code;rayon_name;tgt_pct_raw;brand_name\r\n92100000;2026;1;1;MDN;101;Medan;"5,425579994";WD 12\r\n';
      const input = toInput("data.csv", content);
      const result = validateFile(input, targetBrandDistributionTemplate);

      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.code === "INVALID_DIGITS")).toBe(true);
    });

    it("menolak material_group_code yang mengandung huruf", () => {
      const content =
        'material_group_code;tgt_year;tgt_quarter;regional_code;area_short;rayon_code;rayon_name;tgt_pct_raw;brand_name\r\n92100000A;2026;1;1;MDN;101;Medan;"5,425579994";WD 12\r\n';
      const input = toInput("data.csv", content);
      const result = validateFile(input, targetBrandDistributionTemplate);

      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.code === "INVALID_DIGITS")).toBe(true);
    });

    it("menolak tgt_year dengan nilai '26' (bukan 4 digit)", () => {
      const content =
        'material_group_code;tgt_year;tgt_quarter;regional_code;area_short;rayon_code;rayon_name;tgt_pct_raw;brand_name\r\n921000006;26;1;1;MDN;101;Medan;"5,425579994";WD 12\r\n';
      const input = toInput("data.csv", content);
      const result = validateFile(input, targetBrandDistributionTemplate);

      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.code === "INVALID_DIGITS")).toBe(true);
    });

    it("menolak tgt_quarter bernilai 5 (di luar rentang 1 - 4)", () => {
      const content =
        'material_group_code;tgt_year;tgt_quarter;regional_code;area_short;rayon_code;rayon_name;tgt_pct_raw;brand_name\r\n921000006;2026;5;1;MDN;101;Medan;"5,425579994";WD 12\r\n';
      const input = toInput("data.csv", content);
      const result = validateFile(input, targetBrandDistributionTemplate);

      expect(result.ok).toBe(false);
      expect(
        result.errors.some((e) => e.code === "INVALID_INTEGER_RANGE")
      ).toBe(true);
    });

    it("menolak tgt_pct_raw dengan nilai teks 'abc'", () => {
      const content =
        "material_group_code;tgt_year;tgt_quarter;regional_code;area_short;rayon_code;rayon_name;tgt_pct_raw;brand_name\r\n921000006;2026;1;1;MDN;101;Medan;abc;WD 12\r\n";
      const input = toInput("data.csv", content);
      const result = validateFile(input, targetBrandDistributionTemplate);

      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.code === "INVALID_DECIMAL")).toBe(
        true
      );
    });

    it("menolak tgt_pct_raw dengan nilai 150 (melebihi rentang 100)", () => {
      const content =
        "material_group_code;tgt_year;tgt_quarter;regional_code;area_short;rayon_code;rayon_name;tgt_pct_raw;brand_name\r\n921000006;2026;1;1;MDN;101;Medan;150;WD 12\r\n";
      const input = toInput("data.csv", content);
      const result = validateFile(input, targetBrandDistributionTemplate);

      expect(result.ok).toBe(false);
      expect(
        result.errors.some((e) => e.code === "INVALID_DECIMAL_RANGE")
      ).toBe(true);
    });

    it("menghasilkan peringatan jika tgt_pct_raw memakai titik desimal", () => {
      const content =
        "material_group_code;tgt_year;tgt_quarter;regional_code;area_short;rayon_code;rayon_name;tgt_pct_raw;brand_name\r\n921000006;2026;1;1;MDN;101;Medan;5.42558;WD 12\r\n";
      const input = toInput("data.csv", content);
      const result = validateFile(input, targetBrandDistributionTemplate);

      expect(result.ok).toBe(true);
      expect(
        result.warnings.some((w) => w.code === "DECIMAL_DOT_WARNING")
      ).toBe(true);
    });

    it("menolak kolom wajib KeteranganHariBesar yang kosong", () => {
      const content = "Year;Week;KeteranganHariBesar\r\n2026;1;\r\n";
      const input = toInput("data.csv", content);
      const result = validateFile(input, hariBesarTemplate);

      expect(result.ok).toBe(false);
      expect(
        result.errors.some((e) => e.code === "REQUIRED_FIELD_EMPTY")
      ).toBe(true);
    });
  });

  describe("Uji Validasi Berkas Parquet dan csv-or-parquet", () => {
    it("menerima berkas Parquet valid yang diawali dan diakhiri dengan PAR1", () => {
      const validParquet = new Uint8Array([
        0x50, 0x41, 0x52, 0x31,
        0x00, 0x01, 0x02, 0x03,
        0x50, 0x41, 0x52, 0x31,
      ]);
      const input = toInput("research.parquet", validParquet);
      const result = validateFile(input, dataResearchTemplate);

      expect(result.ok).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it("menolak berkas Parquet tanpa tanda tangan PAR1 yang benar", () => {
      const invalidParquet = new Uint8Array([
        0x00, 0x01, 0x02, 0x03,
        0x04, 0x05, 0x06, 0x07,
        0x08, 0x09, 0x0a, 0x0b,
      ]);
      const input = toInput("research.parquet", invalidParquet);
      const result = validateFile(input, dataResearchTemplate);

      expect(result.ok).toBe(false);
      expect(result.errors[0].code).toBe("INVALID_PARQUET_FILE");
    });

    it("memvalidasi data-research dalam format CSV generik dengan pemisah koma", () => {
      const content = "id,category,score\r\n1,alpha,95.5\r\n2,beta,80.0\r\n";
      const input = toInput("research.csv", content);
      const result = validateFile(input, dataResearchTemplate);

      expect(result.ok).toBe(true);
      expect(result.errors.length).toBe(0);
      expect(result.summary.rowCount).toBe(2);
      expect(result.summary.columnCount).toBe(3);
      expect(result.summary.detectedDelimiter).toBe(",");
    });
  });
});
