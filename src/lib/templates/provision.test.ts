import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { DatabricksClient, DatabricksResponse, UnityCatalogSchemaInfo, UnityCatalogVolumeInfo } from "@/lib/databricks";
import {
  FakeInMemoryTemplateRepository,
  setTemplateRepository,
} from "./repository";
import {
  provisionTemplate,
} from "./provision";
import {
  isReservedObjectName,
  isValidObjectName,
  validateSchemaName,
  validateVolumeName,
} from "./naming";
import type { TemplateDefinition } from "./schema";

describe("Part B: Provisioning Flow per Template", () => {
  let repo: FakeInMemoryTemplateRepository;
  const originalEnv = { ...process.env };

  const validTemplate: TemplateDefinition = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    name: "Target Penjualan",
    slug: "target_penjualan",
    description: "Template target",
    delimiter: ";",
    status: "membuat",
    volume: {
      catalog: "main",
      schema: "target_penjualan",
      name: "file_storage",
    },
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    columns: [
      {
        name: "kode",
        required: true,
        rule: { type: "digits", length: 9 },
      },
    ],
  };

  beforeEach(() => {
    repo = new FakeInMemoryTemplateRepository();
    setTemplateRepository(repo);

    process.env.DATABRICKS_HOST = "https://dbc-test.cloud.databricks.com";
    process.env.DATABRICKS_TOKEN = "valid-token";
    process.env.DATABRICKS_CATALOG = "main";
    process.env.DATABRICKS_VOLUME_NAME = "file_storage";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("validates naming rules and reserves information_schema and default", () => {
    expect(isValidObjectName("target_penjualan")).toBe(true);
    expect(isValidObjectName("ab")).toBe(false);
    expect(isValidObjectName("123abc_")).toBe(false);
    expect(isValidObjectName("A_Capital")).toBe(false);

    expect(isReservedObjectName("information_schema")).toBe(true);
    expect(isReservedObjectName("default")).toBe(true);
    expect(isReservedObjectName("custom_schema")).toBe(false);

    const valRes = validateSchemaName("default");
    expect(valRes.valid).toBe(false);
    expect(valRes.error).toBe("Nama folder sudah dipakai. Pilih nama lain.");

    const volRes = validateVolumeName("information_schema");
    expect(volRes.valid).toBe(false);
    expect(volRes.error).toBe("Nama folder sudah dipakai. Pilih nama lain.");
  });

  it("provisions schema, volume, csv and parquet in order and sets created_by_app flags", async () => {
    await repo.create(validTemplate);
    const callOrder: string[] = [];

    const mockClient: DatabricksClient = {
      getSchema: async () => ({ success: false, status: 404 }),
      createSchema: async (_cat, schema, templateId) => {
        callOrder.push(`createSchema:${schema}:${templateId}`);
        return {
          success: true,
          data: { name: schema, catalog_name: "main", comment: `Dibuat oleh Data Uploader (template ${templateId})` },
        };
      },
      getVolume: async () => ({ success: false, status: 404 }),
      createVolume: async (_cat, _sch, name, comment) => {
        callOrder.push(`createVolume:${name}:${comment}`);
        return {
          success: true,
          data: { name, catalog_name: "main", schema_name: "target_penjualan", volume_type: "MANAGED", comment },
        };
      },
      createDirectory: async (dirPath) => {
        callOrder.push(`createDirectory:${dirPath}`);
        return { success: true, status: 200 };
      },
      listCatalogs: async () => ({ success: true, data: { catalogs: [] } }),
      getCatalog: async () => ({ success: true, data: { name: "main" } }),
      listSchemas: async () => ({ success: true, data: { schemas: [] } }),
      deleteSchema: async () => ({ success: true }),
      listTables: async () => ({ success: true, data: { tables: [] } }),
      listVolumes: async () => ({ success: true, data: { volumes: [] } }),
      deleteVolume: async () => ({ success: true }),
      listVolumeContents: async () => ({ success: true, data: { csvFiles: 0, csvSize: 0, parquetFiles: 0, parquetSize: 0, totalFiles: 0, totalSize: 0, capped: false } }),
      uploadFile: async () => ({ success: true }),
      isSchemaEmpty: async () => true,
    };

    const res = await provisionTemplate(validTemplate.id, { client: mockClient });
    expect(res.success).toBe(true);
    expect(res.template.status).toBe("aktif");
    expect(res.template.schemaCreatedByApp).toBe(true);
    expect(res.template.volumeCreatedByApp).toBe(true);

    expect(callOrder[0]).toBe("createSchema:target_penjualan:123e4567-e89b-12d3-a456-426614174000");
    expect(callOrder[1]).toContain("createVolume:file_storage:Dibuat oleh Data Uploader (template 123e4567-e89b-12d3-a456-426614174000)");
    expect(callOrder[2]).toBe("createDirectory:/Volumes/main/target_penjualan/file_storage/csv");
    expect(callOrder[3]).toBe("createDirectory:/Volumes/main/target_penjualan/file_storage/parquet");
  });

  it("resumes provisioning when schema and volume already exist with template marker", async () => {
    await repo.create(validTemplate);
    const marker = `Dibuat oleh Data Uploader (template ${validTemplate.id})`;

    const mockClient: DatabricksClient = {
      getSchema: async () => ({
        success: true,
        data: { name: "target_penjualan", catalog_name: "main", comment: marker },
      }),
      createSchema: async () => ({ success: false, status: 409 }),
      getVolume: async () => ({
        success: true,
        data: { name: "file_storage", catalog_name: "main", schema_name: "target_penjualan", volume_type: "MANAGED", comment: marker },
      }),
      createVolume: async () => ({ success: false, status: 409 }),
      createDirectory: async () => ({ success: true, status: 200 }),
      listCatalogs: async () => ({ success: true, data: { catalogs: [] } }),
      getCatalog: async () => ({ success: true, data: { name: "main" } }),
      listSchemas: async () => ({ success: true, data: { schemas: [] } }),
      deleteSchema: async () => ({ success: true }),
      listTables: async () => ({ success: true, data: { tables: [] } }),
      listVolumes: async () => ({ success: true, data: { volumes: [] } }),
      deleteVolume: async () => ({ success: true }),
      listVolumeContents: async () => ({ success: true, data: { csvFiles: 0, csvSize: 0, parquetFiles: 0, parquetSize: 0, totalFiles: 0, totalSize: 0, capped: false } }),
      uploadFile: async () => ({ success: true }),
      isSchemaEmpty: async () => true,
    };

    const res = await provisionTemplate(validTemplate.id, { client: mockClient });
    expect(res.success).toBe(true);
    expect(res.template.schemaCreatedByApp).toBe(true);
    expect(res.template.volumeCreatedByApp).toBe(true);
    expect(res.template.status).toBe("aktif");
  });

  it("stops with collision message when schema exists without marker", async () => {
    await repo.create(validTemplate);

    const mockClient: DatabricksClient = {
      getSchema: async () => ({
        success: true,
        data: { name: "target_penjualan", catalog_name: "main", comment: "Created manually by admin" },
      }),
      createSchema: async () => ({ success: false, status: 409 }),
      getVolume: async () => ({ success: false }),
      createVolume: async () => ({ success: false }),
      createDirectory: async () => ({ success: true }),
      listCatalogs: async () => ({ success: true, data: { catalogs: [] } }),
      getCatalog: async () => ({ success: true, data: { name: "main" } }),
      listSchemas: async () => ({ success: true, data: { schemas: [] } }),
      deleteSchema: async () => ({ success: true }),
      listTables: async () => ({ success: true, data: { tables: [] } }),
      listVolumes: async () => ({ success: true, data: { volumes: [] } }),
      deleteVolume: async () => ({ success: true }),
      listVolumeContents: async () => ({ success: true, data: { csvFiles: 0, csvSize: 0, parquetFiles: 0, parquetSize: 0, totalFiles: 0, totalSize: 0, capped: false } }),
      uploadFile: async () => ({ success: true }),
      isSchemaEmpty: async () => true,
    };

    const res = await provisionTemplate(validTemplate.id, { client: mockClient });
    expect(res.success).toBe(false);
    expect(res.error).toBe("Nama folder sudah dipakai. Pilih nama lain.");
    expect(res.template.status).toBe("gagal");
  });

  it("handles 403 on schema creation with permission explanation", async () => {
    await repo.create(validTemplate);

    const mockClient: DatabricksClient = {
      getSchema: async () => ({ success: false, status: 404 }),
      createSchema: async () => ({ success: false, status: 403, error: "Access Denied" }),
      getVolume: async () => ({ success: false }),
      createVolume: async () => ({ success: false }),
      createDirectory: async () => ({ success: true }),
      listCatalogs: async () => ({ success: true, data: { catalogs: [] } }),
      getCatalog: async () => ({ success: true, data: { name: "main" } }),
      listSchemas: async () => ({ success: true, data: { schemas: [] } }),
      deleteSchema: async () => ({ success: true }),
      listTables: async () => ({ success: true, data: { tables: [] } }),
      listVolumes: async () => ({ success: true, data: { volumes: [] } }),
      deleteVolume: async () => ({ success: true }),
      listVolumeContents: async () => ({ success: true, data: { csvFiles: 0, csvSize: 0, parquetFiles: 0, parquetSize: 0, totalFiles: 0, totalSize: 0, capped: false } }),
      uploadFile: async () => ({ success: true }),
      isSchemaEmpty: async () => true,
    };

    const res = await provisionTemplate(validTemplate.id, { client: mockClient });
    expect(res.success).toBe(false);
    expect(res.error).toContain("Akun koneksi belum punya izin membuat folder penyimpanan baru");
    expect(res.errorDetail).toContain("USE CATALOG dan CREATE SCHEMA");
  });
});
