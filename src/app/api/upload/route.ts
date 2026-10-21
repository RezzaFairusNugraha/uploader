import { NextResponse } from "next/server";
import { createDatabricksClient } from "@/lib/databricks";
import { readDecryptedSettings } from "@/lib/settings";
import { getTemplateById } from "@/lib/templates";
import {
  buildDestinationFileName,
  buildVolumePath,
  getDestinationSubfolder,
} from "@/lib/upload/filename";
import { validateFile } from "@/lib/validation";

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

    const settings = await readDecryptedSettings();
    if (!settings) {
      return NextResponse.json(
        { error: "Pengaturan Databricks belum dikonfigurasi" },
        { status: 400 }
      );
    }

    const template = getTemplateById(templateId);
    if (!template) {
      return NextResponse.json(
        { error: "Template tidak ditemukan" },
        { status: 404 }
      );
    }

    const fileName = file instanceof File ? file.name : "upload.csv";
    const lowerName = fileName.toLowerCase();
    const isParquet = lowerName.endsWith(".parquet");

    if (isParquet && template.kind !== "csv-or-parquet") {
      return NextResponse.json(
        {
          error:
            "Format Parquet hanya diizinkan untuk template Data Research",
        },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    const validationResult = validateFile(
      {
        name: fileName,
        size: bytes.length,
        bytes,
      },
      template,
      { maxFileSizeMb: settings.maxFileSizeMb }
    );

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

    const destFileName = buildDestinationFileName(template.id, fileName);
    const subfolder = getDestinationSubfolder(
      fileName,
      settings.subfolderCsv,
      settings.subfolderParquet
    );
    const fullPath = buildVolumePath(
      settings.catalog,
      settings.schema,
      settings.volume,
      subfolder,
      destFileName
    );

    const client = createDatabricksClient(
      settings.workspaceUrl,
      settings.token
    );
    const uploadResult = await client.uploadFile(fullPath, bytes);

    if (!uploadResult.success) {
      return NextResponse.json(
        { error: uploadResult.error || "Gagal meneruskan berkas ke Volume" },
        { status: uploadResult.status || 502 }
      );
    }

    return NextResponse.json({
      success: true,
      path: fullPath,
      size: bytes.length,
      fileName: destFileName,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Terjadi kesalahan server";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
