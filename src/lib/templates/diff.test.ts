import { describe, expect, it } from "bun:test";
import { diffTemplates } from "./diff";
import type { TemplateDefinition } from "./schema";

const baseTemplate: TemplateDefinition = {
  id: "00000000-0000-0000-0000-000000000001",
  name: "Data Nasabah",
  slug: "data_nasabah",
  description: "Template awal",
  delimiter: ";",
  status: "aktif",
  volume: {
    catalog: "main",
    schema: "default",
    name: "vol_data_nasabah",
  },
  version: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  columns: [
    { name: "id_nasabah", required: true, rule: { type: "digits", length: 8 } },
    { name: "nama", required: true, rule: { type: "text", minLength: 3, maxLength: 50 } },
    { name: "email", required: false, rule: { type: "text" } },
  ],
};

describe("diffTemplates", () => {
  it("mendeteksi tanpa perubahan", () => {
    const res = diffTemplates(baseTemplate, { ...baseTemplate });
    expect(res.isBreaking).toBe(false);
    expect(res.changes.length).toBe(0);
  });

  it("penambahan kolom opsional bersifat non-breaking", () => {
    const updated: TemplateDefinition = {
      ...baseTemplate,
      columns: [
        ...baseTemplate.columns,
        { name: "catatan", required: false, rule: { type: "text" } },
      ],
    };
    const res = diffTemplates(baseTemplate, updated);
    expect(res.isBreaking).toBe(false);
    expect(res.changes.some((c) => c.includes("Kolom opsional baru"))).toBe(true);
  });

  it("penambahan kolom wajib bersifat breaking", () => {
    const updated: TemplateDefinition = {
      ...baseTemplate,
      columns: [
        ...baseTemplate.columns,
        { name: "nik", required: true, rule: { type: "digits", length: 16 } },
      ],
    };
    const res = diffTemplates(baseTemplate, updated);
    expect(res.isBreaking).toBe(true);
    expect(res.changes.some((c) => c.includes("Kolom wajib baru"))).toBe(true);
  });

  it("penghapusan kolom bersifat breaking", () => {
    const updated: TemplateDefinition = {
      ...baseTemplate,
      columns: baseTemplate.columns.slice(0, 2),
    };
    const res = diffTemplates(baseTemplate, updated);
    expect(res.isBreaking).toBe(true);
    expect(res.changes.some((c) => c.includes("dihapus"))).toBe(true);
  });

  it("perubahan delimiter bersifat breaking", () => {
    const updated: TemplateDefinition = {
      ...baseTemplate,
      delimiter: ",",
    };
    const res = diffTemplates(baseTemplate, updated);
    expect(res.isBreaking).toBe(true);
  });

  it("perubahan kolom opsional ke wajib bersifat breaking", () => {
    const updated: TemplateDefinition = {
      ...baseTemplate,
      columns: [
        baseTemplate.columns[0],
        baseTemplate.columns[1],
        { ...baseTemplate.columns[2], required: true },
      ],
    };
    const res = diffTemplates(baseTemplate, updated);
    expect(res.isBreaking).toBe(true);
  });

  it("perubahan urutan kolom dilaporkan sebagai Urutan kolom diubah", () => {
    const updated: TemplateDefinition = {
      ...baseTemplate,
      columns: [
        baseTemplate.columns[1],
        baseTemplate.columns[0],
        baseTemplate.columns[2],
      ],
    };
    const res = diffTemplates(baseTemplate, updated);
    expect(res.changes).toContain("Urutan kolom diubah");
  });
});
