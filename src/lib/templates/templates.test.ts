import { describe, expect, it } from "bun:test";
import {
  TemplateDefinitionSchema,
  slugify,
  FakeInMemoryTemplateRepository,
  generateTemplateCsv,
  type TemplateDefinition,
} from "./index";

describe("Dynamic Templates - Schema, Repository, & Generator", () => {
  const validTemplate: TemplateDefinition = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    name: "Target Brand Distribution",
    slug: "target_brand_distribution",
    description: "Template distribusi target merek",
    delimiter: ";",
    status: "membuat",
    volume: {
      catalog: "main",
      schema: "sales",
      name: "vol_brand",
    },
    version: 1,
    createdAt: "2026-10-22T08:00:00.000Z",
    updatedAt: "2026-10-22T08:00:00.000Z",
    columns: [
      {
        name: "material_code",
        required: true,
        rule: { type: "digits", length: 9 },
      },
      {
        name: "quarter",
        required: true,
        rule: { type: "integer", min: 1, max: 4 },
      },
      {
        name: "pct_val",
        required: true,
        rule: {
          type: "decimal",
          min: 0,
          allowComma: true,
          allowDot: true,
          allowScientific: true,
          allowedText: ["Maintain % Last BD"],
        },
      },
      {
        name: "trx_date",
        required: false,
        rule: { type: "date", format: "yyyy-MM-dd" },
      },
      {
        name: "category",
        required: true,
        rule: { type: "list", values: ["A", "B", "C"] },
      },
      {
        name: "notes",
        required: false,
        rule: { type: "text", minLength: 0, maxLength: 255 },
      },
    ],
  };

  describe("Schema Validation (Zod)", () => {
    it("menerima definisi template yang valid", () => {
      const parsed = TemplateDefinitionSchema.parse(validTemplate);
      expect(parsed.name).toBe("Target Brand Distribution");
      expect(parsed.slug).toBe("target_brand_distribution");
      expect(parsed.columns.length).toBe(6);
    });

    it("memvalidasi nama kolom: trimmed, unik, 1-64 karakter huruf/angka/underscore, tanpa spasi", () => {
      const withTrailingSpaces = {
        ...validTemplate,
        columns: [
          {
            name: "  col_valid  ",
            required: true,
            rule: { type: "text" as const },
          },
        ],
      };
      const parsed = TemplateDefinitionSchema.parse(withTrailingSpaces);
      expect(parsed.columns[0].name).toBe("col_valid");

      const invalidChars = {
        ...validTemplate,
        columns: [
          {
            name: "col-with-dash",
            required: true,
            rule: { type: "text" as const },
          },
        ],
      };
      expect(() => TemplateDefinitionSchema.parse(invalidChars)).toThrow();

      const duplicateCols = {
        ...validTemplate,
        columns: [
          {
            name: "code",
            required: true,
            rule: { type: "text" as const },
          },
          {
            name: "code",
            required: false,
            rule: { type: "text" as const },
          },
        ],
      };
      expect(() => TemplateDefinitionSchema.parse(duplicateCols)).toThrow(
        "duplikat"
      );
    });

    it("memvalidasi slug: huruf kecil, angka, underscore, 3-60 karakter, diawali huruf", () => {
      expect(slugify("Target Brand Distribution")).toBe(
        "target_brand_distribution"
      );
      expect(slugify("123 Brand")).toBe("t_123_brand");

      const invalidSlug = {
        ...validTemplate,
        slug: "Invalid-Slug!",
      };
      expect(() => TemplateDefinitionSchema.parse(invalidSlug)).toThrow();
    });

    it("memvalidasi jenis aturan diskriminator (text, integer, digits, decimal, date, list)", () => {
      const invalidDateFormat = {
        ...validTemplate,
        columns: [
          {
            name: "date_col",
            required: true,
            rule: { type: "date" as const, format: "invalid-format" as unknown as "yyyy-MM-dd" },
          },
        ],
      };
      expect(() =>
        TemplateDefinitionSchema.parse(invalidDateFormat)
      ).toThrow();

      const emptyListRule = {
        ...validTemplate,
        columns: [
          {
            name: "list_col",
            required: true,
            rule: { type: "list" as const, values: [] },
          },
        ],
      };
      expect(() => TemplateDefinitionSchema.parse(emptyListRule)).toThrow();
    });
  });

  describe("TemplateRepository In-Memory Fake (Concurrency & CRUD)", () => {
    let repo: FakeInMemoryTemplateRepository;

    it("menyiapkan repository", () => {
      repo = new FakeInMemoryTemplateRepository();
    });

    it("menyimpan template baru", async () => {
      const created = await repo.create(validTemplate);
      expect(created.id).toBe(validTemplate.id);

      const retrieved = await repo.get(validTemplate.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.name).toBe(validTemplate.name);
    });

    it("menolak pembuatan template dengan slug duplikat", async () => {
      const duplicateSlugTemplate: TemplateDefinition = {
        ...validTemplate,
        id: "223e4567-e89b-12d3-a456-426614174000",
      };

      await expect(repo.create(duplicateSlugTemplate)).rejects.toThrow(
        "sudah ada"
      );
    });

    it("memperbarui template dan menaikkan nomor versi", async () => {
      const updated = await repo.update(validTemplate.id, {
        description: "Deskripsi yang diperbarui",
        status: "aktif",
      });

      expect(updated.version).toBe(2);
      expect(updated.description).toBe("Deskripsi yang diperbarui");
      expect(updated.status).toBe("aktif");

      const retrieved = await repo.get(validTemplate.id);
      expect(retrieved?.version).toBe(2);
      expect(retrieved?.status).toBe("aktif");
    });

    it("menolak pembaruan jika versi mengalami konflik konkurensi (optimistic concurrency)", async () => {
      await expect(
        repo.update(validTemplate.id, {
          description: "Konflik versi",
          version: 1, // versi saat ini adalah 2
        })
      ).rejects.toThrow("telah diperbarui oleh pengguna lain");
    });

    it("mengarsipkan template dengan mengubah status menjadi 'diarsipkan'", async () => {
      const archived = await repo.archive(validTemplate.id);
      expect(archived.status).toBe("diarsipkan");
      expect(archived.version).toBe(3);

      const retrieved = await repo.get(validTemplate.id);
      expect(retrieved?.status).toBe("diarsipkan");
    });

    it("dapat mendaftar seluruh template", async () => {
      const secondTemplate: TemplateDefinition = {
        ...validTemplate,
        id: "323e4567-e89b-12d3-a456-426614174000",
        name: "Second Template",
        slug: "second_template",
      };
      await repo.create(secondTemplate);

      const list = await repo.list();
      expect(list.length).toBe(2);
    });
  });

  describe("CSV Template Generator", () => {
    it("menghasilkan header CSV dengan CRLF tanpa baris contoh jika includeExample false", () => {
      const csv = generateTemplateCsv(validTemplate, false);
      const lines = csv.split("\r\n");

      expect(csv.endsWith("\r\n")).toBe(true);
      expect(lines[0]).toBe(
        "material_code;quarter;pct_val;trx_date;category;notes"
      );
      expect(lines[1]).toBe("");
    });

    it("menghasilkan header dan baris contoh yang sesuai aturan kolom jika includeExample true", () => {
      const csv = generateTemplateCsv(validTemplate, true);
      const lines = csv.split("\r\n");

      expect(lines.length).toBe(3);
      expect(lines[0]).toBe(
        "material_code;quarter;pct_val;trx_date;category;notes"
      );
      expect(lines[1]).toBe(
        "111111111;2;Maintain % Last BD;2026-01-31;A;Contoh Teks"
      );
      expect(lines[2]).toBe("");
    });

    it("menggunakan delimiter koma jika template menggunakan koma", () => {
      const commaTemplate: TemplateDefinition = {
        ...validTemplate,
        delimiter: ",",
      };
      const csv = generateTemplateCsv(commaTemplate, false);
      expect(csv.startsWith("material_code,quarter,pct_val")).toBe(true);
    });
  });
});
