import type { TemplateConfig } from "./types";

export const dataResearchTemplate: TemplateConfig = {
  id: "data-research",
  name: "Data Research",
  description:
    "Berkas riset bebas dalam format CSV atau Parquet tanpa aturan skema kolom ketat.",
  kind: "csv-or-parquet",
  delimiter: ";",
  fileNamePrefix: "data_research",
  columns: [],
  exampleRows: [],
};
