"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Plus,
  UploadCloud,
  X,
} from "lucide-react";
import Button from "@/components/Button";
import Callout from "@/components/Callout";
import PageHeader from "@/components/PageHeader";
import { notify } from "@/lib/notify";
import type { MaskedSettings } from "@/lib/settings";
import type { TemplateDefinition } from "@/lib/templates";
import {
  buildDestinationFileName,
  buildVolumePath,
} from "@/lib/upload/filename";
import {
  validateFile,
  type ValidationInput,
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
  const [templates, setTemplates] = useState<TemplateDefinition[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [validationResult, setValidationResult] =
    useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [settings, setSettings] = useState<MaskedSettings | null>(null);
  const [isSettingsConfigured, setIsSettingsConfigured] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/templates")
      .then((res) => res.json())
      .then((data) => {
        const activeTemplates = (data.templates || []).filter(
          (t: TemplateDefinition) => t.status === "aktif"
        );
        setTemplates(activeTemplates);
        if (activeTemplates.length > 0) {
          setSelectedTemplateId(activeTemplates[0].id);
        }
      })
      .catch(() => {});

    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        setSettings(data.settings);
        setIsSettingsConfigured(Boolean(data.configured));
      })
      .catch(() => {
        setIsSettingsConfigured(false);
      });
  }, []);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  const processValidation = async (targetFile: File, template: TemplateDefinition) => {
    setIsValidating(true);
    setValidationResult(null);
    setUploadedPath(null);

    try {
      const buffer = await targetFile.arrayBuffer();
      const validationInput: ValidationInput = {
        name: targetFile.name,
        size: targetFile.size,
        bytes: new Uint8Array(buffer),
      };
      const result = await validateFile(validationInput, template);
      setValidationResult(result);
    } catch {
      setValidationResult({
        ok: false,
        summary: {
          rowCount: 0,
          columnCount: 0,
          totalErrors: 1,
          totalWarnings: 0,
          detectedDelimiter: "",
          issueCounts: { FILE_READ_ERROR: 1 },
        },
        errors: [
          {
            code: "FILE_READ_ERROR",
            level: "error",
            message: "Gagal membaca berkas.",
          },
        ],
        warnings: [],
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const newTemplate = templates.find((t) => t.id === templateId);
    if (file && newTemplate) {
      processValidation(file, newTemplate);
    }
  };

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
    if (selectedTemplate) {
      processValidation(selectedFile, selectedTemplate);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleDownloadTemplate = async (templateId: string) => {
    try {
      const res = await fetch(`/api/templates/${templateId}/file?contoh=1`);
      if (!res.ok) {
        throw new Error("Gagal mengunduh template");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selectedTemplate?.slug || "template"}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      notify.success("Template berhasil diunduh");
    } catch {
      notify.error("Gagal mengunduh template");
    }
  };

  const handleUpload = async () => {
    if (!file || !selectedTemplate || !validationResult?.ok) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("templateId", selectedTemplate.id);

    const uploadPromise = fetch("/api/upload", {
      method: "POST",
      body: formData,
    }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal mengunggah berkas");
      }
      return data;
    });

    notify.promise(uploadPromise, {
      loading: "Mengirim ke Databricks...",
      success: (data: { destinationPath: string; fileName: string }) => {
        setUploadedPath(data.destinationPath);
        return `File terkirim: ${data.fileName}`;
      },
      error: (err: unknown) => {
        const msg = err instanceof Error ? err.message : "Gagal mengirim ke Databricks";
        return msg;
      },
    });

    try {
      await uploadPromise;
    } catch {
    } finally {
      setIsUploading(false);
    }
  };

  const resetUploadState = () => {
    setFile(null);
    setValidationResult(null);
    setUploadedPath(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const destinationSubfolder = file?.name.toLowerCase().endsWith(".parquet")
    ? "parquet"
    : "csv";

  const destinationFileName =
    file && selectedTemplate
      ? buildDestinationFileName(selectedTemplate.slug, file.name)
      : null;

  const destinationPath =
    selectedTemplate && destinationFileName
      ? buildVolumePath(
          selectedTemplate.volume.catalog,
          selectedTemplate.volume.schema,
          selectedTemplate.volume.name,
          destinationSubfolder,
          destinationFileName
        )
      : null;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Unggah Data"
        description="Pilih template, periksa format berkas secara lokal, dan kirim ke Volume."
      />

      {!isSettingsConfigured && (
        <Callout
          type="warning"
          title="Pengaturan Databricks belum lengkap"
        >
          Konfigurasikan URL workspace, token, katalog, dan skema di halaman Pengaturan sebelum
          mengunggah berkas.
        </Callout>
      )}

      {/* 1. Template */}
      <section className="space-y-3">
        <label className="block text-sm font-semibold text-zinc-900">
          Template
        </label>
        {templates.length === 0 ? (
          <div className="bg-white border border-zinc-200 rounded-xl p-8 text-center space-y-3">
            <p className="text-sm text-zinc-500">
              Belum ada template yang aktif.
            </p>
            <div>
              <Link href="/template/baru">
                <Button variant="primary">
                  <Plus className="w-4 h-4 mr-1.5 inline" />
                  Buat template baru
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex-1">
              <select
                value={selectedTemplateId}
                onChange={(e) => handleTemplateChange(e.target.value)}
                className="w-full h-10 px-3 text-sm bg-white border border-zinc-200 rounded-lg text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              >
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name} ({tpl.columns.length} kolom)
                  </option>
                ))}
              </select>
            </div>
            {selectedTemplate && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => handleDownloadTemplate(selectedTemplate.id)}
              >
                <Download className="w-4 h-4 mr-1.5 inline" />
                Unduh template
              </Button>
            )}
          </div>
        )}
      </section>

      {/* 2. File dropzone */}
      <section className="space-y-3">
        <label className="block text-sm font-semibold text-zinc-900">
          File
        </label>

        {uploadedPath ? (
          <div className="border border-emerald-200 bg-emerald-50/40 rounded-xl p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <div className="text-base font-semibold text-emerald-950">
                File Berhasil Terkirim ke Databricks
              </div>
              <div className="text-xs font-mono text-emerald-800 mt-2 break-all bg-white/80 p-3 rounded-lg border border-emerald-200 inline-block text-left">
                {uploadedPath}
              </div>
            </div>
            <div className="pt-2">
              <Button variant="primary" onClick={resetUploadState}>
                Unggah file lain
              </Button>
            </div>
          </div>
        ) : !file ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
              isDragOver
                ? "border-indigo-500 bg-indigo-50/30"
                : "border-zinc-300 hover:border-zinc-400 bg-white"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.parquet"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileSelect(e.target.files[0]);
                }
              }}
            />
            <div className="flex flex-col items-center justify-center space-y-2">
              <UploadCloud
                className={`w-8 h-8 ${
                  isDragOver ? "text-indigo-600" : "text-zinc-400"
                }`}
              />
              <div className="text-sm font-medium text-zinc-700">
                Pilih atau seret berkas ke sini
              </div>
              <div className="text-xs text-zinc-400">
                Format yang diterima: .csv atau .parquet (maksimal{" "}
                {settings?.maxFileSizeMb ?? 100} MB)
              </div>
            </div>
          </div>
        ) : (
          <div className="border border-zinc-200 bg-white rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center space-x-3 truncate">
              <div className="w-9 h-9 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-600 shrink-0">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div className="truncate">
                <div className="text-sm font-medium text-zinc-900 truncate">
                  {file.name}
                </div>
                <div className="text-xs text-zinc-500">
                  {formatFileSize(file.size)}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={resetUploadState}
              className="text-zinc-400 hover:text-zinc-600 p-1 rounded-md hover:bg-zinc-100"
              title="Hapus berkas"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </section>

      {/* 3. Hasil Validasi & Pengiriman */}
      {file && !uploadedPath && (
        <section className="space-y-4">
          <label className="block text-sm font-semibold text-zinc-900">
            Hasil Validasi
          </label>

          {isValidating && (
            <div className="border border-zinc-200 bg-white rounded-xl p-6 text-center text-sm text-zinc-500">
              Memvalidasi berkas...
            </div>
          )}

          {!isValidating && validationResult && (
            <div className="space-y-4">
              {validationResult.ok ? (
                <div className="border border-emerald-200 bg-emerald-50/30 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-emerald-950">
                        Berkas valid dan siap dikirim
                      </div>
                      <div className="text-xs text-emerald-800">
                        Total {validationResult.summary.rowCount.toLocaleString("id-ID")} baris data,{" "}
                        {validationResult.summary.columnCount} kolom
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="border border-rose-200 bg-rose-50/30 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-rose-600 mt-0.5 shrink-0" />
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-rose-950">
                        Ditemukan {validationResult.summary.totalErrors} kesalahan pada berkas
                      </div>
                      <div className="text-xs text-rose-800">
                        Perbaiki kesalahan di bawah ini sebelum mengirim berkas.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Rangkuman Isu per Aturan / Code */}
              {Object.keys(validationResult.summary.issueCounts).length > 0 && (
                <div className="flex flex-wrap gap-2 text-xs">
                  {Object.entries(validationResult.summary.issueCounts).map(([code, count]) => (
                    <span
                      key={code}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-zinc-100 text-zinc-700 rounded-md border border-zinc-200"
                    >
                      <span className="font-mono font-medium">{code}</span>: {count}
                    </span>
                  ))}
                </div>
              )}

              {/* Tabel error 50 pertama */}
              {!validationResult.ok && validationResult.errors.length > 0 && (
                <div className="border border-zinc-200 bg-white rounded-xl overflow-hidden">
                  <div className="overflow-x-auto max-h-80">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-zinc-50 border-b border-zinc-200 sticky top-0">
                        <tr className="text-zinc-600">
                          <th className="py-2 px-3 font-semibold">Baris</th>
                          <th className="py-2 px-3 font-semibold">Kolom</th>
                          <th className="py-2 px-3 font-semibold">Nilai</th>
                          <th className="py-2 px-3 font-semibold">Masalah</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-200">
                        {validationResult.errors.slice(0, 50).map((err, idx) => (
                          <tr key={idx} className="hover:bg-zinc-50">
                            <td className="py-2 px-3 font-mono text-zinc-500">
                              {err.line ?? "-"}
                            </td>
                            <td className="py-2 px-3 font-mono text-zinc-700">
                              {err.column ?? "-"}
                            </td>
                            <td className="py-2 px-3 font-mono text-zinc-600 max-w-44 truncate">
                              {err.value ?? "-"}
                            </td>
                            <td className="py-2 px-3 text-rose-600">
                              {err.message}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {validationResult.summary.totalErrors > 50 && (
                    <div className="p-2.5 bg-zinc-50 border-t border-zinc-200 text-center text-xs text-zinc-500">
                      Menampilkan 50 dari {validationResult.summary.totalErrors} kesalahan.
                    </div>
                  )}
                </div>
              )}

              {/* Tombol aksi kirim */}
              <div className="pt-2">
                <Button
                  variant="primary"
                  disabled={
                    !validationResult.ok ||
                    !isSettingsConfigured ||
                    isUploading
                  }
                  isLoading={isUploading}
                  onClick={handleUpload}
                >
                  Kirim ke Databricks
                </Button>
                {destinationPath && validationResult.ok && (
                  <div className="mt-2 text-xs text-zinc-500 font-mono break-all">
                    Tujuan: {destinationPath}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
