import { NextResponse } from "next/server";
import { createDatabricksClient } from "@/lib/databricks";
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
import { getDatabricksConfig, getLimitsConfig } from "@/platform/config";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const templateId = formData.get("templateId");
    const uploaderName = (formData.get("uploaderName") as string) || null;

    if (!templateId || typeof templateId !== "string") {
      return NextResponse.json(
        { error: "Template wajib dipilih" },
        { status: 400 }
      );
    }

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: "Berkas wajib diunggah" },
        { status: 400 }
      );
    }

    const dbConfig = getDatabricksConfig();
    if (!dbConfig) {
      return NextResponse.json(
        { error: USER_COPY.connection.notConnected },
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

    const currentHost = dbConfig.workspaceHost;
    const fileName = file instanceof File ? file.name : "upload.csv";
    const lowerName = fileName.toLowerCase();
    const isParquet = lowerName.endsWith(".parquet");

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
              uploaderName,
              errorMessage: USER_COPY.connection.hostMismatch,
            })
            .catch(() => {});
        }
        return NextResponse.json(
          { error: USER_COPY.connection.hostMismatch },
          { status: 400 }
        );
      }
    }

    const limits = getLimitsConfig();
    const maxBytes = limits.maxUploadMb * 1024 * 1024;
    if (file.size > maxBytes) {
      const limitMb = limits.maxUploadMb;
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

    const subfolder = isParquet ? "parquet" : "csv";
    const templateSlug =
      ("slug" in template && template.slug) || template.id || "default_slug";
    const destinationFileName = buildDestinationFileName(
      templateSlug,
      fileName
    );
    const catalog = template.volume?.catalog || dbConfig.catalog;
    const schema = template.volume?.schema || templateSlug;
    const volumeName = template.volume?.name || templateSlug;

    const destinationPath = buildVolumePath(
      catalog,
      schema,
      volumeName,
      subfolder,
      destinationFileName
    );

    const client = createDatabricksClient(dbConfig.host, dbConfig.token);
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
            uploaderName,
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
          uploaderName,
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
