import { dataResearchTemplate } from "./data-research";
import { hariBesarTemplate } from "./hari-besar";
import { targetBrandDistributionTemplate } from "./target-brand-distribution";
import type { TemplateConfig } from "./types";

export * from "./types";
export { dataResearchTemplate } from "./data-research";
export { hariBesarTemplate } from "./hari-besar";
export { targetBrandDistributionTemplate } from "./target-brand-distribution";

export const templates: TemplateConfig[] = [
  targetBrandDistributionTemplate,
  hariBesarTemplate,
  dataResearchTemplate,
];

export function getAllTemplates(): TemplateConfig[] {
  return templates;
}

export function getTemplateById(id: string): TemplateConfig | undefined {
  return templates.find((t) => t.id === id);
}
