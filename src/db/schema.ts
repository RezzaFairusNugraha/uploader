import { sql } from "drizzle-orm";
import { boolean, integer, jsonb, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const appSettings = pgTable("app_settings", {
  id: integer("id").primaryKey().default(1),
  workspaceUrl: text("workspace_url").notNull(),
  tokenEncrypted: text("token_encrypted").notNull(),
  catalog: text("catalog").notNull(),
  schema: text("schema").notNull(),
  maxUploadMb: integer("max_upload_mb").notNull().default(100),
  maxTemplates: integer("max_templates").notNull().default(50),
  adminPasswordHash: text("admin_password_hash"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const templates = pgTable(
  "templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull().default(""),
    delimiter: text("delimiter").notNull().default(";"),
    status: text("status").notNull().default("membuat"),
    catalog: text("catalog").notNull(),
    schema: text("schema").notNull(),
    volumeName: text("volume_name").notNull(),
    volumeCreatedByApp: boolean("volume_created_by_app").notNull().default(false),
    csvFolder: text("csv_folder").notNull().default("csv"),
    parquetFolder: text("parquet_folder").notNull().default("parquet"),
    workspaceHost: text("workspace_host"),
    needsCheck: boolean("needs_check").notNull().default(false),
    visibility: text("visibility"),
    visibilityCheckedAt: timestamp("visibility_checked_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: text("deleted_by"),
    version: integer("version").notNull().default(1),
    columns: jsonb("columns").notNull(),
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("templates_slug_active_unique")
      .on(table.slug)
      .where(sql`${table.deletedAt} IS NULL`),
  ]
);

export const templateVersions = pgTable(
  "template_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => templates.id),
    version: integer("version").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    changeSummary: text("change_summary").notNull(),
    isBreaking: boolean("is_breaking").notNull().default(false),
    changedBy: text("changed_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("template_versions_template_id_version_unique").on(
      table.templateId,
      table.version
    ),
  ]
);

export const uploadLog = pgTable("upload_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  templateId: uuid("template_id").notNull(),
  originalName: text("original_name").notNull(),
  storedName: text("stored_name").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  format: text("format").notNull(),
  destinationPath: text("destination_path").notNull(),
  status: text("status").notNull(),
  rowCount: integer("row_count"),
  uploaderName: text("uploader_name"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type AppSettingsRow = typeof appSettings.$inferSelect;
export type InsertAppSettings = typeof appSettings.$inferInsert;

export type TemplateRow = typeof templates.$inferSelect;
export type InsertTemplate = typeof templates.$inferInsert;

export type TemplateVersionRow = typeof templateVersions.$inferSelect;
export type InsertTemplateVersion = typeof templateVersions.$inferInsert;

export type UploadLogRow = typeof uploadLog.$inferSelect;
export type InsertUploadLog = typeof uploadLog.$inferInsert;
