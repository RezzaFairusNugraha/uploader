import { and, desc, eq } from "drizzle-orm";
import { createDb, withDbRetry } from "@/db";
import { templateVersions, type TemplateVersionRow } from "@/db/schema";
import type { TemplateDefinition } from "./schema";

export interface TemplateVersionItem {
  id: string;
  templateId: string;
  version: number;
  snapshot: TemplateDefinition;
  changeSummary: string;
  isBreaking: boolean;
  changedBy: string;
  createdAt: string;
}

export interface TemplateVersionRepository {
  add(item: Omit<TemplateVersionItem, "id" | "createdAt">): Promise<TemplateVersionItem>;
  listByTemplate(templateId: string): Promise<TemplateVersionItem[]>;
  get(templateId: string, version: number): Promise<TemplateVersionItem | null>;
  latestAcrossTemplates(limit?: number): Promise<TemplateVersionItem[]>;
}

function mapRowToVersion(row: TemplateVersionRow): TemplateVersionItem {
  return {
    id: row.id,
    templateId: row.templateId,
    version: row.version,
    snapshot: row.snapshot as TemplateDefinition,
    changeSummary: row.changeSummary,
    isBreaking: row.isBreaking,
    changedBy: row.changedBy,
    createdAt: row.createdAt.toISOString(),
  };
}

export class DrizzleTemplateVersionRepository implements TemplateVersionRepository {
  async add(item: Omit<TemplateVersionItem, "id" | "createdAt">): Promise<TemplateVersionItem> {
    const db = createDb();
    const rows = await withDbRetry(() =>
      db
        .insert(templateVersions)
        .values({
          templateId: item.templateId,
          version: item.version,
          snapshot: item.snapshot,
          changeSummary: item.changeSummary,
          isBreaking: item.isBreaking,
          changedBy: item.changedBy,
        })
        .returning()
    );
    return mapRowToVersion(rows[0]);
  }

  async listByTemplate(templateId: string): Promise<TemplateVersionItem[]> {
    const db = createDb();
    const rows = await withDbRetry(() =>
      db
        .select()
        .from(templateVersions)
        .where(eq(templateVersions.templateId, templateId))
        .orderBy(desc(templateVersions.version))
    );
    return rows.map(mapRowToVersion);
  }

  async get(templateId: string, version: number): Promise<TemplateVersionItem | null> {
    const db = createDb();
    const rows = await withDbRetry(() =>
      db
        .select()
        .from(templateVersions)
        .where(
          and(
            eq(templateVersions.templateId, templateId),
            eq(templateVersions.version, version)
          )
        )
        .limit(1)
    );
    if (rows.length === 0) return null;
    return mapRowToVersion(rows[0]);
  }

  async latestAcrossTemplates(limit = 20): Promise<TemplateVersionItem[]> {
    const db = createDb();
    const rows = await withDbRetry(() =>
      db
        .select()
        .from(templateVersions)
        .orderBy(desc(templateVersions.createdAt))
        .limit(limit)
    );
    return rows.map(mapRowToVersion);
  }
}

export class FakeInMemoryTemplateVersionRepository implements TemplateVersionRepository {
  private items: TemplateVersionItem[] = [];

  async add(item: Omit<TemplateVersionItem, "id" | "createdAt">): Promise<TemplateVersionItem> {
    const existing = this.items.find(
      (v) => v.templateId === item.templateId && v.version === item.version
    );
    if (existing) {
      throw new Error(`Versi ${item.version} untuk template tersebut sudah ada`);
    }

    const created: TemplateVersionItem = {
      ...item,
      id: `ver-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
    };
    this.items.push(created);
    return created;
  }

  async listByTemplate(templateId: string): Promise<TemplateVersionItem[]> {
    return this.items
      .filter((v) => v.templateId === templateId)
      .sort((a, b) => b.version - a.version);
  }

  async get(templateId: string, version: number): Promise<TemplateVersionItem | null> {
    const found = this.items.find(
      (v) => v.templateId === templateId && v.version === version
    );
    return found ? { ...found } : null;
  }

  async latestAcrossTemplates(limit = 20): Promise<TemplateVersionItem[]> {
    return [...this.items]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }
}

let activeVersionRepo: TemplateVersionRepository = new DrizzleTemplateVersionRepository();

export function setTemplateVersionRepository(repo: TemplateVersionRepository): void {
  activeVersionRepo = repo;
}

export function getTemplateVersionRepository(): TemplateVersionRepository {
  return activeVersionRepo;
}

export const templateVersionRepository: TemplateVersionRepository = {
  add(item) {
    return getTemplateVersionRepository().add(item);
  },
  listByTemplate(templateId) {
    return getTemplateVersionRepository().listByTemplate(templateId);
  },
  get(templateId, version) {
    return getTemplateVersionRepository().get(templateId, version);
  },
  latestAcrossTemplates(limit) {
    return getTemplateVersionRepository().latestAcrossTemplates(limit);
  },
};
