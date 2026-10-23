import type { TemplateConfigCompat } from "./compat";

export const targetBrandDistributionTemplate: TemplateConfigCompat = {
  id: "target-brand-distribution",
  name: "Target Brand Distribution",
  description: "Distribusi target merek",
  kind: "csv",
  delimiter: ";",
  columns: [
    {
      name: "material_group_code",
      required: true,
      rule: { type: "digits", length: 9 },
    },
    {
      name: "tgt_year",
      required: true,
      rule: { type: "digits", length: 4 },
    },
    {
      name: "tgt_quarter",
      required: true,
      rule: { type: "integer", min: 1, max: 4 },
    },
    {
      name: "regional_code",
      required: true,
      rule: { type: "integer" },
    },
    {
      name: "area_short",
      required: true,
      rule: { type: "text" },
    },
    {
      name: "rayon_code",
      required: true,
      rule: { type: "integer" },
    },
    {
      name: "rayon_name",
      required: true,
      rule: { type: "text" },
    },
    {
      name: "tgt_pct_raw",
      required: true,
      rule: {
        type: "decimal",
        allowedText: ["Maintain % Last BD"],
        allowComma: true,
        allowDot: true,
        allowScientific: true,
        min: 0,
      },
    },
    {
      name: "brand_name",
      required: true,
      rule: { type: "text" },
    },
  ],
};

export const hariBesarTemplate: TemplateConfigCompat = {
  id: "hari-besar",
  name: "Hari Besar",
  description: "Kalender hari libur nasional dan operasional.",
  kind: "csv",
  delimiter: ";",
  columns: [
    {
      name: "Year",
      required: true,
      rule: { type: "digits", length: 4 },
    },
    {
      name: "Week",
      required: true,
      rule: { type: "integer", min: 1, max: 53 },
    },
    {
      name: "KeteranganHariBesar",
      required: false,
      rule: { type: "text" },
    },
  ],
};

export const dataResearchTemplate: TemplateConfigCompat = {
  id: "data-research",
  name: "Data Research",
  description: "Dataset penelitian dalam format Parquet atau CSV.",
  kind: "csv-or-parquet",
  delimiter: ",",
  columns: [],
};
