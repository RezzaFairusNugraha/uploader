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

    describe("Aturan Baru Nilai Sel tgt_pct_raw dan Hari Besar", () => {
      it("menerima nilai tgt_pct_raw yang valid: koma, titik, integer, nol, di atas 100, notasi ilmiah, dan teks Maintain % Last BD", () => {
        const validValues = [
          "5,425579994",
          "5.425579994",
          "100",
          "0",
          "114.6903821",
          "1,83333E-05",
          "Maintain % Last BD",
        ];

        for (const val of validValues) {
          const content = `material_group_code;tgt_year;tgt_quarter;regional_code;area_short;rayon_code;rayon_name;tgt_pct_raw;brand_name\r\n921000006;2026;1;1;MDN;101;Medan;${val};WD 12\r\n`;
          const input = toInput("data.csv", content);
          const result = validateFile(input, targetBrandDistributionTemplate);
          expect(result.ok).toBe(true);
          expect(result.errors.length).toBe(0);
        }
      });

      it("menolak nilai tgt_pct_raw yang tidak valid", () => {
        const invalidValues = [
          "abc",
          "-5",
          "",
          "Maintain",
          "maintain % last bd",
          "12,5,5",
        ];

        for (const val of invalidValues) {
          const content = `material_group_code;tgt_year;tgt_quarter;regional_code;area_short;rayon_code;rayon_name;tgt_pct_raw;brand_name\r\n921000006;2026;1;1;MDN;101;Medan;${val};WD 12\r\n`;
          const input = toInput("data.csv", content);
          const result = validateFile(input, targetBrandDistributionTemplate);
          expect(result.ok).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
        }
      });

      it("memberikan tepat satu warning agregat untuk spasi di awal/akhir pada banyak baris", () => {
        let content =
          "material_group_code;tgt_year;tgt_quarter;regional_code;area_short;rayon_code;rayon_name;tgt_pct_raw;brand_name\r\n";
        for (let i = 0; i < 10; i++) {
          content += `921000006;2026;1;1;MDN;101;Medan ;5,425579994;WD 12\r\n`;
        }
        const input = toInput("data.csv", content);
        const result = validateFile(input, targetBrandDistributionTemplate);

        expect(result.ok).toBe(true);
        const wsWarnings = result.warnings.filter(
          (w) => w.code === "WHITESPACE_TRIM_WARNING"
        );
        expect(wsWarnings.length).toBe(1);
        expect(wsWarnings[0].message).toContain("10 nilai di kolom 'rayon_name'");
        expect(wsWarnings[0].message).toContain("baris 2, 3, 4");
      });

      it("menghasilkan warning agregat ketika titik dan koma dicampur pada kolom numerik yang sama", () => {
        const mixedContent =
          "material_group_code;tgt_year;tgt_quarter;regional_code;area_short;rayon_code;rayon_name;tgt_pct_raw;brand_name\r\n" +
          "921000006;2026;1;1;MDN;101;Medan;5.42;WD 12\r\n" +
          "921000006;2026;1;1;MDN;101;Medan;6,95;WD 12\r\n";
        const resultMixed = validateFile(
          toInput("data.csv", mixedContent),
          targetBrandDistributionTemplate
        );
        expect(resultMixed.ok).toBe(true);
        const mixedWarnings = resultMixed.warnings.filter(
          (w) => w.code === "MIXED_DECIMAL_SEPARATORS"
        );
        expect(mixedWarnings.length).toBe(1);
        expect(mixedWarnings[0].message).toContain("titik (1 nilai");
        expect(mixedWarnings[0].message).toContain("koma (1 nilai");

        const onlyDots =
          "material_group_code;tgt_year;tgt_quarter;regional_code;area_short;rayon_code;rayon_name;tgt_pct_raw;brand_name\r\n" +
          "921000006;2026;1;1;MDN;101;Medan;5.42;WD 12\r\n" +
          "921000006;2026;1;1;MDN;101;Medan;6.95;WD 12\r\n";
        const resultDots = validateFile(
          toInput("data.csv", onlyDots),
          targetBrandDistributionTemplate
        );
        expect(
          resultDots.warnings.some((w) => w.code === "MIXED_DECIMAL_SEPARATORS")
        ).toBe(false);

        const onlyCommas =
          "material_group_code;tgt_year;tgt_quarter;regional_code;area_short;rayon_code;rayon_name;tgt_pct_raw;brand_name\r\n" +
          "921000006;2026;1;1;MDN;101;Medan;5,42;WD 12\r\n" +
          "921000006;2026;1;1;MDN;101;Medan;6,95;WD 12\r\n";
        const resultCommas = validateFile(
          toInput("data.csv", onlyCommas),
          targetBrandDistributionTemplate
        );
        expect(
          resultCommas.warnings.some(
            (w) => w.code === "MIXED_DECIMAL_SEPARATORS"
          )
        ).toBe(false);
      });

      it("memvalidasi Hari Besar: KeteranganHariBesar kosong diizinkan, baris ';;' tetap warning, week di luar 1-53 dan year bukan 4 digit ditolak", () => {
        const validBlank =
          "Year;Week;KeteranganHariBesar\r\n2026;1;Tahun baru\r\n2026;24;\r\n2026;33;Kemerdekaan\r\n";
        const resultBlank = validateFile(
          toInput("data.csv", validBlank),
          hariBesarTemplate
        );
        expect(resultBlank.ok).toBe(true);
        expect(resultBlank.errors.length).toBe(0);
        expect(resultBlank.warnings.length).toBe(0);

        const withBlankRows =
          "Year;Week;KeteranganHariBesar\r\n2026;1;Tahun baru\r\n;;\r\n2026;2;\r\n";
        const resultBlankRows = validateFile(
          toInput("data.csv", withBlankRows),
          hariBesarTemplate
        );
        expect(resultBlankRows.ok).toBe(true);
        expect(
          resultBlankRows.warnings.some((w) => w.code === "BLANK_ROW")
        ).toBe(true);

        const weekZero = "Year;Week;KeteranganHariBesar\r\n2026;0;Libur\r\n";
        expect(validateFile(toInput("data.csv", weekZero), hariBesarTemplate).ok).toBe(false);

        const week54 = "Year;Week;KeteranganHariBesar\r\n2026;54;Libur\r\n";
        expect(validateFile(toInput("data.csv", week54), hariBesarTemplate).ok).toBe(false);

        const yearShort = "Year;Week;KeteranganHariBesar\r\n26;1;Libur\r\n";
        expect(validateFile(toInput("data.csv", yearShort), hariBesarTemplate).ok).toBe(false);
      });

      it("mampu memvalidasi 40.000 baris dengan cepat di bawah 5 detik dan membatasi issue tersimpan maksimal 200", () => {
        const header =
          "material_group_code;tgt_year;tgt_quarter;regional_code;area_short;rayon_code;rayon_name;tgt_pct_raw;brand_name\r\n";
        const validLine =
          "921000006;2026;1;1;MDN;101;Medan;5,425579994;WD 12\r\n";
        const largeContent = header + validLine.repeat(40000);
        const input = toInput("large.csv", largeContent);

        const start = Date.now();
        const result = validateFile(input, targetBrandDistributionTemplate);
        const duration = Date.now() - start;

        expect(result.ok).toBe(true);
        expect(result.summary.rowCount).toBe(40000);
        expect(duration).toBeLessThan(5000);

        const invalidLine =
          "921000006;2026;5;1;MDN;101;Medan;abc;WD 12\r\n";
        const invalidContent = header + invalidLine.repeat(300);
        const invalidInput = toInput("invalid_large.csv", invalidContent);
        const invalidResult = validateFile(
          invalidInput,
          targetBrandDistributionTemplate
        );

        expect(invalidResult.ok).toBe(false);
        expect(invalidResult.errors.length).toBeLessThanOrEqual(200);
        expect(invalidResult.summary.totalErrors).toBeGreaterThan(200);
      });
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
