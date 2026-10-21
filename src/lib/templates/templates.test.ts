import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "bun:test";
import { GET as getTemplateRoute } from "@/app/api/templates/[id]/route";
import {
  formatRuleDescription,
  generateCsv,
  getAllTemplates,
  getTemplateById,
  hariBesarTemplate,
  rules,
  targetBrandDistributionTemplate,
} from "./index";

describe("Definisi Template & Generator CSV", () => {
  const samplesDir = path.join(process.cwd(), "samples");

  describe("Konsistensi Internal Konfigurasi Template", () => {
    const allTemplates = getAllTemplates();

    it("memiliki id unik untuk setiap template", () => {
      const ids = allTemplates.map((t) => t.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it("memastikan nama kolom unik di setiap template", () => {
      for (const template of allTemplates) {
        const columnNames = template.columns.map((c) => c.name);
        const uniqueNames = new Set(columnNames);
        expect(uniqueNames.size).toBe(columnNames.length);
      }
    });

    it("memastikan setiap baris contoh memiliki jumlah kolom yang tepat", () => {
      for (const template of allTemplates) {
        if (template.columns.length > 0) {
          for (const row of template.exampleRows) {
            expect(row.length).toBe(template.columns.length);
          }
        }
      }
    });

    it("dapat menemukan template berdasarkan id", () => {
      expect(getTemplateById("target-brand-distribution")).toBeDefined();
      expect(getTemplateById("hari-besar")).toBeDefined();
      expect(getTemplateById("data-research")).toBeDefined();
      expect(getTemplateById("unknown-template")).toBeUndefined();
    });
  });

  describe("Kesesuaian Format Berkas dengan Direktori samples/", () => {
    it("menghasilkan format CSV target-brand-distribution yang cocok dengan sampel", async () => {
      const samplePath = path.join(
        samplesDir,
        "Target Brand Distribution.csv"
      );
      const sampleContent = await fs.readFile(samplePath, "utf8");
      const sampleLines = sampleContent.split("\r\n");

      const generated = generateCsv(targetBrandDistributionTemplate, 3);
      const generatedLines = generated.split("\r\n");

      expect(generated.includes("\r\n")).toBe(true);
      expect(generatedLines[0]).toBe(sampleLines[0]);
      expect(generatedLines[1]).toBe(sampleLines[1]);
      expect(generatedLines[2]).toBe(sampleLines[2]);
      expect(generatedLines[3]).toBe(sampleLines[3]);
    });

    it("menghasilkan format CSV hari-besar yang cocok dengan sampel", async () => {
      const samplePath = path.join(samplesDir, "Hari Besar Contoh.csv");
      const sampleContent = await fs.readFile(samplePath, "utf8");
      const sampleLines = sampleContent.split("\r\n");

      const generated = generateCsv(hariBesarTemplate, 3);
      const generatedLines = generated.split("\r\n");

      expect(generated.includes("\r\n")).toBe(true);
      expect(generatedLines[0]).toBe(sampleLines[0]);
      expect(generatedLines[1]).toBe(sampleLines[1]);
      expect(generatedLines[2]).toBe(sampleLines[2]);
      expect(generatedLines[3]).toBe(sampleLines[3]);
    });
  });

  describe("Penghasil CSV Berdasarkan Jumlah Contoh", () => {
    it("menghasilkan header plus 1 baris contoh secara default", () => {
      const csv = generateCsv(hariBesarTemplate, 1);
      const lines = csv.trim().split("\r\n");
      expect(lines.length).toBe(2);
      expect(lines[0]).toBe("Year;Week;KeteranganHariBesar");
      expect(lines[1]).toBe("2026;1;Tahun baru");
    });

    it("menghasilkan header plus 3 baris contoh jika diminta", () => {
      const csv = generateCsv(hariBesarTemplate, 3);
      const lines = csv.trim().split("\r\n");
      expect(lines.length).toBe(4);
      expect(lines[0]).toBe("Year;Week;KeteranganHariBesar");
      expect(lines[1]).toBe("2026;1;Tahun baru");
      expect(lines[2]).toBe("2026;2;Isra' Mi'raj");
      expect(lines[3]).toBe("2026;3;Penjatahan Harga Lama");
    });

    it("mengembalikan string kosong untuk template tanpa kolom", () => {
      const research = getTemplateById("data-research");
      expect(research).toBeDefined();
      if (research) {
        expect(generateCsv(research)).toBe("");
      }
    });
  });

  describe("Endpoint Unduh Template GET /api/templates/[id]", () => {
    it("mengunduh template default dengan header dan 1 baris contoh", async () => {
      const request = new Request("http://localhost:3000/api/templates/hari-besar");
      const response = await getTemplateRoute(request, {
        params: Promise.resolve({ id: "hari-besar" }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toContain("text/csv");
      expect(response.headers.get("Content-Disposition")).toBe(
        'attachment; filename="hari-besar.csv"'
      );

      const text = await response.text();
      const lines = text.trim().split("\r\n");
      expect(lines.length).toBe(2);
      expect(lines[0]).toBe("Year;Week;KeteranganHariBesar");
      expect(lines[1]).toBe("2026;1;Tahun baru");
    });

    it("mengembalikan 404 untuk data-research dengan pesan yang jelas", async () => {
      const request = new Request(
        "http://localhost:3000/api/templates/data-research"
      );
      const response = await getTemplateRoute(request, {
        params: Promise.resolve({ id: "data-research" }),
      });

      expect(response.status).toBe(404);
      const json = await response.json();
      expect(json.error).toBe("Belum ada template untuk data riset");
    });

    it("mengembalikan 404 untuk id yang tidak ditemukan", async () => {
      const request = new Request(
        "http://localhost:3000/api/templates/tidak-ada"
      );
      const response = await getTemplateRoute(request, {
        params: Promise.resolve({ id: "tidak-ada" }),
      });

      expect(response.status).toBe(404);
      const json = await response.json();
      expect(json.error).toBe("Template tidak ditemukan");
    });
  });

  describe("Deskripsi Aturan Kolom Bahasa Indonesia", () => {
    it("memformat setiap tipe aturan ke dalam bahasa Indonesia yang jelas", () => {
      expect(formatRuleDescription(rules.digits(9))).toBe("9 digit angka");
      expect(formatRuleDescription(rules.digits(4))).toBe("4 digit angka");
      expect(formatRuleDescription(rules.integerRange(1, 4))).toBe(
        "Bilangan bulat (1 - 4)"
      );
      expect(formatRuleDescription(rules.integer())).toBe("Bilangan bulat");
      expect(formatRuleDescription(rules.text())).toBe(
        "Teks tidak boleh kosong"
      );
      expect(formatRuleDescription(rules.decimal(0, 100))).toBe(
        "Desimal (0 - 100)"
      );
      expect(formatRuleDescription(rules.anyValue())).toBe("Nilai bebas");
    });
  });
});
