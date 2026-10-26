import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { getColumnRuleSummary } from "../copy";
import { defaultRulesByType, SortableColumnRow, type SortableColumnItemData } from "@/components/SortableColumnRow";

describe("Column Editor Tests", () => {
  it("getColumnRuleSummary menghasilkan ringkasan sesuai jenis, aturan, dan status wajib diisi", () => {
    const digitsSummary = getColumnRuleSummary({ type: "digits", length: 9 }, true);
    expect(digitsSummary.text).toBe("Kode angka · 9 digit · Wajib diisi");
    expect(digitsSummary.isIncomplete).toBe(false);

    const decimalSummary = getColumnRuleSummary(
      { type: "decimal", allowComma: true, allowDot: true },
      false
    );
    expect(decimalSummary.text).toBe("Angka desimal · koma atau titik · Boleh kosong");
    expect(decimalSummary.isIncomplete).toBe(false);

    const integerSummary = getColumnRuleSummary(
      { type: "integer", min: 1, max: 100 },
      true
    );
    expect(integerSummary.text).toBe("Bilangan bulat · 1 sampai 100 · Wajib diisi");
    expect(integerSummary.isIncomplete).toBe(false);
  });

  it("getColumnRuleSummary mendeteksi aturan yang belum lengkap", () => {
    const incompleteDigits = getColumnRuleSummary({ type: "digits", length: 0 }, true);
    expect(incompleteDigits.isIncomplete).toBe(true);
    expect(incompleteDigits.text).toBe("Aturan belum lengkap");

    const incompleteList = getColumnRuleSummary({ type: "list", values: [] }, false);
    expect(incompleteList.isIncomplete).toBe(true);
    expect(incompleteList.text).toBe("Aturan belum lengkap");

    const invalidIntegerRange = getColumnRuleSummary({ type: "integer", min: 10, max: 5 }, true);
    expect(invalidIntegerRange.isIncomplete).toBe(true);
    expect(invalidIntegerRange.text).toBe("Aturan belum lengkap");
  });

  it("mengganti jenis isi mereset aturan ke default yang masuk akal namun mempertahankan nama dan wajib diisi", () => {
    let current: SortableColumnItemData = {
      id: "col-test",
      name: "target_omset",
      required: true,
      type: "digits",
      rule: { type: "digits", length: 12 },
      isExpanded: false,
    };

    const handleTypeChange = (newType: keyof typeof defaultRulesByType) => {
      current = {
        ...current,
        type: newType,
        rule: { ...defaultRulesByType[newType] },
      };
    };

    handleTypeChange("decimal");
    expect(current.name).toBe("target_omset");
    expect(current.required).toBe(true);
    expect(current.type).toBe("decimal");
    expect(current.rule).toEqual({
      type: "decimal",
      allowComma: true,
      allowDot: true,
      allowScientific: true,
    });
  });

  it("baris kolom tertutup tidak lagi merender select jenis isi atau checkbox Wajib diisi", () => {
    const col: SortableColumnItemData = {
      id: "col-1",
      name: "kode_material",
      required: true,
      type: "digits",
      rule: { type: "digits", length: 9 },
      isExpanded: false,
    };

    const html = renderToStaticMarkup(
      <SortableColumnRow
        col={col}
        index={0}
        total={1}
        onUpdate={() => {}}
        onUpdateRule={() => {}}
        onRemove={() => {}}
      />
    );

    expect(html).not.toContain("<select");
    expect(html).not.toContain('type="checkbox"');
    expect(html).toContain("Aturan");
    expect(html).toContain('aria-label="Nama kolom"');
    expect(html).toContain('placeholder="Nama kolom, misalnya kode_material"');
    expect(html).toContain("Kode angka · 9 digit · Wajib diisi");
  });
});
