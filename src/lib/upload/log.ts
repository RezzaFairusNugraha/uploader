import { desc, eq } from "drizzle-orm";
import { createDb, withDbRetry } from "@/db";
import { uploadLog, type UploadLogRow } from "@/db/schema";

export interface UploadLogEntry {
  id: string;
  templateId: string;
  originalName: string;
  storedName: string;
  sizeBytes: number;
  format: string;
  destinationPath: string;
  status: string;
  rowCount?: number | null;
  uploaderName?: string | null;
  errorMessage?: string | null;
  createdAt: string;
}

export interface CreateUploadLogInput {
  id?: string;
  templateId: string;
  originalName: string;
  storedName: string;
  sizeBytes: number;
  format: string;
  destinationPath: string;
  status: string;
  rowCount?: number | null;
  uploaderName?: string | null;
  errorMessage?: string | null;
}

export type UploadLogItem = UploadLogEntry;

export interface UploadLogRepository {
  insert(input: CreateUploadLogInput): Promise<UploadLogEntry>;
  listByTemplate(templateId: string, limit?: number): Promise<UploadLogEntry[]>;
  listRecent(limit?: number): Promise<UploadLogEntry[]>;
}

function mapRowToLogEntry(row: UploadLogRow): UploadLogEntry {
  return {
    id: row.id,
    templateId: row.templateId,
    originalName: row.originalName,
    storedName: row.storedName,
    sizeBytes: row.sizeBytes,
    format: row.format,
    destinationPath: row.destinationPath,
    status: row.status,
    rowCount: row.rowCount,
    uploaderName: row.uploaderName,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
  };
}

export class DrizzleUploadLogRepository implements UploadLogRepository {
  async insert(input: CreateUploadLogInput): Promise<UploadLogEntry> {
    const db = createDb();
    const rows = await withDbRetry(() =>
      db
        .insert(uploadLog)
        .values({
          id: input.id,
          templateId: input.templateId,
          originalName: input.originalName,
          storedName: input.storedName,
          sizeBytes: input.sizeBytes,
          format: input.format,
          destinationPath: input.destinationPath,
          status: input.status,
          rowCount: input.rowCount,
          uploaderName: input.uploaderName,
          errorMessage: input.errorMessage,
          createdAt: new Date(),
        })
        .returning()
    );
    return mapRowToLogEntry(rows[0]);
  }

  async listByTemplate(templateId: string, limit: number = 50): Promise<UploadLogEntry[]> {
    const db = createDb();
    const rows = await withDbRetry(() =>
      db
        .select()
        .from(uploadLog)
        .where(eq(uploadLog.templateId, templateId))
        .orderBy(desc(uploadLog.createdAt))
        .limit(limit)
    );
    return rows.map(mapRowToLogEntry);
  }

  async listRecent(limit: number = 50): Promise<UploadLogEntry[]> {
    const db = createDb();
    const rows = await withDbRetry(() =>
      db
        .select()
        .from(uploadLog)
        .orderBy(desc(uploadLog.createdAt))
        .limit(limit)
    );
    return rows.map(mapRowToLogEntry);
  }
}

export class FakeInMemoryUploadLogRepository implements UploadLogRepository {
  private logs: UploadLogEntry[] = [];

  async insert(input: CreateUploadLogInput): Promise<UploadLogEntry> {
    const entry: UploadLogEntry = {
      id: input.id || crypto.randomUUID(),
      templateId: input.templateId,
      originalName: input.originalName,
      storedName: input.storedName,
      sizeBytes: input.sizeBytes,
      format: input.format,
      destinationPath: input.destinationPath,
      status: input.status,
      rowCount: input.rowCount,
      uploaderName: input.uploaderName,
      errorMessage: input.errorMessage,
      createdAt: new Date().toISOString(),
    };
    this.logs.unshift(entry);
    return entry;
  }

  async listByTemplate(templateId: string, limit: number = 50): Promise<UploadLogEntry[]> {
    return this.logs
      .filter((l) => l.templateId === templateId)
      .slice(0, limit);
  }

  async listRecent(limit: number = 50): Promise<UploadLogEntry[]> {
    return this.logs.slice(0, limit);
  }
}

let activeUploadLogRepository: UploadLogRepository = new DrizzleUploadLogRepository();

export function setUploadLogRepository(repo: UploadLogRepository): void {
  activeUploadLogRepository = repo;
}

export function getUploadLogRepository(): UploadLogRepository {
  return activeUploadLogRepository;
}

export const uploadLogRepository: UploadLogRepository = {
  insert(input: CreateUploadLogInput) {
    return getUploadLogRepository().insert(input);
  },
  listByTemplate(templateId: string, limit?: number) {
    return getUploadLogRepository().listByTemplate(templateId, limit);
  },
  listRecent(limit?: number) {
    return getUploadLogRepository().listRecent(limit);
  },
};
