import { describe, expect, it } from "bun:test";
import {
  FakeInMemoryTemplateVersionRepository,
  type TemplateVersionItem,
} from "./versions";
import type { TemplateDefinition } from "./schema";

const dummyTemplate: TemplateDefinition = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Contoh",
  slug: "contoh",
  description: "",
  delimiter: ";",
  status: "aktif",
  volume: {
    catalog: "main",
    schema: "default",
    name: "vol_contoh",
  },
  version: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  columns: [{ name: "id", required: true, rule: { type: "integer" } }],
};

describe("TemplateVersionRepository", () => {
  it("menyimpan dan membaca riwayat versi template", async () => {
    const repo = new FakeInMemoryTemplateVersionRepository();
    const ver1 = await repo.add({
      templateId: dummyTemplate.id,
      version: 1,
      snapshot: dummyTemplate,
      changeSummary: "Versi awal dibuat",
      isBreaking: false,
      changedBy: "Budi",
    });

    expect(ver1.id).toBeDefined();
    expect(ver1.version).toBe(1);

    const ver2 = await repo.add({
      templateId: dummyTemplate.id,
      version: 2,
      snapshot: { ...dummyTemplate, version: 2 },
      changeSummary: "Menambahkan kolom baru",
      isBreaking: false,
      changedBy: "Ani",
    });

    const list = await repo.listByTemplate(dummyTemplate.id);
    expect(list.length).toBe(2);
    expect(list[0].version).toBe(2);
    expect(list[1].version).toBe(1);

    const single = await repo.get(dummyTemplate.id, 1);
    expect(single?.changedBy).toBe("Budi");

    const latest = await repo.latestAcrossTemplates(10);
    expect(latest.length).toBe(2);
  });

  it("mencegah duplikasi nomor versi pada template yang sama", async () => {
    const repo = new FakeInMemoryTemplateVersionRepository();
    await repo.add({
      templateId: dummyTemplate.id,
      version: 1,
      snapshot: dummyTemplate,
      changeSummary: "Versi 1",
      isBreaking: false,
      changedBy: "Budi",
    });

    expect(
      repo.add({
        templateId: dummyTemplate.id,
        version: 1,
        snapshot: dummyTemplate,
        changeSummary: "Versi 1 duplikat",
        isBreaking: false,
        changedBy: "Ani",
      })
    ).rejects.toThrow("sudah ada");
  });
});
