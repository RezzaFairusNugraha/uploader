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
  validateLight,
  type ValidationTemplateTarget,
} from "@/lib/validation";
import { getDatabricksConfig, getLimitsConfig } from "@/platform/config";

export const dynamic = "force-dynamic";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ templateId: string }> }
) {
  try {
    const { templateId } = await params;
    const { searchParams } = new URL(request.url);
    const fileName = searchParams.get("name") || "upload.csv";
    const uploaderName =
      (
        searchParams.get("uploaderName") ||
        request.headers.get("x-uploader-name") ||
        ""
      ).trim() || null;

    if (!templateId) {
      return NextResponse.json(
        { error: "Template wajib disertakan" },
        { status: 400 }
      );
    }

    if (!request.body) {
      return NextResponse.json(
        { error: "Berkas wajib disertakan" },
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
    const lowerName = fileName.toLowerCase();
    const isParquet = lowerName.endsWith(".parquet");

    if ("workspaceHost" in template && template.workspaceHost) {
      const templateHost = template.workspaceHost
        .replace(/^https?:\/\//, "")
        .replace(/\/.*$/, "")
        .toLowerCase();
      if (templateHost !== currentHost) {
        return NextResponse.json(
          { error: USER_COPY.connection.hostMismatch },
          { status: 400 }
        );
      }
    }

    const limits = getLimitsConfig();
    const maxBytes = limits.maxUploadMb * 1024 * 1024;
    const contentLengthHeader = request.headers.get("content-length");
    if (contentLengthHeader && Number(contentLengthHeader) > maxBytes) {
      return NextResponse.json(
        {
          error: `Ukuran berkas melebihi batas maksimum (${limits.maxUploadMb} MB)`,
          errors: [
            {
              code: "FILE_TOO_LARGE",
              level: "error",
              message: `Ukuran berkas melebihi batas yang diizinkan (${limits.maxUploadMb} MB)`,
            },
          ],
        },
        { status: 422 }
      );
    }

    const reader = request.body.getReader();
    const firstChunks: Uint8Array[] = [];
    let bytesRead = 0;
    const CHUNK_LIMIT = 256 * 1024;
    let streamDone = false;

    while (bytesRead < CHUNK_LIMIT) {
      const { done, value } = await reader.read();
      if (done) {
        streamDone = true;
        break;
      }
      if (value) {
        firstChunks.push(value);
        bytesRead += value.length;
      }
    }

    const firstChunkBytes = new Uint8Array(bytesRead);
    let offset = 0;
    for (const c of firstChunks) {
      firstChunkBytes.set(c, offset);
      offset += c.length;
    }

    const contentLength = contentLengthHeader
      ? parseInt(contentLengthHeader, 10)
      : streamDone
      ? bytesRead
      : undefined;

    const valResult = validateLight(
      firstChunkBytes,
      fileName,
      template,
      contentLength,
      limits.maxUploadMb
    );

    if (!valResult.ok) {
      return NextResponse.json(
        {
          error: "Validasi berkas gagal",
          errors: [{ message: valResult.error || "Validasi gagal" }],
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
    const volumeName = template.volume?.name || dbConfig.volumeName || templateSlug;

    const destinationPath = buildVolumePath(
      catalog,
      schema,
      volumeName,
      subfolder,
      destinationFileName
    );

    let chunkIndex = 0;
    const forwardStream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (chunkIndex < firstChunks.length) {
          controller.enqueue(firstChunks[chunkIndex++]);
          return;
        }
        if (streamDone) {
          controller.close();
          return;
        }
        const { done, value } = await reader.read();
        if (done) {
          streamDone = true;
          controller.close();
        } else if (value) {
          controller.enqueue(value);
        }
      },
      cancel(reason) {
        reader.cancel(reason).catch(() => {});
      },
    });

    const client = createDatabricksClient(dbConfig.host, dbConfig.token);
    const putRes = await client.uploadFile(destinationPath, forwardStream);

    if (!putRes.success) {
      if (template.id) {
        await uploadLogRepository
          .insert({
            templateId: template.id,
            originalName: fileName,
            storedName: destinationFileName,
            sizeBytes: contentLength || bytesRead,
            format: isParquet ? "parquet" : "csv",
            destinationPath,
            status: "gagal",
            rowCount: valResult.rowCount || 0,
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
          sizeBytes: contentLength || bytesRead,
          format: isParquet ? "parquet" : "csv",
          destinationPath,
          status: "berhasil",
          rowCount: valResult.rowCount || 0,
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
        size: contentLength || bytesRead,
        summary: {
          rowCount: valResult.rowCount || 0,
          columnCount: valResult.columnCount || template.columns.length,
        },
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Terjadi kesalahan saat mengunggah";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
