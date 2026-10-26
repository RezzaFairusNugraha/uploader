import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { formatTemplateCardMeta, formatTemplateLastUpload, resolveSelectedTemplateId } from "@/lib/copy";

describe("Template List Page & Helpers", () => {
  it("formatTemplateCardMeta menyusun ringkasan meta kartu dengan benar", () => {
    const meta = formatTemplateCardMeta(5, "2026-10-25T10:00:00.000Z", "Budi");
    expect(meta).toContain("5 kolom");
    expect(meta).toContain("Diperbarui");
    expect(meta).toContain("oleh Budi");

    const metaDefault = formatTemplateCardMeta(3, "2026-10-25T10:00:00.000Z", "");
    expect(metaDefault).toContain("3 kolom");
    expect(metaDefault).toContain("oleh Admin");
  });

  it("formatTemplateLastUpload menangani ada dan tidak adanya riwayat unggah", () => {
    const none = formatTemplateLastUpload(null);
    expect(none).toBe("Belum pernah dipakai");

    const empty = formatTemplateLastUpload("");
    expect(empty).toBe("Belum pernah dipakai");

    const hasUpload = formatTemplateLastUpload("2026-10-26T08:00:00.000Z");
    expect(hasUpload).toContain("Terakhir diunggah");
  });

  it("resolveSelectedTemplateId menangani query parameter valid, tidak aktif, dan tidak dikenal", () => {
    const tpls = [
      { id: "tpl-1", status: "aktif" },
      { id: "tpl-2", status: "diarsipkan" },
      { id: "tpl-3", status: "aktif" },
    ];

    expect(resolveSelectedTemplateId(tpls, "tpl-3")).toBe("tpl-3");
    expect(resolveSelectedTemplateId(tpls, "tpl-2")).toBe("tpl-1");
    expect(resolveSelectedTemplateId(tpls, "tpl-unknown")).toBe("tpl-1");
    expect(resolveSelectedTemplateId([], "tpl-1")).toBe("");
  });

  it("memastikan kartu template tidak menampilkan slug, nomor versi, maupun path", () => {
    const sampleTpl = {
      id: "abc-123",
      name: "Target Distribusi Bulanan",
      slug: "target_distribusi_bulanan",
      version: 4,
      volume: {
        catalog: "main_catalog",
        schema: "sales_schema",
        name: "target_distribusi_bulanan",
      },
      columns: [{ name: "id" }, { name: "target" }],
      updatedAt: "2026-10-26T00:00:00.000Z",
      status: "aktif" as const,
      lastUploadedAt: null,
      lastChangedBy: "Siti",
    };

    const metaPrimary = formatTemplateCardMeta(
      sampleTpl.columns.length,
      sampleTpl.updatedAt,
      sampleTpl.lastChangedBy
    );
    const metaUpload = formatTemplateLastUpload(sampleTpl.lastUploadedAt);

    const renderedSnippet = renderToStaticMarkup(
      <div>
        <h2>{sampleTpl.name}</h2>
        <div>{metaPrimary}</div>
        <div>{metaUpload}</div>
      </div>
    );

    expect(renderedSnippet).toContain("Target Distribusi Bulanan");
    expect(renderedSnippet).toContain("2 kolom");
    expect(renderedSnippet).toContain("oleh Siti");
    expect(renderedSnippet).toContain("Belum pernah dipakai");

    expect(renderedSnippet).not.toContain("target_distribusi_bulanan");
    expect(renderedSnippet).not.toContain("main_catalog");
    expect(renderedSnippet).not.toContain("sales_schema");
    expect(renderedSnippet).not.toContain("/Volumes/");
    expect(renderedSnippet).not.toContain("v4");
    expect(renderedSnippet).not.toContain("Versi");
  });
});
