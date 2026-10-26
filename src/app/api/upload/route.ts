import { NextResponse } from "next/server";
import { createDatabricksClient } from "@/lib/databricks";
import { getConnectionState, readDecryptedSettings } from "@/lib/settings";
import { USER_COPY } from "@/lib/copy";
import {
  templateRepository,
  type TemplateDefinition,
} from "@/lib/templates";
import {
  buildDestinationFileName,
  buildVolumePath,
} from "@/lib/upload/filename";
import { uploadLogRepository } from "@/lib/upload/log";
import {
  validateFile,
  type ValidationInput,
  type ValidationTemplateTarget,
} from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const templateId = formData.get("templateId");

    if (!file || !(file instanceof Blob) || typeof templateId !== "string") {
      return NextResponse.json(
        { error: "Berkas dan template wajib disertakan" },
        { status: 400 }
      );
    }

    const conn = await getConnectionState();
    if (conn.error) {
      return NextResponse.json(
        { error: USER_COPY.connection.dbUnavailable },
        { status: 503 }
      );
    }
    if (!conn.ready) {
      return NextResponse.json(
        { error: USER_COPY.connection.buildIncompleteMessage(conn.missing) },
        { status: 400 }
      );
    }

    const settings = await readDecryptedSettings();
    if (!settings) {
      return NextResponse.json(
        { error: USER_COPY.connection.buildIncompleteMessage(["alamat", "token"]) },
        { status: 400 }
      );
    }

    let template: TemplateDefinition | ValidationTemplateTarget | null = null;
    const dynamicTemplate = await templateRepository.get(templateId);
    if (dynamicTemplate) {
      template = dynamicTemplate;
    }

    if (!template) {
      const bySlug = await templateRepository.getBySlug(templateId);
      if (bySlug) {
        template = bySlug;
      }
    }

    if (!template) {
      const {
        targetBrandDistributionTemplate,
        hariBesarTemplate,
        dataResearchTemplate,
      } = await import("@/lib/templates");
      const fixtures = [
        targetBrandDistributionTemplate,
        hariBesarTemplate,
        dataResearchTemplate,
      ];
      const matched = fixtures.find((f) => f.id === templateId);
      if (matched) {
        template = {
          id: matched.id,
          name: matched.name,
          delimiter: matched.delimiter,
          columns: matched.columns.map((c) => ({
            name: c.name,
            required: c.required,
            rule: c.rule as unknown as import("@/lib/templates/schema").ColumnRule,
          })),
        };
      }
    }

    if (!template) {
      return NextResponse.json(
        { error: "Template tidak ditemukan" },
        { status: 404 }
      );
    }

    if ("status" in template && template.status !== "aktif") {
      return NextResponse.json(
        { error: "Template belum aktif atau telah diarsipkan" },
        { status: 400 }
      );
    }

    const currentHost = settings.workspaceUrl
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "")
      .toLowerCase();

    const fileName = file instanceof File ? file.name : "upload.csv";
    const lowerName = fileName.toLowerCase();
    const isParquet = lowerName.endsWith(".parquet");

    if ("needsCheck" in template && template.needsCheck) {
      if (template.id) {
        await uploadLogRepository
          .insert({
            templateId: template.id,
            originalName: fileName,
            storedName: fileName,
            sizeBytes: file.size,
            format: isParquet ? "parquet" : "csv",
            destinationPath: "",
            status: "gagal",
            rowCount: 0,
            errorMessage: "Koneksi diganti. Template ini perlu diperiksa dulu.",
          })
          .catch(() => {});
      }
      return NextResponse.json(
        { error: "Koneksi diganti. Template ini perlu diperiksa dulu." },
        { status: 400 }
      );
    }

    if ("workspaceHost" in template && template.workspaceHost) {
      const templateHost = template.workspaceHost
        .replace(/^https?:\/\//, "")
        .replace(/\/.*$/, "")
        .toLowerCase();
      if (templateHost !== currentHost) {
        if (template.id) {
          await uploadLogRepository
            .insert({
              templateId: template.id,
              originalName: fileName,
              storedName: fileName,
              sizeBytes: file.size,
              format: isParquet ? "parquet" : "csv",
              destinationPath: "",
              status: "gagal",
              rowCount: 0,
              errorMessage: "Template ini dibuat untuk koneksi yang berbeda dari koneksi saat ini. Hubungi admin.",
            })
            .catch(() => {});
        }
        return NextResponse.json(
          { error: "Template ini dibuat untuk koneksi yang berbeda dari koneksi saat ini. Hubungi admin." },
          { status: 400 }
        );
      }
    }

    const maxBytes = settings.maxFileSizeMb * 1024 * 1024;
    if (file.size > maxBytes) {
      const limitMb = settings.maxFileSizeMb;
      return NextResponse.json(
        {
          error: `Ukuran berkas melebihi batas maksimum (${limitMb} MB)`,
          errors: [
            {
              code: "FILE_TOO_LARGE",
              level: "error",
              message: `Ukuran berkas (${(file.size / (1024 * 1024)).toFixed(
                2
              )} MB) melebihi batas yang diizinkan (${limitMb} MB)`,
            },
          ],
        },
        { status: 422 }
      );
    }

    const fileBytes = new Uint8Array(await file.arrayBuffer());
    const validationInput: ValidationInput = {
      name: fileName,
      size: fileBytes.length,
      bytes: fileBytes,
    };
    const validationResult = await validateFile(validationInput, template);

    if (!validationResult.ok) {
      return NextResponse.json(
        {
          error: "Validasi berkas gagal",
          errors: validationResult.errors,
          warnings: validationResult.warnings,
          summary: validationResult.summary,
        },
        { status: 422 }
      );
    }

    const subfolder = isParquet
      ? ("parquetFolder" in template && template.parquetFolder !== undefined
          ? template.parquetFolder
          : "parquet")
      : ("csvFolder" in template && template.csvFolder !== undefined
          ? template.csvFolder
          : "csv");
    const templateSlug =
      ("slug" in template && template.slug) || template.id || "default_slug";
    const destinationFileName = buildDestinationFileName(
      templateSlug,
      fileName
    );
    const catalog = template.volume?.catalog || settings.catalog;
    const schema = template.volume?.schema || settings.schema;
    const volumeName = template.volume?.name || templateSlug;

    const destinationPath = buildVolumePath(
      catalog,
      schema,
      volumeName,
      subfolder,
      destinationFileName
    );

    const client = createDatabricksClient(
      settings.workspaceUrl,
      settings.token
    );

    const putRes = await client.uploadFile(destinationPath, fileBytes);
    if (!putRes.success) {
      if (template.id) {
        await uploadLogRepository
          .insert({
            templateId: template.id,
            originalName: fileName,
            storedName: destinationFileName,
            sizeBytes: fileBytes.length,
            format: isParquet ? "parquet" : "csv",
            destinationPath,
            status: "gagal",
            rowCount: validationResult.summary.rowCount,
            errorMessage: putRes.error || "Gagal mengunggah berkas ke Databricks",
          })
          .catch(() => {});
      }
      return NextResponse.json(
        { error: putRes.error || "Gagal mengunggah berkas ke Databricks" },
        { status: putRes.status || 500 }
      );
    }

    if (template.id) {
      if ("workspaceHost" in template && !template.workspaceHost) {
        await templateRepository
          .update(template.id, { workspaceHost: currentHost })
          .catch(() => {});
      }

      await uploadLogRepository
        .insert({
          templateId: template.id,
          originalName: fileName,
          storedName: destinationFileName,
          sizeBytes: fileBytes.length,
          format: isParquet ? "parquet" : "csv",
          destinationPath,
          status: "berhasil",
          rowCount: validationResult.summary.rowCount,
        })
        .catch(() => {});
    }

    return NextResponse.json(
      {
        success: true,
        path: destinationPath,
        destinationPath,
        fileName: destinationFileName,
        subfolder,
        size: fileBytes.length,
        summary: validationResult.summary,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Terjadi kesalahan saat mengunggah";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
