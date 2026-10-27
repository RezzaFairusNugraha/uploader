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
  validateLight,
  type ValidationTemplateTarget,
} from "@/lib/validation";

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

    const lowerName = fileName.toLowerCase();
    const isParquet = lowerName.endsWith(".parquet");

    if ("needsCheck" in template && template.needsCheck) {
      if (template.id) {
        await uploadLogRepository
          .insert({
            templateId: template.id,
            originalName: fileName,
            storedName: fileName,
            sizeBytes: 0,
            format: isParquet ? "parquet" : "csv",
            destinationPath: "",
            status: "gagal",
            rowCount: 0,
            uploaderName,
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
              sizeBytes: 0,
              format: isParquet ? "parquet" : "csv",
              destinationPath: "",
              status: "gagal",
              rowCount: 0,
              uploaderName,
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

    const contentLengthHeader = request.headers.get("content-length");
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
      settings.maxFileSizeMb
    );

    if (!valResult.ok) {
      reader.cancel().catch(() => {});
      if (template.id) {
        await uploadLogRepository
          .insert({
            templateId: template.id,
            originalName: fileName,
            storedName: fileName,
            sizeBytes: contentLength || bytesRead,
            format: isParquet ? "parquet" : "csv",
            destinationPath: "",
            status: "gagal",
            rowCount: valResult.rowCount || 0,
            uploaderName,
            errorMessage: valResult.error || "Validasi berkas gagal",
          })
          .catch(() => {});
      }
      return NextResponse.json(
        { error: valResult.error || "Validasi berkas gagal" },
        { status: 422 }
      );
    }

    const subfolder = isParquet
      ? "parquetFolder" in template && template.parquetFolder !== undefined
        ? template.parquetFolder
        : "parquet"
      : "csvFolder" in template && template.csvFolder !== undefined
      ? template.csvFolder
      : "csv";
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

    const client = createDatabricksClient(
      settings.workspaceUrl,
      settings.token
    );

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
