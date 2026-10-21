"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  UploadCloud,
  X,
} from "lucide-react";
import Button from "@/components/Button";
import Callout from "@/components/Callout";
import PageHeader from "@/components/PageHeader";
import { notify } from "@/lib/notify";
import type { MaskedSettings } from "@/lib/settings";
import {
  getAllTemplates,
  getTemplateById,
  type TemplateConfig,
} from "@/lib/templates";
import {
  buildDestinationFileName,
  buildVolumePath,
  getDestinationSubfolder,
} from "@/lib/upload/filename";
import {
  validateFile,
  type ValidationIssue,
  type ValidationResult,
} from "@/lib/validation";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadPage() {
  const templates = getAllTemplates();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    templates[0].id,
  );
  const [file, setFile] = useState<File | null>(null);
  const [validationResult, setValidationResult] =
    useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<{
    path: string;
    size: number;
    fileName: string;
  } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [settings, setSettings] = useState<MaskedSettings | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active) {
          return;
        }
        if (data && data.configured) {
          setSettings(data);
        }
        setSettingsLoaded(true);
      })
      .catch(() => {
        if (active) {
          setSettingsLoaded(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const selectedTemplate = getTemplateById(selectedTemplateId) || templates[0];

  const runValidation = async (targetFile: File, template: TemplateConfig) => {
    setIsValidating(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const buffer = await targetFile.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const result = validateFile(
        {
          name: targetFile.name,
          size: targetFile.size,
          bytes,
        },
        template,
        {
          maxFileSizeMb: settings?.maxFileSizeMb ?? 100,
        },
      );
      setValidationResult(result);
    } catch {
      setUploadError("Gagal memproses validasi berkas");
    } finally {
      setIsValidating(false);
    }
  };

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    setUploadError(null);
    setUploadSuccess(null);
    const newTemplate = getTemplateById(templateId);
    if (file && newTemplate) {
      runValidation(file, newTemplate);
    }
  };

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
    setUploadSuccess(null);
    setUploadError(null);
    runValidation(selectedFile, selectedTemplate);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleRemoveFile = () => {
    setFile(null);
    setValidationResult(null);
    setUploadError(null);
    setUploadSuccess(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSendToDatabricks = async () => {
    if (!file || !validationResult || !validationResult.ok) {
      return;
    }

    setIsUploading(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("templateId", selectedTemplate.id);

    const uploadPromise = async () => {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data || !data.success) {
        const errorMsg =
          (data && data.error) || "Gagal meneruskan berkas ke Volume";
        throw new Error(errorMsg);
      }

      setUploadSuccess({
        path: data.path,
        size: data.size,
        fileName: data.fileName,
      });

      const subfolder = getDestinationSubfolder(
        file.name,
        settings?.subfolderCsv,
        settings?.subfolderParquet,
      );

      return {
        subfolder,
        fileName: data.fileName || file.name,
      };
    };

    const task = uploadPromise();

    notify.promise(task, {
      loading: "Mengirim ke Databricks",
      success: (res) => ({
        title: `Terkirim ke ${res.subfolder}/`,
        description: res.fileName,
      }),
      error: (err) => ({
        title: "Unggahan ditolak",
        description:
          err instanceof Error
            ? err.message
            : "Gagal mengirim berkas ke Volume",
      }),
    });

    try {
      await task;
    } catch {
    } finally {
      setIsUploading(false);
    }
  };

  const handleResetForm = () => {
    setFile(null);
    setValidationResult(null);
    setUploadSuccess(null);
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const isConfigured = Boolean(settings && settings.configured);

  const previewDestination =
    file && settings
      ? buildVolumePath(
          settings.catalog || "<catalog>",
          settings.schema || "<schema>",
          settings.volume || "<volume>",
          getDestinationSubfolder(
            file.name,
            settings.subfolderCsv,
            settings.subfolderParquet,
          ),
          buildDestinationFileName(selectedTemplate.id, file.name),
        )
      : null;

  return (
    <div>
      <PageHeader
        title="Unggah Berkas"
        description="Pilih template, validasi integritas data, dan kirim berkas ke Databricks Unity Catalog Volume."
      />

      {settingsLoaded && !isConfigured ? (
        <div className="mb-6 p-4 border border-amber-200 bg-amber-50 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 leading-relaxed">
              <span className="font-semibold">
                Koneksi Databricks belum diatur.
              </span>{" "}
              Lengkapi kredensial di halaman Pengaturan untuk mengirim berkas.
            </div>
          </div>
          <Link
            href="/pengaturan"
            className="shrink-0 inline-flex items-center justify-center h-8 px-3 text-xs font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
          >
            Pengaturan
          </Link>
        </div>
      ) : null}

      <div className="space-y-6">
        <section className="bg-white border border-zinc-200 rounded-xl p-5 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">
              1. Jenis Data
            </h2>
            <span className="text-xs text-zinc-500">
              Pilih salah satu template acuan
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {templates.map((tpl) => {
              const isSelected = tpl.id === selectedTemplateId;
              const hasColumns = tpl.columns.length > 0;

              return (
                <div
                  key={tpl.id}
                  onClick={() => handleTemplateChange(tpl.id)}
                  className={`p-4 rounded-lg border text-left cursor-pointer transition-all ${
                    isSelected
                      ? "border-indigo-600 ring-1 ring-indigo-600 bg-white"
                      : "border-zinc-200 bg-white hover:border-zinc-300"
                  }`}
                >
                  <p className="text-sm font-medium text-zinc-900">
                    {tpl.name}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500 leading-normal">
                    {hasColumns ? `CSV` : "CSV atau Parquet"}
                  </p>
                  {hasColumns ? (
                    <div className="mt-3 pt-2 border-t border-zinc-100 flex items-center">
                      <a
                        href={`/api/templates/${tpl.id}`}
                        download={`${tpl.id}.csv`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-800"
                      >
                        <Download className="w-3 h-3" />
                        Unduh template
                      </a>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        <section className="bg-white border border-zinc-200 rounded-xl p-5 sm:p-6 space-y-3">
          <h2 className="text-sm font-semibold text-zinc-900">2. Berkas</h2>

          <input
            ref={fileInputRef}
            type="file"
            accept={
              selectedTemplate.kind === "csv-or-parquet"
                ? ".csv,.parquet"
                : ".csv"
            }
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleFileSelect(e.target.files[0]);
              }
            }}
          />

          {!file ? (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 sm:p-10 text-center cursor-pointer transition-colors ${
                isDragOver
                  ? "border-indigo-600 bg-indigo-50/20"
                  : "border-zinc-200 hover:border-zinc-300 bg-zinc-50/50"
              }`}
            >
              <div className="w-10 h-10 mx-auto mb-3 flex items-center justify-center rounded-full bg-zinc-100 text-zinc-600">
                <UploadCloud className="w-5 h-5" />
              </div>
              <p className="text-sm font-medium text-zinc-900">
                Tarik berkas ke sini atau klik untuk memilih
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Format yang diterima:{" "}
                {selectedTemplate.kind === "csv-or-parquet"
                  ? ".csv atau .parquet"
                  : ".csv"}
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-between p-4 border border-zinc-200 bg-zinc-50/50 rounded-lg">
              <div className="flex items-center gap-3 min-w-0">
                <FileSpreadsheet className="w-5 h-5 text-indigo-600 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-900 truncate">
                    {file.name}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {formatFileSize(file.size)}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={handleRemoveFile}
                className="text-xs text-zinc-500 hover:text-zinc-900 h-8 px-2"
              >
                <X className="w-4 h-4 mr-1" />
                Hapus
              </Button>
            </div>
          )}
        </section>

        {isValidating ? (
          <section className="bg-white border border-zinc-200 rounded-xl p-8 text-center text-sm text-zinc-500">
            Sedang memvalidasi berkas...
          </section>
        ) : uploadSuccess ? (
          <section className="bg-white border border-zinc-200 rounded-xl p-6 sm:p-8 space-y-5">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
              <div>
                <h3 className="text-base font-semibold text-zinc-900">
                  Berkas terkirim ke Volume
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Ukuran: {formatFileSize(uploadSuccess.size)}
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-zinc-50 border border-zinc-200 rounded-lg space-y-1">
              <p className="text-xs font-medium text-zinc-600">
                Lokasi Volume Databricks:
              </p>
              <p className="font-mono text-xs text-zinc-800 break-all select-all">
                {uploadSuccess.path}
              </p>
            </div>

            <Callout type="info">
              Berkas tersimpan tanpa modifikasi untuk diproses pipeline
              Databricks.
            </Callout>

            <div className="pt-2">
              <Button type="button" variant="primary" onClick={handleResetForm}>
                Unggah berkas lain
              </Button>
            </div>
          </section>
        ) : validationResult && file ? (
          <section className="bg-white border border-zinc-200 rounded-xl p-5 sm:p-6 space-y-5">
            <h2 className="text-sm font-semibold text-zinc-900">
              3. Hasil Validasi
            </h2>

            {uploadError ? <Callout type="error">{uploadError}</Callout> : null}

            {validationResult.ok ? (
              <div className="space-y-4">
                <Callout type="success" title="Berkas valid">
                  <div className="space-y-1">
                    <p>
                      {validationResult.summary.rowCount} baris data •{" "}
                      {validationResult.summary.columnCount} kolom • Pemisah
                      &apos;
                      {validationResult.summary.detectedDelimiter}&apos;
                    </p>
                    {validationResult.warnings.length > 0 ? (
                      <p className="text-xs text-amber-800 pt-1">
                        Peringatan: {validationResult.warnings.length} catatan
                        ditemukan.
                      </p>
                    ) : null}
                  </div>
                </Callout>

                <div className="pt-2 space-y-2">
                  <Button
                    type="button"
                    variant="primary"
                    isLoading={isUploading}
                    disabled={!isConfigured}
                    onClick={handleSendToDatabricks}
                  >
                    Kirim ke Databricks
                  </Button>

                  {previewDestination ? (
                    <p className="text-xs font-mono text-zinc-500 break-all">
                      Destinasi target: {previewDestination}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <Callout
                  type="error"
                  title={`${validationResult.summary.totalErrors} kesalahan pada berkas`}
                >
                  <div className="flex flex-wrap gap-2 pt-1">
                    {Object.entries(validationResult.summary.issueCounts).map(
                      ([code, count]) => (
                        <span
                          key={code}
                          className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded text-[11px] font-mono"
                        >
                          {code}: {count}
                        </span>
                      ),
                    )}
                  </div>
                </Callout>

                <div className="border border-zinc-200 rounded-lg overflow-hidden">
                  <div className="max-h-80 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-700 sticky top-0 font-medium">
                        <tr>
                          <th className="px-3.5 py-2 w-16">Baris</th>
                          <th className="px-3.5 py-2 w-44">Kolom</th>
                          <th className="px-3.5 py-2 w-32">Nilai</th>
                          <th className="px-3.5 py-2">Masalah</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 bg-white">
                        {validationResult.errors
                          .slice(0, 50)
                          .map((err: ValidationIssue, idx: number) => (
                            <tr key={idx} className="hover:bg-zinc-50/50">
                              <td className="px-3.5 py-2 font-mono text-zinc-600">
                                {err.line ?? "-"}
                              </td>
                              <td className="px-3.5 py-2 font-mono text-zinc-900">
                                {err.column ?? "-"}
                              </td>
                              <td className="px-3.5 py-2 font-mono text-zinc-500 truncate max-w-[120px]">
                                {err.value ?? "-"}
                              </td>
                              <td className="px-3.5 py-2 text-rose-700">
                                {err.message}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>

                  {validationResult.errors.length > 50 ? (
                    <div className="p-2.5 bg-zinc-50 border-t border-zinc-200 text-center text-xs text-zinc-500">
                      Menampilkan 50 dari {validationResult.summary.totalErrors}{" "}
                      kesalahan.
                    </div>
                  ) : null}
                </div>

                <div className="pt-2">
                  <Button type="button" variant="primary" disabled>
                    Kirim ke Databricks
                  </Button>
                </div>
              </div>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
