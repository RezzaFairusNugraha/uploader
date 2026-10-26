import { createDatabricksClient } from "@/lib/databricks";
import { getConnectionState, readDecryptedSettings } from "@/lib/settings";
import { USER_COPY } from "@/lib/copy";
import { templateRepository } from "./repository";
import type { ProvisionStepStatus, TemplateDefinition } from "./schema";

export interface ProvisionTemplateResult {
  success: boolean;
  template: TemplateDefinition;
  steps: ProvisionStepStatus[];
  error?: string;
  volumeExists?: boolean;
}

export async function provisionTemplate(
  templateId: string,
  options?: { reuseExistingVolume?: boolean }
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
      name: "Simpan definisi template",
      status: "success",
    },
    {
      step: "create_volume",
      name: "Buat volume di Unity Catalog",
      status: "pending",
    },
    {
      step: "create_csv",
      name: "Buat folder csv/",
      status: "pending",
    },
    {
      step: "create_parquet",
      name: "Buat folder parquet/",
      status: "pending",
    },
    {
      step: "activate",
      name: "Aktifkan template",
      status: "pending",
    },
  ];

  const catalog = template.volume.catalog;
  const schema = template.volume.schema;
  const volumeName = template.volume.name;
  let volumeCreatedByApp = false;

  try {
    steps[1].status = "running";
    const volumeCheck = await client.getVolume(catalog, schema, volumeName);

    if (volumeCheck.success) {
      if (!options?.reuseExistingVolume) {
        steps[1].status = "error";
        steps[1].message = `Volume '${volumeName}' sudah ada di Unity Catalog.`;
        await templateRepository.update(templateId, { status: "gagal" });
        return {
          success: false,
          template: (await templateRepository.get(templateId)) || template,
          steps,
          volumeExists: true,
          error: `Volume '${volumeName}' sudah ada. Anda dapat menggunakan volume yang sudah ada atau mengganti slug template.`,
        };
      }
      volumeCreatedByApp = false;
      steps[1].status = "success";
      steps[1].message = "Menggunakan volume yang sudah ada.";
    } else {
      const createRes = await client.createVolume(
        catalog,
        schema,
        volumeName,
        `Volume untuk template ${template.name}`
      );

      if (!createRes.success && createRes.status !== 409) {
        steps[1].status = "error";
        steps[1].message = createRes.error || "Gagal membuat volume";
        steps[1].fix =
          createRes.status === 403
            ? "Pastikan token Anda memiliki izin CREATE VOLUME, USE CATALOG, dan USE SCHEMA pada skema ini."
            : undefined;

        await templateRepository.update(templateId, { status: "gagal" });
        return {
          success: false,
          template: (await templateRepository.get(templateId)) || template,
          steps,
          error: steps[1].message,
        };
      }
      volumeCreatedByApp = true;
      steps[1].status = "success";
    }

    steps[2].status = "running";
    const csvFolder = template.csvFolder ?? "csv";
    if (csvFolder) {
      const csvPath = `/Volumes/${catalog}/${schema}/${volumeName}/${csvFolder}`;
      const csvRes = await client.createDirectory(csvPath);
      if (!csvRes.success && csvRes.status !== 409) {
        steps[2].status = "error";
        steps[2].message = csvRes.error || `Gagal membuat folder ${csvFolder}/`;
        await templateRepository.update(templateId, { status: "gagal" });
        return {
          success: false,
          template: (await templateRepository.get(templateId)) || template,
          steps,
          error: steps[2].message,
        };
      }
    }
    steps[2].status = "success";

    steps[3].status = "running";
    const parquetFolder = template.parquetFolder ?? "parquet";
    if (parquetFolder) {
      const parquetPath = `/Volumes/${catalog}/${schema}/${volumeName}/${parquetFolder}`;
      const parquetRes = await client.createDirectory(parquetPath);
      if (!parquetRes.success && parquetRes.status !== 409) {
        steps[3].status = "error";
        steps[3].message = parquetRes.error || `Gagal membuat folder ${parquetFolder}/`;
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
    const workspaceHost = settings.workspaceUrl
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "")
      .toLowerCase();

    template = await templateRepository.update(templateId, {
      status: "aktif",
      volumeCreatedByApp,
      workspaceHost,
      needsCheck: false,
    });
    steps[4].status = "success";

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
