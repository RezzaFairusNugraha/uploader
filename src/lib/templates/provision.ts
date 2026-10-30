import { createDatabricksClient, type DatabricksClient } from "@/lib/databricks";
import { USER_COPY } from "@/lib/copy";
import { getDatabricksConfig } from "@/platform/config";
import { templateRepository } from "./repository";
import {
  isReservedObjectName,
  isValidObjectName,
  resolveVolumeName,
} from "./naming";
import type { ProvisionStepStatus, TemplateDefinition } from "./schema";

export interface ProvisionTemplateResult {
  success: boolean;
  template: TemplateDefinition;
  steps: ProvisionStepStatus[];
  error?: string;
  errorDetail?: string;
}

export interface ProvisionTemplateOptions {
  client?: DatabricksClient;
}

export async function provisionTemplate(
  templateId: string,
  options?: ProvisionTemplateOptions
): Promise<ProvisionTemplateResult> {
  let template = await templateRepository.get(templateId);
  if (!template) {
    throw new Error(`Template dengan id '${templateId}' tidak ditemukan`);
  }

  const dbConfig = getDatabricksConfig();
  if (!dbConfig && !options?.client) {
    throw new Error(USER_COPY.connection.notConnected);
  }

  const client =
    options?.client ||
    createDatabricksClient(dbConfig!.host, dbConfig!.token);

  const steps: ProvisionStepStatus[] = [
    {
      step: "save_definition",
      name: "Menyimpan template",
      status: "success",
    },
    {
      step: "create_schema",
      name: "Membuat folder induk",
      status: "pending",
    },
    {
      step: "create_volume",
      name: "Membuat folder penyimpanan",
      status: "pending",
    },
    {
      step: "create_csv",
      name: "Menyiapkan folder CSV",
      status: "pending",
    },
    {
      step: "create_parquet",
      name: "Menyiapkan folder Parquet",
      status: "pending",
    },
    {
      step: "activate",
      name: "Siap dipakai",
      status: "pending",
    },
  ];

  const catalog = dbConfig?.catalog || template.volume?.catalog || "main";
  const schemaName = template.slug;
  const configuredVolume = dbConfig?.volumeName?.trim() || "";
  const volumeName = resolveVolumeName(template.slug, configuredVolume);

  const COLLISION_MSG = "Nama folder sudah dipakai. Pilih nama lain.";

  if (
    !isValidObjectName(schemaName) ||
    isReservedObjectName(schemaName) ||
    !isValidObjectName(volumeName) ||
    isReservedObjectName(volumeName)
  ) {
    steps[1].status = "error";
    steps[1].message = COLLISION_MSG;
    await templateRepository.update(templateId, { status: "gagal" });
    return {
      success: false,
      template: (await templateRepository.get(templateId)) || template,
      steps,
      error: COLLISION_MSG,
    };
  }

  let schemaCreatedByApp = false;
  let volumeCreatedByApp = false;
  const expectedMarker = `Dibuat oleh Data Uploader (template ${templateId})`;

  try {
    steps[1].status = "running";
    const schemaCheck = await client.getSchema(catalog, schemaName);

    if (schemaCheck.success && schemaCheck.data) {
      const comment = schemaCheck.data.comment || "";
      if (comment.includes(expectedMarker)) {
        schemaCreatedByApp = true;
        steps[1].status = "success";
        steps[1].message = "Melanjutkan folder induk yang sudah disiapkan.";
      } else {
        steps[1].status = "error";
        steps[1].message = COLLISION_MSG;
        await templateRepository.update(templateId, { status: "gagal" });
        return {
          success: false,
          template: (await templateRepository.get(templateId)) || template,
          steps,
          error: COLLISION_MSG,
        };
      }
    } else {
      const createSchemaRes = await client.createSchema(catalog, schemaName, templateId);
      if (!createSchemaRes.success && createSchemaRes.status !== 409) {
        steps[1].status = "error";
        if (createSchemaRes.status === 403) {
          steps[1].message =
            "Akun koneksi belum punya izin membuat folder penyimpanan baru. Hubungi admin.";
          steps[1].fix = `USE CATALOG dan CREATE SCHEMA pada katalog '${catalog}'.`;
        } else {
          steps[1].message = createSchemaRes.error || "Gagal membuat folder induk";
        }
        await templateRepository.update(templateId, { status: "gagal" });
        return {
          success: false,
          template: (await templateRepository.get(templateId)) || template,
          steps,
          error: steps[1].message,
          errorDetail: steps[1].fix,
        };
      }
      schemaCreatedByApp = true;
      steps[1].status = "success";
    }

    steps[2].status = "running";
    const volumeCheck = await client.getVolume(catalog, schemaName, volumeName);

    if (volumeCheck.success && volumeCheck.data) {
      const comment = volumeCheck.data.comment || "";
      if (comment.includes(expectedMarker)) {
        volumeCreatedByApp = true;
        steps[2].status = "success";
        steps[2].message = "Melanjutkan folder penyimpanan yang sudah disiapkan.";
      } else {
        steps[2].status = "error";
        steps[2].message = COLLISION_MSG;
        await templateRepository.update(templateId, { status: "gagal" });
        return {
          success: false,
          template: (await templateRepository.get(templateId)) || template,
          steps,
          error: COLLISION_MSG,
        };
      }
    } else {
      const createVolRes = await client.createVolume(
        catalog,
        schemaName,
        volumeName,
        expectedMarker
      );
      if (!createVolRes.success && createVolRes.status !== 409) {
        steps[2].status = "error";
        if (createVolRes.status === 403) {
          steps[2].message =
            "Akun koneksi belum punya izin membuat folder penyimpanan baru. Hubungi admin.";
          steps[2].fix = `USE CATALOG dan CREATE SCHEMA pada katalog '${catalog}'.`;
        } else {
          steps[2].message = createVolRes.error || "Gagal membuat folder penyimpanan";
        }
        await templateRepository.update(templateId, { status: "gagal" });
        return {
          success: false,
          template: (await templateRepository.get(templateId)) || template,
          steps,
          error: steps[2].message,
          errorDetail: steps[2].fix,
        };
      }
      volumeCreatedByApp = true;
      steps[2].status = "success";
    }

    steps[3].status = "running";
    const csvPath = `/Volumes/${catalog}/${schemaName}/${volumeName}/csv`;
    const csvRes = await client.createDirectory(csvPath);
    if (!csvRes.success && csvRes.status !== 409) {
      steps[3].status = "error";
      steps[3].message = csvRes.error || "Gagal membuat folder csv/";
      await templateRepository.update(templateId, { status: "gagal" });
      return {
        success: false,
        template: (await templateRepository.get(templateId)) || template,
        steps,
        error: steps[3].message,
      };
    }
    steps[3].status = "success";

    steps[4].status = "running";
    const parquetPath = `/Volumes/${catalog}/${schemaName}/${volumeName}/parquet`;
    const parquetRes = await client.createDirectory(parquetPath);
    if (!parquetRes.success && parquetRes.status !== 409) {
      steps[4].status = "error";
      steps[4].message = parquetRes.error || "Gagal membuat folder parquet/";
      await templateRepository.update(templateId, { status: "gagal" });
      return {
        success: false,
        template: (await templateRepository.get(templateId)) || template,
        steps,
        error: steps[4].message,
      };
    }
    steps[4].status = "success";

    steps[5].status = "running";
    const workspaceHost = dbConfig?.workspaceHost || null;

    template = await templateRepository.update(templateId, {
      status: "aktif",
      volume: {
        catalog,
        schema: schemaName,
        name: volumeName,
      },
      schemaCreatedByApp,
      volumeCreatedByApp,
      workspaceHost,
    });
    steps[5].status = "success";

    return {
      success: true,
      template,
      steps,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan";
    await templateRepository.update(templateId, { status: "gagal" });
    return {
      success: false,
      template: (await templateRepository.get(templateId)) || template,
      steps,
      error: message,
    };
  }
}
