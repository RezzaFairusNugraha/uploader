import { and, desc, eq } from "drizzle-orm";
import { createDb, withDbRetry } from "@/db";
import { templates } from "@/db/schema";
import {
  TemplateDefinitionSchema,
  type ColumnDefinition,
  type TemplateDefinition,
  type TemplateDelimiter,
  type TemplateStatus,
} from "./schema";

export interface TemplateRepository {
  list(): Promise<TemplateDefinition[]>;
  get(id: string): Promise<TemplateDefinition | null>;
  getBySlug(slug: string): Promise<TemplateDefinition | null>;
  create(template: TemplateDefinition): Promise<TemplateDefinition>;
  update(
    id: string,
    patch: Partial<Omit<TemplateDefinition, "id" | "createdAt">>
  ): Promise<TemplateDefinition>;
  archive(id: string): Promise<TemplateDefinition>;
}

function mapRowToTemplate(row: typeof templates.$inferSelect): TemplateDefinition {
  const tpl: TemplateDefinition = {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    delimiter: row.delimiter as TemplateDelimiter,
    status: row.status as TemplateStatus,
    volume: {
      catalog: row.catalog,
      schema: row.schema,
      name: row.volumeName,
    },
    version: row.version,
    columns: row.columns as ColumnDefinition[],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };

  return TemplateDefinitionSchema.parse(tpl);
}

export class DrizzleTemplateRepository implements TemplateRepository {
  async list(): Promise<TemplateDefinition[]> {
    const db = createDb();
    const rows = await withDbRetry(() =>
      db.select().from(templates).orderBy(desc(templates.createdAt))
    );
    return rows.map(mapRowToTemplate);
  }

  async get(id: string): Promise<TemplateDefinition | null> {
    const db = createDb();
    const rows = await withDbRetry(() =>
      db.select().from(templates).where(eq(templates.id, id)).limit(1)
    );
    if (rows.length === 0) return null;
    return mapRowToTemplate(rows[0]);
  }

  async getBySlug(slug: string): Promise<TemplateDefinition | null> {
    const db = createDb();
    const rows = await withDbRetry(() =>
      db.select().from(templates).where(eq(templates.slug, slug)).limit(1)
    );
    if (rows.length === 0) return null;
    return mapRowToTemplate(rows[0]);
  }

  async create(template: TemplateDefinition): Promise<TemplateDefinition> {
    const validated = TemplateDefinitionSchema.parse(template);
    const existing = await this.getBySlug(validated.slug);
    if (existing) {
      throw new Error(`Template dengan slug '${validated.slug}' sudah ada`);
    }

    const db = createDb();
    const rows = await withDbRetry(() =>
      db
        .insert(templates)
        .values({
          id: validated.id,
          name: validated.name,
          slug: validated.slug,
          description: validated.description,
          delimiter: validated.delimiter,
          status: validated.status,
          catalog: validated.volume.catalog,
          schema: validated.volume.schema,
          volumeName: validated.volume.name,
          version: validated.version,
          columns: validated.columns,
          createdAt: new Date(validated.createdAt),
          updatedAt: new Date(validated.updatedAt),
        })
        .returning()
    );

    return mapRowToTemplate(rows[0]);
  }

  async update(
    id: string,
    patch: Partial<Omit<TemplateDefinition, "id" | "createdAt">>
  ): Promise<TemplateDefinition> {
    const current = await this.get(id);
    if (!current) {
      throw new Error(`Template dengan id '${id}' tidak ditemukan`);
    }

    if (patch.slug && patch.slug !== current.slug) {
      const existingWithSlug = await this.getBySlug(patch.slug);
      if (existingWithSlug && existingWithSlug.id !== id) {
        throw new Error(`Template dengan slug '${patch.slug}' sudah ada`);
      }
    }

    const expectedVersion = current.version;
    const newVersion = expectedVersion + 1;
    const now = new Date();

    const merged: TemplateDefinition = {
      ...current,
      ...patch,
      id: current.id,
      createdAt: current.createdAt,
      version: newVersion,
      updatedAt: now.toISOString(),
    };
    const validated = TemplateDefinitionSchema.parse(merged);

    const db = createDb();
    const rows = await withDbRetry(() =>
      db
        .update(templates)
        .set({
          name: validated.name,
          slug: validated.slug,
          description: validated.description,
          delimiter: validated.delimiter,
          status: validated.status,
          catalog: validated.volume.catalog,
          schema: validated.volume.schema,
          volumeName: validated.volume.name,
          version: newVersion,
          columns: validated.columns,
          updatedAt: now,
        })
        .where(
          and(
            eq(templates.id, id),
            eq(templates.version, expectedVersion)
          )
        )
        .returning()
    );

    if (rows.length === 0) {
      throw new Error(
        "Perubahan gagal disimpan karena template telah diperbarui oleh pengguna lain. Silakan muat ulang halaman."
      );
    }

    return mapRowToTemplate(rows[0]);
  }

  async archive(id: string): Promise<TemplateDefinition> {
    return this.update(id, { status: "diarsipkan" });
  }
}

export class FakeInMemoryTemplateRepository implements TemplateRepository {
  private items = new Map<string, TemplateDefinition>();

  async list(): Promise<TemplateDefinition[]> {
    const list = Array.from(this.items.values()).map((item) =>
      TemplateDefinitionSchema.parse(item)
    );
    return list.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async get(id: string): Promise<TemplateDefinition | null> {
    const item = this.items.get(id);
    if (!item) return null;
    return TemplateDefinitionSchema.parse(item);
  }

  async getBySlug(slug: string): Promise<TemplateDefinition | null> {
    for (const item of this.items.values()) {
      if (item.slug === slug) {
        return TemplateDefinitionSchema.parse(item);
      }
    }
    return null;
  }

  async create(template: TemplateDefinition): Promise<TemplateDefinition> {
    const validated = TemplateDefinitionSchema.parse(template);
    const existing = await this.getBySlug(validated.slug);
    if (existing) {
      throw new Error(`Template dengan slug '${validated.slug}' sudah ada`);
    }
    if (this.items.has(validated.id)) {
      throw new Error(`Template dengan id '${validated.id}' sudah ada`);
    }
    this.items.set(validated.id, validated);
    return validated;
  }

  async update(
    id: string,
    patch: Partial<Omit<TemplateDefinition, "id" | "createdAt">>
  ): Promise<TemplateDefinition> {
    const current = this.items.get(id);
    if (!current) {
      throw new Error(`Template dengan id '${id}' tidak ditemukan`);
    }

    if (patch.version !== undefined && patch.version !== current.version) {
      throw new Error(
        "Perubahan gagal disimpan karena template telah diperbarui oleh pengguna lain. Silakan muat ulang halaman."
      );
    }

    if (patch.slug && patch.slug !== current.slug) {
      const existingWithSlug = await this.getBySlug(patch.slug);
      if (existingWithSlug && existingWithSlug.id !== id) {
        throw new Error(`Template dengan slug '${patch.slug}' sudah ada`);
      }
    }

    const updated: TemplateDefinition = {
      ...current,
      ...patch,
      id: current.id,
      createdAt: current.createdAt,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };

    const validated = TemplateDefinitionSchema.parse(updated);
    this.items.set(id, validated);
    return validated;
  }

  async archive(id: string): Promise<TemplateDefinition> {
    return this.update(id, { status: "diarsipkan" });
  }
}

let activeTemplateRepository: TemplateRepository = new DrizzleTemplateRepository();

export function setTemplateRepository(repo: TemplateRepository): void {
  activeTemplateRepository = repo;
}

export function getTemplateRepository(): TemplateRepository {
  return activeTemplateRepository;
}

export const templateRepository: TemplateRepository = {
  list() {
    return getTemplateRepository().list();
  },
  get(id: string) {
    return getTemplateRepository().get(id);
  },
  getBySlug(slug: string) {
    return getTemplateRepository().getBySlug(slug);
  },
  create(template: TemplateDefinition) {
    return getTemplateRepository().create(template);
  },
  update(id: string, patch: Partial<Omit<TemplateDefinition, "id" | "createdAt">>) {
    return getTemplateRepository().update(id, patch);
  },
  archive(id: string) {
    return getTemplateRepository().archive(id);
  },
};
