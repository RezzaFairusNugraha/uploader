import { describe, expect, it } from "bun:test";
import { parquetWriteBuffer } from "hyparquet-writer";
import {
  inferFromCsv,
  inferFromParquet,
  inferRuleFromValues,
  normalizeColumnName,
} from "./infer";

describe("Template Structure & Rule Inference", () => {
  describe("normalizeColumnName", () => {
    it("menormalisasi nama kolom menjadi format yang valid", () => {
      expect(normalizeColumnName("Kode Material").name).toBe("Kode_Material");
      expect(normalizeColumnName("Target % (Raw)").name).toBe("Target_Raw");
      expect(normalizeColumnName("  col_name  ").name).toBe("col_name");
      expect(normalizeColumnName("123_abc").name).toBe("123_abc");
    });
  });

  describe("inferRuleFromValues", () => {
    it("mendeteksi aturan digits(length) saat semua nilai memiliki panjang digit yang sama", () => {
      const values = ["123456789", "987654321", "111222333"];
      const res = inferRuleFromValues(values);
      expect(res.type).toBe("digits");
      expect(res.rule).toEqual({ type: "digits", length: 9 });
      expect(res.required).toBe(true);
    });

    it("mendeteksi aturan integer dengan saran observed min/max jika panjang digit bervariasi", () => {
      const values = ["1", "24", "105", "53"];
      const res = inferRuleFromValues(values);
      expect(res.type).toBe("integer");
      expect(res.rule.type).toBe("integer");
      expect(res.observedMin).toBe(1);
      expect(res.observedMax).toBe(105);
      expect(res.required).toBe(true);
    });

    it("mendeteksi decimal dengan notasi ilmiah dan teks khusus (Maintain % Last BD)", () => {
      const values = [
        "100",
        "1,83333E-05",
        "Maintain % Last BD",
        "Maintain % Last BD",
        "5.42",
        "6,95",
      ];
      const res = inferRuleFromValues(values);
      expect(res.type).toBe("decimal");
      expect(res.rule.type).toBe("decimal");
      if (res.rule.type === "decimal") {
        expect(res.rule.allowComma).toBe(true);
        expect(res.rule.allowDot).toBe(true);
        expect(res.rule.allowScientific).toBe(true);
        expect(res.rule.allowedText).toEqual(["Maintain % Last BD"]);
      }
    });

    it("menjadikan kolom opsional (required: false) jika terdapat nilai kosong atau null", () => {
      const values = ["2026", "", "2025", null, "2024"];
      const res = inferRuleFromValues(values);
      expect(res.required).toBe(false);
      expect(res.type).toBe("digits");
    });

    it("mendeteksi format tanggal yyyy-MM-dd dan dd-MM-yyyy", () => {
      const datesIso = ["2026-01-01", "2026-12-31"];
      const resIso = inferRuleFromValues(datesIso);
      expect(resIso.type).toBe("date");
      if (resIso.rule.type === "date") {
        expect(resIso.rule.format).toBe("yyyy-MM-dd");
      }

      const datesId = ["31-01-2026", "15-08-2026"];
      const resId = inferRuleFromValues(datesId);
      expect(resId.type).toBe("date");
      if (resId.rule.type === "date") {
        expect(resId.rule.format).toBe("dd-MM-yyyy");
      }
    });
  });

  describe("inferFromCsv", () => {
    it("mendeteksi pemisah titik koma (;) dan nama template dari file CSV", () => {
      const csv =
        "material_group_code;tgt_year;tgt_pct_raw;rayon_name\r\n" +
        "921000006;2026;Maintain % Last BD;Medan\r\n" +
        "921000006;2026;5,425579994;Binjai - Langkat\r\n";

      const structure = inferFromCsv(csv, "target-brand-distribution.csv");
      expect(structure.name).toBe("Target Brand Distribution");
      expect(structure.delimiter).toBe(";");
      expect(structure.sampleRowCount).toBe(2);
      expect(structure.columns.length).toBe(4);

      const colCode = structure.columns.find((c) => c.name === "material_group_code");
      expect(colCode?.type).toBe("digits");
      expect(colCode?.rule).toEqual({ type: "digits", length: 9 });

      const colPct = structure.columns.find((c) => c.name === "tgt_pct_raw");
      expect(colPct?.type).toBe("decimal");
      if (colPct?.rule.type === "decimal") {
        expect(colPct.rule.allowedText).toEqual(["Maintain % Last BD"]);
      }
    });

    it("mendeteksi pemisah koma (,) jika koma lebih banyak dari titik koma", () => {
      const csv =
        "id,user_name,created_at,score\n" +
        "1,budi,2026-01-01,98.5\n" +
        "2,siti,2026-01-02,87.0\n";

      const structure = inferFromCsv(csv, "student_scores.csv");
      expect(structure.name).toBe("Student Scores");
      expect(structure.delimiter).toBe(",");
      expect(structure.columns.length).toBe(4);
    });
  });

  describe("inferFromParquet", () => {
    it("mendeteksi tipe kolom dari metadata schema dan data Parquet (INT, FLOAT, STRING)", async () => {
      const buffer = parquetWriteBuffer({
        columnData: [
          {
            name: "id",
            data: [1, 2, 3],
          },
          {
            name: "amount",
            data: [10.5, 20.75, 30.0],
          },
          {
            name: "material_code",
            data: ["921000001", "921000002", "921000003"],
          },
          {
            name: "created_at",
            data: ["2026-01-01", "2026-01-02", "2026-01-03"],
          },
        ],
      });

      const structure = await inferFromParquet(buffer, "sales_data.parquet");
      expect(structure.name).toBe("Sales Data");
      expect(structure.delimiter).toBe(",");
      expect(structure.columns.length).toBe(4);

      const colId = structure.columns.find((c) => c.name === "id");
      expect(colId?.type).toBe("integer");

      const colAmount = structure.columns.find((c) => c.name === "amount");
      expect(colAmount?.type).toBe("decimal");

      const colCode = structure.columns.find((c) => c.name === "material_code");
      expect(colCode?.type).toBe("digits");
      expect(colCode?.rule).toEqual({ type: "digits", length: 9 });

      const colDate = structure.columns.find((c) => c.name === "created_at");
      expect(colDate?.type).toBe("date");
    });
  });
});
