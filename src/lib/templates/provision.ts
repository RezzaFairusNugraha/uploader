import { createDatabricksClient } from "@/lib/databricks";
import { getConnectionState, readDecryptedSettings } from "@/lib/settings";
import { USER_COPY } from "@/lib/copy";
import { templateRepository } from "./repository";
import { resolveVolumeName } from "./naming";
import type { ProvisionStepStatus, TemplateDefinition } from "./schema";

export interface ProvisionTemplateResult {
  success: boolean;
  template: TemplateDefinition;
  steps: ProvisionStepStatus[];
  error?: string;
  errorDetail?: string;
  schemaExists?: boolean;
  volumeExists?: boolean;
}

export interface ProvisionTemplateOptions {
  adoptExisting?: boolean;
  reuseExistingVolume?: boolean;
  catalog?: string;
  schema?: string;
  volumeName?: string;
  changedBy?: string;
}

export async function provisionTemplate(
  templateId: string,
  options?: ProvisionTemplateOptions
): Promise<ProvisionTemplateResult> {
  let template = await templateRepository.get(templateId);
  if (!template) {
    throw new Error(`Template dengan id '${templateId}' tidak ditemukan`);
  }

  const conn = await getConnectionState();
  if (conn.error) {
    throw new Error(USER_COPY.connection.dbUnavailable);
  }
  if (!conn.ready) {
    throw new Error(USER_COPY.connection.buildIncompleteMessage(conn.missing));
  }

  const settings = await readDecryptedSettings();
  if (!settings || !settings.workspaceUrl || !settings.token) {
    throw new Error(USER_COPY.connection.buildIncompleteMessage(["alamat", "token"]));
  }

  const client = createDatabricksClient(settings.workspaceUrl, settings.token);

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

  const catalog = options?.catalog || settings.catalog || template.volume?.catalog || "main";
  const schemaName = options?.schema || template.volume?.schema || template.slug;
  const volumeName =
    options?.volumeName ||
    template.volume?.name ||
    resolveVolumeName(template.slug, settings.defaultVolumeName);

  let schemaCreatedByApp = false;
  let volumeCreatedByApp = false;
  const shouldAdopt = options?.adoptExisting === true || options?.reuseExistingVolume === true;
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
      } else if (shouldAdopt) {
        schemaCreatedByApp = false;
        volumeCreatedByApp = false;
        steps[1].status = "success";
        steps[1].message = "Menggunakan folder yang sudah ada.";
      } else {
        steps[1].status = "error";
        steps[1].message = "Folder induk sudah ada di Databricks.";
        await templateRepository.update(templateId, { status: "gagal" });
        return {
          success: false,
          template: (await templateRepository.get(templateId)) || template,
          steps,
          schemaExists: true,
          error: "Folder induk sudah ada. Anda dapat menggunakan folder yang sudah ada atau mengganti nama.",
        };
      }
    } else {
      const createSchemaRes = await client.createSchema(catalog, schemaName, templateId);
      if (!createSchemaRes.success && createSchemaRes.status !== 409) {
        steps[1].status = "error";
        if (createSchemaRes.status === 403) {
          steps[1].message =
            "Akun koneksi belum punya izin membuat folder penyimpanan baru. Hubungi admin.";
          steps[1].fix = `Izin yang dibutuhkan: USE CATALOG dan CREATE SCHEMA pada katalog '${catalog}'.`;
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
      if (!schemaCreatedByApp || shouldAdopt) {
        volumeCreatedByApp = false;
      } else {
        volumeCreatedByApp = true;
      }
      steps[2].status = "success";
    } else {
      const createVolRes = await client.createVolume(
        catalog,
        schemaName,
        volumeName,
        `Volume untuk template ${template.name}`
      );
      if (!createVolRes.success && createVolRes.status !== 409) {
        steps[2].status = "error";
        steps[2].message = createVolRes.error || "Gagal membuat folder penyimpanan";
        steps[2].fix =
          createVolRes.status === 403
            ? `Pastikan token memiliki izin CREATE VOLUME pada skema '${schemaName}'.`
            : undefined;
        await templateRepository.update(templateId, { status: "gagal" });
        return {
          success: false,
          template: (await templateRepository.get(templateId)) || template,
          steps,
          error: steps[2].message,
          errorDetail: steps[2].fix,
        };
      }
      volumeCreatedByApp = schemaCreatedByApp;
      steps[2].status = "success";
    }

    steps[3].status = "running";
    const csvFolder = template.csvFolder ?? "csv";
    if (csvFolder) {
      const csvPath = `/Volumes/${catalog}/${schemaName}/${volumeName}/${csvFolder}`;
      const csvRes = await client.createDirectory(csvPath);
      if (!csvRes.success && csvRes.status !== 409) {
        steps[3].status = "error";
        steps[3].message = csvRes.error || `Gagal membuat folder ${csvFolder}/`;
        await templateRepository.update(templateId, { status: "gagal" });
        return {
          success: false,
          template: (await templateRepository.get(templateId)) || template,
          steps,
          error: steps[3].message,
        };
      }
    }
    steps[3].status = "success";

    steps[4].status = "running";
    const parquetFolder = template.parquetFolder ?? "parquet";
    if (parquetFolder) {
      const parquetPath = `/Volumes/${catalog}/${schemaName}/${volumeName}/${parquetFolder}`;
      const parquetRes = await client.createDirectory(parquetPath);
      if (!parquetRes.success && parquetRes.status !== 409) {
        steps[4].status = "error";
        steps[4].message = parquetRes.error || `Gagal membuat folder ${parquetFolder}/`;
        await templateRepository.update(templateId, { status: "gagal" });
        return {
          success: false,
          template: (await templateRepository.get(templateId)) || template,
          steps,
          error: steps[4].message,
        };
      }
    }
    steps[4].status = "success";

    steps[5].status = "running";
    const workspaceHost = settings.workspaceUrl
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "")
      .toLowerCase();

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
      needsCheck: false,
      visibility: "terlihat",
      visibilityCheckedAt: new Date().toISOString(),
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
