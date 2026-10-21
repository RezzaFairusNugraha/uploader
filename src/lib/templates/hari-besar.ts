import { rules, type TemplateConfig } from "./types";

export const hariBesarTemplate: TemplateConfig = {
  id: "hari-besar",
  name: "Hari Besar",
  description: "Daftar hari libur dan perayaan hari besar per tahun dan minggu.",
  kind: "csv",
  delimiter: ";",
  fileNamePrefix: "Hari Besar Contoh",
  columns: [
    {
      name: "Year",
      label: "Tahun",
      required: true,
      rule: rules.digits(4),
    },
    {
      name: "Week",
      label: "Minggu ke",
      required: true,
      rule: rules.integerRange(1, 53),
    },
    {
      name: "KeteranganHariBesar",
      label: "Keterangan Hari Besar",
      required: false,
      rule: rules.text(),
    },
  ],
  exampleRows: [
    ["2026", "1", "Tahun baru"],
    ["2026", "2", ""],
    ["2026", "3", "Penjatahan Harga Lama"],
  ],
};
