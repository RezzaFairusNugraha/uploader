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
import { resolveSelectedTemplateId, USER_COPY } from "@/lib/copy";
import { notify } from "@/lib/notify";
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
  const [uploaderName, setUploaderName] = useState<string>("");
  const [validationResult, setValidationResult] =
    useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [serverValidation, setServerValidation] = useState<"full" | "light">("full");
  const [isSettingsConfigured, setIsSettingsConfigured] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);
  const [uploadFailure, setUploadFailure] = useState<{ reason: string; timestamp: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const step2Ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const savedName = localStorage.getItem("uploader_user_name");
    if (savedName) {
      setUploaderName(savedName);
    }

    const searchParams = new URLSearchParams(window.location.search);
    const queryTplId = searchParams.get("template");

    fetch("/api/templates")
      .then((res) => res.json())
      .then((data) => {
        const rawTemplates: TemplateDefinition[] = data.templates || [];
        const activeTemplates = rawTemplates.filter(
          (t: TemplateDefinition) => t.status === "aktif"
        );
        setTemplates(activeTemplates);

        const chosenId = resolveSelectedTemplateId(rawTemplates, queryTplId);
        if (chosenId) {
          setSelectedTemplateId(chosenId);
          if (queryTplId && chosenId === queryTplId) {
            setTimeout(() => {
              step2Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            }, 100);
          }
        }
      })
      .catch(() => {});

    fetch("/api/status")
      .then((res) => res.json())
      .then((data) => {
        if (data) {
          setIsSettingsConfigured(Boolean(data.databricks && data.database));
        } else {
          setIsSettingsConfigured(false);
        }
      })
      .catch(() => {
        setIsSettingsConfigured(false);
      });
  }, []);

  const handleUploaderNameChange = (name: string) => {
    setUploaderName(name);
    localStorage.setItem("uploader_user_name", name);
  };

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
        throw new Error("Gagal mengunduh format template");
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
      notify.success("Format template berhasil diunduh");
    } catch {
      notify.error("Gagal mengunduh format template");
    }
  };

  const downloadIssuesCsv = () => {
    if (!validationResult || validationResult.errors.length === 0) return;
    const header = "Baris;Kolom;Nilai;Masalah\n";
    const rows = validationResult.errors.map((e) => {
      const line = e.line ?? "";
      const col = e.column ?? "";
      const val = (e.value ?? "").replace(/;/g, ",");
      const msg = e.message.replace(/;/g, ",");
      return `${line};${col};${val};${msg}`;
    });
    const csvContent = header + rows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `daftar_masalah_${file?.name || "berkas"}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleUpload = async () => {
    if (!file || !selectedTemplate || !validationResult?.ok) return;

    setIsUploading(true);
    let uploadPromise: Promise<{ destinationPath: string; fileName: string }>;

    if (serverValidation === "light") {
      const uploaderParam = uploaderName.trim()
        ? `&uploaderName=${encodeURIComponent(uploaderName.trim())}`
        : "";
      const url = `/api/upload/${encodeURIComponent(
        selectedTemplate.id
      )}?name=${encodeURIComponent(file.name)}${uploaderParam}`;

      uploadPromise = fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": String(file.size),
        },
        body: file,
      }).then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Gagal mengirim berkas");
        }
        return data;
      });
    } else {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("templateId", selectedTemplate.id);
      if (uploaderName.trim()) {
        formData.append("uploaderName", uploaderName.trim());
      }

      uploadPromise = fetch("/api/upload", {
        method: "POST",
        body: formData,
      }).then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Gagal mengirim berkas");
        }
        return data;
      });
    }

    notify.promise(uploadPromise, {
      loading: USER_COPY.upload.sending,
      success: (data: { destinationPath: string; fileName: string }) => {
        setUploadedPath(data.destinationPath);
        setUploadFailure(null);
        return `${USER_COPY.upload.sentSuccess}: ${data.fileName}`;
      },
      error: (err: unknown) => {
        const msg = err instanceof Error ? err.message : "Gagal mengirim ke penyimpanan";
        setUploadFailure({
          reason: msg,
          timestamp: new Date().toLocaleString("id-ID"),
        });
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
    setUploadFailure(null);
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
    <div className="space-y-8 text-base">
      <PageHeader
        title="Unggah Berkas"
        description="Pilih template, periksa isi berkas Anda secara aman di peramban, dan kirim ke penyimpanan."
      />

      {!isSettingsConfigured && (
        <Callout
          type="error"
          title="Koneksi penyimpanan belum siap"
        >
          {USER_COPY.connection.notConnected}
        </Callout>
      )}

      {/* Langkah 1: Template */}
      <section className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900">
            {USER_COPY.upload.step1Title}
          </h2>
          <p className="text-base text-zinc-500 mt-1">
            {USER_COPY.upload.step1Desc}
          </p>
        </div>

        {templates.length === 0 ? (
          <div className="border border-dashed border-zinc-200 rounded-xl p-6 text-center space-y-3">
            <p className="text-base text-zinc-500">
              {USER_COPY.upload.noTemplates}
            </p>
            <div>
              <Link href="/template/baru">
                <Button variant="primary">
                  <Plus className="w-4 h-4 mr-1.5 inline" />
                  {USER_COPY.upload.createNewTemplate}
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
                className="w-full h-11 px-3 text-base bg-white border border-zinc-200 rounded-lg text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
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
                {USER_COPY.upload.downloadTemplate}
              </Button>
            )}
          </div>
        )}
      </section>

      {/* Langkah 2: Berkas */}
      <section ref={step2Ref} className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900">
            {USER_COPY.upload.step2Title}
          </h2>
          <p className="text-base text-zinc-500 mt-1">
            {USER_COPY.upload.step2Desc}
          </p>
        </div>

        {uploadedPath ? (
          <div className="border border-emerald-200 bg-emerald-50/40 rounded-xl p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <div className="text-lg font-semibold text-emerald-950">
                Berkas Berhasil Terkirim
              </div>
              <div className="text-sm font-mono text-emerald-800 mt-2 break-all bg-white/80 p-3 rounded-lg border border-emerald-200 inline-block text-left">
                {uploadedPath}
              </div>
            </div>
            <div className="pt-2">
              <Button variant="primary" onClick={resetUploadState}>
                {USER_COPY.upload.uploadAnother}
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
              <div className="text-base font-medium text-zinc-700">
                Pilih atau tarik berkas ke kotak ini
              </div>
              <div className="text-sm text-zinc-500">
                Format yang didukung: .csv atau .parquet (maksimal 100 MB)
              </div>
            </div>
          </div>
        ) : (
          <div className="border border-zinc-200 bg-zinc-50/50 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center space-x-3 truncate">
              <div className="w-10 h-10 rounded-lg bg-white border border-zinc-200 flex items-center justify-center text-zinc-600 shrink-0">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div className="truncate">
                <div className="text-base font-medium text-zinc-900 truncate">
                  {file.name}
                </div>
                <div className="text-sm text-zinc-500">
                  {formatFileSize(file.size)}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={resetUploadState}
              className="min-h-[44px] min-w-[44px] text-zinc-400 hover:text-zinc-600 p-2.5 rounded-lg hover:bg-zinc-200/60 flex items-center justify-center"
              title="Hapus berkas"
              aria-label="Hapus berkas"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
      </section>

      {/* Langkah 3: Pengiriman & Validasi */}
      {file && !uploadedPath && (
        <section className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-zinc-900">
              {USER_COPY.upload.step3Title}
            </h2>
            <p className="text-base text-zinc-500 mt-1">
              {USER_COPY.upload.step3Desc}
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-base font-medium text-zinc-700">
              {USER_COPY.upload.uploaderNameLabel}
            </label>
            <input
              type="text"
              value={uploaderName}
              onChange={(e) => handleUploaderNameChange(e.target.value)}
              placeholder={USER_COPY.upload.uploaderNamePlaceholder}
              className="w-full sm:w-80 min-h-[44px] h-11 px-3 text-base bg-white border border-zinc-200 rounded-lg text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>

          {isValidating && (
            <div className="border border-zinc-200 bg-white rounded-xl p-6 text-center text-base text-zinc-500">
              Sedang memeriksa berkas Anda di peramban...
            </div>
          )}

          {!isValidating && validationResult && (
            <div className="space-y-4">
              {validationResult.ok ? (
                <div className="border border-emerald-200 bg-emerald-50/40 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                    <div className="space-y-1">
                      <div className="text-base font-semibold text-emerald-950">
                        Pemeriksaan berhasil: berkas siap dikirim
                      </div>
                      <div className="text-base text-emerald-800">
                        Total {validationResult.summary.rowCount.toLocaleString("id-ID")} baris data dan{" "}
                        {validationResult.summary.columnCount} kolom telah diverifikasi.
                        {serverValidation === "light" && (
                          <span className="block mt-1 font-medium">
                            {USER_COPY.upload.fullValidationInBrowser}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="border border-rose-200 bg-rose-50/40 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-rose-600 mt-0.5 shrink-0" />
                    <div className="space-y-1">
                      <div className="text-base font-semibold text-rose-950">
                        Ditemukan {validationResult.summary.totalErrors} kendala pada berkas
                      </div>
                      <div className="text-base text-rose-800">
                        Silakan periksa dan perbaiki kendala di bawah ini sebelum mengirim ke penyimpanan.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Rangkuman Masalah per Kategori */}
              {Object.keys(validationResult.summary.issueCounts).length > 0 && (
                <div className="flex flex-wrap gap-2 text-sm">
                  {Object.entries(validationResult.summary.issueCounts).map(([code, count]) => (
                    <span
                      key={code}
                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-zinc-100 text-zinc-700 rounded-md border border-zinc-200"
                    >
                      <span className="font-medium">{code}</span>: {count}
                    </span>
                  ))}
                </div>
              )}

              {/* Tabel kendala */}
              {!validationResult.ok && validationResult.errors.length > 0 && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="text-sm text-zinc-600 font-medium">
                      Menampilkan {Math.min(50, validationResult.errors.length)} dari {validationResult.summary.totalErrors} kendala
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={downloadIssuesCsv}
                    >
                      <Download className="w-4 h-4 mr-1.5 inline" />
                      {USER_COPY.upload.downloadIssuesCsv}
                    </Button>
                  </div>

                  <div className="border border-zinc-200 bg-white rounded-xl overflow-hidden">
                    <div className="overflow-x-auto max-h-80">
                      <table className="w-full text-left border-collapse text-sm">
                        <thead className="bg-zinc-50 border-b border-zinc-200 sticky top-0">
                          <tr className="text-zinc-600">
                            <th className="py-2.5 px-3 font-semibold">Baris</th>
                            <th className="py-2.5 px-3 font-semibold">Kolom</th>
                            <th className="py-2.5 px-3 font-semibold">Nilai</th>
                            <th className="py-2.5 px-3 font-semibold">Masalah</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200">
                          {validationResult.errors.slice(0, 50).map((err, idx) => (
                            <tr key={idx} className="hover:bg-zinc-50">
                              <td className="py-2.5 px-3 font-mono text-zinc-500">
                                {err.line ?? "-"}
                              </td>
                              <td className="py-2.5 px-3 font-medium text-zinc-700">
                                {err.column ?? "-"}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-zinc-600 max-w-44 truncate">
                                {err.value ?? "-"}
                              </td>
                              <td className="py-2.5 px-3 text-rose-600">
                                {err.message}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {uploadFailure && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-3 text-rose-900">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-medium">Pengunggahan gagal</p>
                      <p className="text-sm text-rose-700">{uploadFailure.reason}</p>
                    </div>
                  </div>
                  <div>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        const text = `Template: ${selectedTemplate?.name || "-"}\nWaktu: ${uploadFailure.timestamp}\nKendala: ${uploadFailure.reason}`;
                        navigator.clipboard.writeText(text);
                        notify.success("Pesan untuk admin berhasil disalin");
                      }}
                    >
                      Salin pesan untuk admin
                    </Button>
                  </div>
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
                  {USER_COPY.upload.sendButton}
                </Button>
                {destinationPath && validationResult.ok && (
                  <div className="mt-2 text-sm text-zinc-500 break-all">
                    Folder tujuan: {destinationPath}
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
