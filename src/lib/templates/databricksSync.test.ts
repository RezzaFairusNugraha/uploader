import { describe, expect, it, beforeEach } from "bun:test";
import { inspectVolume } from "@/lib/databricks/inspect";
import type { DatabricksClient, DirectoryEntry } from "@/lib/databricks";
import {
  FakeInMemoryTemplateRepository,
  setTemplateRepository,
} from "./repository";
import {
  FakeInMemoryTemplateVersionRepository,
  setTemplateVersionRepository,
} from "./versions";

function createMockDatabricksClient(options: {
  directories?: Record<string, DirectoryEntry[]>;
  files?: Record<string, Uint8Array>;
  volumes?: string[];
}): DatabricksClient {
  const directories = options.directories || {};
  const files = options.files || {};

  return {
    async listCatalogs() {
      return { success: true, data: { catalogs: [{ name: "main" }] } };
    },
    async listSchemas() {
      return { success: true, data: { schemas: [{ name: "default" }] } };
    },
    async getSchema() {
      return { success: true, data: { name: "default", catalog_name: "main" } };
    },
    async getVolume() {
      return {
        success: true,
        data: {
          name: "test_volume",
          catalog_name: "main",
          schema_name: "default",
          volume_type: "MANAGED",
        },
      };
    },
    async listVolumes() {
      const vols = (options.volumes || []).map((name) => ({
        name,
        catalog_name: "main",
        schema_name: "default",
        volume_type: "MANAGED",
      }));
      return { success: true, data: { volumes: vols } };
    },
    async createVolume() {
      return {
        success: true,
        data: {
          name: "new_vol",
          catalog_name: "main",
          schema_name: "default",
          volume_type: "MANAGED",
        },
      };
    },
    async deleteVolume() {
      return { success: true };
    },
    async listVolumeContents() {
      return {
        success: true,
        data: {
          csvFiles: 0,
          csvSize: 0,
          parquetFiles: 0,
          parquetSize: 0,
          totalFiles: 0,
          totalSize: 0,
          capped: false,
        },
      };
    },
    async listDirectory(path: string) {
      const clean = path.replace(/\/+$/, "");
      const contents = directories[clean] || [];
      return { success: true, data: { contents } };
    },
    async readRange(path: string, start: number, length: number) {
      const clean = path.replace(/\/+$/, "");
      const content = files[clean];
      if (!content) {
        return { success: false, status: 404, error: "File tidak ditemukan" };
      }
      const slice = content.subarray(start, start + length);
      return { success: true, data: slice };
    },
    async createDirectory() {
      return { success: true };
    },
    async checkDirectory() {
      return { success: true };
    },
    async uploadFile() {
      return { success: true };
    },
  };
}

describe("Part B: Databricks Volume Inspection & Lenient Inference", () => {
  let fakeRepo: FakeInMemoryTemplateRepository;
  let fakeVerRepo: FakeInMemoryTemplateVersionRepository;

  beforeEach(() => {
    fakeRepo = new FakeInMemoryTemplateRepository();
    setTemplateRepository(fakeRepo);
    fakeVerRepo = new FakeInMemoryTemplateVersionRepository();
    setTemplateVersionRepository(fakeVerRepo);
  });

  it("handles a volume without data files gracefully", async () => {
    const mock = createMockDatabricksClient({
      directories: {
        "/Volumes/main/default/empty_volume": [],
      },
    });

    const res = await inspectVolume(mock, "main", "default", "empty_volume");
    expect(res.hasDataFiles).toBe(false);
    expect(res.csvFilesCount).toBe(0);
    expect(res.parquetFilesCount).toBe(0);
    expect(res.draft.name).toBe("Empty Volume");
    expect(res.draft.columns).toEqual([]);
    expect(res.csvFolderStatus).toBe("akan dibuat");
    expect(res.parquetFolderStatus).toBe("akan dibuat");
  });

  it("picks folders by highest file count and ties go to the newest file", async () => {
    const mock = createMockDatabricksClient({
      directories: {
        "/Volumes/main/default/my_vol": [
          {
            path: "/Volumes/main/default/my_vol/csv_old",
            name: "csv_old",
            is_directory: true,
          },
          {
            path: "/Volumes/main/default/my_vol/csv_new",
            name: "csv_new",
            is_directory: true,
          },
        ],
        "/Volumes/main/default/my_vol/csv_old": [
          {
            path: "/Volumes/main/default/my_vol/csv_old/file1.csv",
            name: "file1.csv",
            is_directory: false,
            file_size: 100,
            modification_time: 1000,
          },
        ],
        "/Volumes/main/default/my_vol/csv_new": [
          {
            path: "/Volumes/main/default/my_vol/csv_new/file2.csv",
            name: "file2.csv",
            is_directory: false,
            file_size: 100,
            modification_time: 2000,
          },
        ],
      },
      files: {
        "/Volumes/main/default/my_vol/csv_new/file2.csv": new TextEncoder().encode(
          "kode,nama\nA01,Barang A\n"
        ),
      },
    });

    const res = await inspectVolume(mock, "main", "default", "my_vol");
    expect(res.csvFolder).toBe("csv_new");
    expect(res.csvFolderStatus).toBe("ada");
  });

  it("records unsupported formats and parses TSV with tab delimiter", async () => {
    const tsvData = "id\tkode\tnilai\n1\tK01\t100\n2\tK02\t200\n";
    const mock = createMockDatabricksClient({
      directories: {
        "/Volumes/main/default/mixed_vol": [
          {
            path: "/Volumes/main/default/mixed_vol/data.tsv",
            name: "data.tsv",
            is_directory: false,
            file_size: tsvData.length,
            modification_time: 5000,
          },
          {
            path: "/Volumes/main/default/mixed_vol/doc.xlsx",
            name: "doc.xlsx",
            is_directory: false,
            file_size: 500,
            modification_time: 5000,
          },
          {
            path: "/Volumes/main/default/mixed_vol/backup.xlsx",
            name: "backup.xlsx",
            is_directory: false,
            file_size: 600,
            modification_time: 6000,
          },
        ],
      },
      files: {
        "/Volumes/main/default/mixed_vol/data.tsv": new TextEncoder().encode(tsvData),
      },
    });

    const res = await inspectVolume(mock, "main", "default", "mixed_vol");
    expect(res.unsupportedFormats).toEqual([{ ext: ".xlsx", count: 2 }]);
    expect(res.draft.columns.map((c) => c.name)).toEqual(["id", "kode", "nilai"]);
  });

  it("drops partial last line when reading range from CSV", async () => {
    const cutContent = "col1,col2\nval1,val2\nval3,val4\nparti";
    const mock = createMockDatabricksClient({
      directories: {
        "/Volumes/main/default/partial_vol": [
          {
            path: "/Volumes/main/default/partial_vol/cut.csv",
            name: "cut.csv",
            is_directory: false,
            file_size: cutContent.length,
            modification_time: 1000,
          },
        ],
      },
      files: {
        "/Volumes/main/default/partial_vol/cut.csv": new TextEncoder().encode(cutContent),
      },
    });

    const res = await inspectVolume(mock, "main", "default", "partial_vol");
    expect(res.draft.columns.map((c) => c.name)).toEqual(["col1", "col2"]);
  });

  it("groups sampled files by column set regardless of order and warns about mismatched groups", async () => {
    const csvA = "col_a,col_b\n1,2\n";
    const csvB = "col_b,col_a\n3,4\n";
    const csvC = "col_x,col_y\n9,9\n";

    const mock = createMockDatabricksClient({
      directories: {
        "/Volumes/main/default/grouped_vol": [
          {
            path: "/Volumes/main/default/grouped_vol/fileA.csv",
            name: "fileA.csv",
            is_directory: false,
            file_size: csvA.length,
            modification_time: 1000,
          },
          {
            path: "/Volumes/main/default/grouped_vol/fileB.csv",
            name: "fileB.csv",
            is_directory: false,
            file_size: csvB.length,
            modification_time: 2000,
          },
          {
            path: "/Volumes/main/default/grouped_vol/fileC.csv",
            name: "fileC.csv",
            is_directory: false,
            file_size: csvC.length,
            modification_time: 3000,
          },
        ],
      },
      files: {
        "/Volumes/main/default/grouped_vol/fileA.csv": new TextEncoder().encode(csvA),
        "/Volumes/main/default/grouped_vol/fileB.csv": new TextEncoder().encode(csvB),
        "/Volumes/main/default/grouped_vol/fileC.csv": new TextEncoder().encode(csvC),
      },
    });

    const res = await inspectVolume(mock, "main", "default", "grouped_vol");
    expect(res.otherGroups.length).toBe(1);
    expect(res.otherGroups[0].files).toContain("fileC.csv");
    expect(res.warnings.some((w) => w.includes("file lain punya kolom berbeda"))).toBe(true);
    expect(res.draft.columns.map((c) => c.name)).toContain("col_a");
    expect(res.draft.columns.map((c) => c.name)).toContain("col_b");
  });

  it("requires at least 50 sampled rows and zero blanks for required: true", async () => {
    let rows49 = "id,nama\n";
    for (let i = 1; i <= 49; i++) {
      rows49 += `${i},User${i}\n`;
    }

    const mock49 = createMockDatabricksClient({
      directories: {
        "/Volumes/main/default/vol49": [
          {
            path: "/Volumes/main/default/vol49/data.csv",
            name: "data.csv",
            is_directory: false,
            file_size: rows49.length,
            modification_time: 1000,
          },
        ],
      },
      files: {
        "/Volumes/main/default/vol49/data.csv": new TextEncoder().encode(rows49),
      },
    });

    const res49 = await inspectVolume(mock49, "main", "default", "vol49");
    const idCol49 = res49.draft.columns.find((c) => c.name === "id");
    expect(idCol49?.required).toBe(false);

    let rows50 = "id,nama\n";
    for (let i = 1; i <= 50; i++) {
      rows50 += `${i},User${i}\n`;
    }

    const mock50 = createMockDatabricksClient({
      directories: {
        "/Volumes/main/default/vol50": [
          {
            path: "/Volumes/main/default/vol50/data.csv",
            name: "data.csv",
            is_directory: false,
            file_size: rows50.length,
            modification_time: 1000,
          },
        ],
      },
      files: {
        "/Volumes/main/default/vol50/data.csv": new TextEncoder().encode(rows50),
      },
    });

    const res50 = await inspectVolume(mock50, "main", "default", "vol50");
    const idCol50 = res50.draft.columns.find((c) => c.name === "id");
    expect(idCol50?.required).toBe(true);
  });

  it("infers digits(n) only when all values have same length n >= 4 across >= 20 rows and never enforces min/max", async () => {
    let lines = "nik,skor\n";
    for (let i = 0; i < 25; i++) {
      lines += `123456,${10 + i}\n`;
    }

    const mock = createMockDatabricksClient({
      directories: {
        "/Volumes/main/default/digits_vol": [
          {
            path: "/Volumes/main/default/digits_vol/data.csv",
            name: "data.csv",
            is_directory: false,
            file_size: lines.length,
            modification_time: 1000,
          },
        ],
      },
      files: {
        "/Volumes/main/default/digits_vol/data.csv": new TextEncoder().encode(lines),
      },
    });

    const res = await inspectVolume(mock, "main", "default", "digits_vol");
    const nikCol = res.draft.columns.find((c) => c.name === "nik");
    expect(nikCol?.rule.type).toBe("digits");
    if (nikCol?.rule.type === "digits") {
      expect(nikCol.rule.length).toBe(6);
    }

    const skorCol = res.draft.columns.find((c) => c.name === "skor");
    expect(skorCol?.rule.type).toBe("integer");
    if (skorCol?.rule.type === "integer") {
      expect(skorCol.rule.min).toBeUndefined();
      expect(skorCol.rule.max).toBeUndefined();
    }
  });

  it("preserves allowedText in numeric columns and never enforces min or max for decimal", async () => {
    let lines = "nilai\n";
    for (let i = 0; i < 90; i++) {
      lines += `${i * 1.5}\n`;
    }
    for (let i = 0; i < 10; i++) {
      lines += "NIHIL\n";
    }

    const mock = createMockDatabricksClient({
      directories: {
        "/Volumes/main/default/dec_vol": [
          {
            path: "/Volumes/main/default/dec_vol/data.csv",
            name: "data.csv",
            is_directory: false,
            file_size: lines.length,
            modification_time: 1000,
          },
        ],
      },
      files: {
        "/Volumes/main/default/dec_vol/data.csv": new TextEncoder().encode(lines),
      },
    });

    const res = await inspectVolume(mock, "main", "default", "dec_vol");
    const nilaiCol = res.draft.columns.find((c) => c.name === "nilai");
    expect(nilaiCol?.rule.type).toBe("decimal");
    if (nilaiCol?.rule.type === "decimal") {
      expect(nilaiCol.rule.min).toBeUndefined();
      expect(nilaiCol.rule.max).toBeUndefined();
      expect(nilaiCol.rule.allowedText).toContain("NIHIL");
    }
  });
});
