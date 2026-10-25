"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  Loader2,
  Plus,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import Button from "@/components/Button";
import Callout from "@/components/Callout";
import Field from "@/components/Field";
import PageHeader from "@/components/PageHeader";
import { notify } from "@/lib/notify";
import { USER_COPY } from "@/lib/copy";
import type { ConnectionState, MaskedSettings } from "@/lib/settings";
import { inferFromCsv, inferFromParquet } from "@/lib/templates/infer";
import {
  columnNameRegex,
  slugRegex,
  slugify,
  type ColumnDefinition,
  type ColumnRule,
  type ProvisionStepStatus,
  type TemplateDelimiter,
} from "@/lib/templates/schema";

type RuleType = "text" | "integer" | "digits" | "decimal" | "date" | "list";

interface ColumnDraft {
  id: string;
  name: string;
  originalName?: string;
  renamed?: boolean;
  required: boolean;
  type: RuleType;
  rule: ColumnRule;
  isExpanded: boolean;
  observedMin?: number;
  observedMax?: number;
}

const defaultRules: Record<RuleType, ColumnRule> = {
  text: { type: "text" },
  integer: { type: "integer" },
  digits: { type: "digits", length: 9 },
  decimal: {
    type: "decimal",
    allowComma: true,
    allowDot: true,
    allowScientific: true,
  },
  date: { type: "date", format: "yyyy-MM-dd" },
  list: { type: "list", values: ["Aktif", "Nonaktif"] },
};

export default function NewTemplatePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"manual" | "import">("manual");
  const [settings, setSettings] = useState<MaskedSettings | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState | null>(null);
  const [isSettingsConfigured, setIsSettingsConfigured] = useState(true);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [isSlugCustomized, setIsSlugCustomized] = useState(false);
  const [description, setDescription] = useState("");
  const [delimiter, setDelimiter] = useState<TemplateDelimiter>(";");
  const [columns, setColumns] = useState<ColumnDraft[]>([
    {
      id: "col-1",
      name: "kode_material",
      required: true,
      type: "digits",
      rule: { type: "digits", length: 9 },
      isExpanded: false,
    },
    {
      id: "col-2",
      name: "tahun",
      required: true,
      type: "digits",
      rule: { type: "digits", length: 4 },
      isExpanded: false,
    },
    {
      id: "col-3",
      name: "persentase",
      required: true,
      type: "decimal",
      rule: {
        type: "decimal",
        allowComma: true,
        allowDot: true,
        allowScientific: true,
      },
      isExpanded: false,
    },
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [importedInfo, setImportedInfo] = useState<{
    fileName: string;
    sampleRowCount: number;
  } | null>(null);
  const [provisionSteps, setProvisionSteps] = useState<
    ProvisionStepStatus[] | null
  >(null);
  const [volumeExistsError, setVolumeExistsError] = useState<{
    message: string;
    templateId: string;
  } | null>(null);
  const [currentTemplateId, setCurrentTemplateId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.connection) {
          setConnectionState(data.connection);
          setIsSettingsConfigured(Boolean(data.configured));
        } else if (data?.settings) {
          setIsSettingsConfigured(Boolean(data.configured));
        } else {
          setIsSettingsConfigured(false);
        }
        if (data?.settings) {
          setSettings(data.settings);
        }
      })
      .catch(() => {
        setIsSettingsConfigured(false);
      });
  }, []);

  const handleNameChange = (val: string) => {
    setName(val);
    if (!isSlugCustomized) {
      setSlug(slugify(val));
    }
  };

  const handleSlugChange = (val: string) => {
    setIsSlugCustomized(true);
    setSlug(val.trim().toLowerCase());
  };

  const isSlugValid = slugRegex.test(slug);

  const columnNames = columns.map((c) => c.name.trim());
  const duplicateNames = new Set(
    columnNames.filter(
      (item, index) => item && columnNames.indexOf(item) !== index,
    ),
  );

  const addColumn = () => {
    const newIdx = columns.length + 1;
    const newDraft: ColumnDraft = {
      id: `col-${Date.now()}`,
      name: `kolom_${newIdx}`,
      required: true,
      type: "text",
      rule: { type: "text" },
      isExpanded: true,
    };
    setColumns((prev) => [...prev, newDraft]);
  };

  const removeColumn = (id: string) => {
    setColumns((prev) => prev.filter((c) => c.id !== id));
  };

  const moveColumn = (index: number, direction: "up" | "down") => {
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= columns.length) return;
    const updated = [...columns];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIdx, 0, moved);
    setColumns(updated);
  };

  const updateColumn = (id: string, patch: Partial<ColumnDraft>) => {
    setColumns((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const updated = { ...c, ...patch };
        if (patch.type && patch.type !== c.type) {
          updated.rule = { ...defaultRules[patch.type] };
        }
        return updated;
      }),
    );
  };

  const updateColumnRule = (id: string, patchRule: Partial<ColumnRule>) => {
    setColumns((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        return {
          ...c,
          rule: { ...c.rule, ...patchRule } as ColumnRule,
        };
      }),
    );
  };

  const runProvisioning = async (
    templateId: string,
    reuseExistingVolume: boolean = false,
  ) => {
    setIsSubmitting(true);
    setVolumeExistsError(null);

    setProvisionSteps([
      {
        step: "save_definition",
        name: "Simpan definisi template",
        status: "success",
      },
      {
        step: "create_volume",
        name: "Buat volume di Unity Catalog",
        status: "running",
      },
      { step: "create_csv", name: "Buat folder csv/", status: "pending" },
      {
        step: "create_parquet",
        name: "Buat folder parquet/",
        status: "pending",
      },
      { step: "activate", name: "Aktifkan template", status: "pending" },
    ]);

    try {
      const res = await fetch(`/api/templates/${templateId}/provision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reuseExistingVolume }),
      });

      const data = await res.json();
      if (data.steps) {
        setProvisionSteps(data.steps);
      }

      if (!res.ok || !data.success) {
        if (data.volumeExists) {
          setVolumeExistsError({
            message: data.error || "Volume sudah ada di Unity Catalog.",
            templateId,
          });
        }
        throw new Error(data.error || "Gagal memproses template ke Databricks");
      }

      notify.success("Template berhasil dibuat dan diaktifkan");
      setTimeout(() => {
        router.push("/template");
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan";
      notify.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileImport = async (file: File) => {
    setIsParsingFile(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      let inferred;

      if (ext === "csv" || ext === "txt") {
        const text = await file.text();
        inferred = inferFromCsv(text, file.name);
      } else if (ext === "parquet") {
        const buffer = await file.arrayBuffer();
        inferred = await inferFromParquet(buffer, file.name);
      } else {
        throw new Error("Format berkas harus berupa CSV (.csv) atau Parquet (.parquet)");
      }

      setName(inferred.name);
      setSlug(slugify(inferred.name));
      setIsSlugCustomized(false);
      setDelimiter(inferred.delimiter);

      const mappedColumns: ColumnDraft[] = inferred.columns.map((c, i) => ({
        id: `col-import-${i}-${Date.now()}`,
        name: c.name,
        originalName: c.originalName,
        renamed: c.renamed,
        required: c.required,
        type: c.type,
        rule: c.rule,
        isExpanded: false,
        observedMin: c.observedMin,
        observedMax: c.observedMax,
      }));

      setColumns(mappedColumns);
      setImportedInfo({
        fileName: file.name,
        sampleRowCount: inferred.sampleRowCount,
      });
      setActiveTab("manual");
      notify.success(`Berhasil mengimpor struktur dari ${file.name}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal membaca berkas";
      notify.error(msg);
    } finally {
      setIsParsingFile(false);
    }
  };

  const handleFinish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSettingsConfigured || !settings?.catalog || !settings?.schema) {
      notify.error("Pengaturan belum lengkap");
      return;
    }

    if (!isSlugValid) {
      notify.error("Slug tidak valid (3-60 huruf kecil, angka, atau _)");
      return;
    }

    if (duplicateNames.size > 0) {
      notify.error("Terdapat nama kolom duplikat");
      return;
    }

    if (columns.length === 0) {
      notify.error("Template minimal harus memiliki 1 kolom");
      return;
    }

    for (const c of columns) {
      if (!columnNameRegex.test(c.name.trim())) {
        notify.error(
          `Nama kolom '${c.name}' tidak valid (hanya huruf, angka, underscore)`,
        );
        return;
      }
    }

    setIsSubmitting(true);
    setVolumeExistsError(null);

    const formattedColumns: ColumnDefinition[] = columns.map((c) => ({
      name: c.name.trim(),
      required: c.required,
      rule: c.rule,
    }));

    try {
      const createRes = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slug,
          description: description.trim(),
          delimiter,
          volume: {
            catalog: settings.catalog,
            schema: settings.schema,
            name: slug,
          },
          columns: formattedColumns,
        }),
      });

      const created = await createRes.json();
      if (!createRes.ok) {
        throw new Error(created.error || "Gagal menyimpan template");
      }

      setCurrentTemplateId(created.id);
      await runProvisioning(created.id, false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan";
      notify.error(msg);
      setIsSubmitting(false);
    }
  };

  const catalogDisplay = settings?.catalog || "<katalog>";
  const schemaDisplay = settings?.schema || "<skema>";
  const slugDisplay = slug || "<Volume>";

  const headerPreview = columns
    .map((c) => c.name.trim() || "<kolom>")
    .join(delimiter);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Buat Template"
        description="Definisikan aturan kolom dan otomatis buat volume di Databricks."
      />

      {/* Segmented Control */}
      <div className="flex border border-zinc-200 rounded-xl p-1 bg-zinc-100/70 max-w-sm">
        <button
          type="button"
          onClick={() => setActiveTab("manual")}
          className={`flex-1 py-1.5 px-3 text-xs font-medium rounded-lg transition-all ${
            activeTab === "manual"
              ? "bg-white text-zinc-900 shadow-xs"
              : "text-zinc-500 hover:text-zinc-900"
          }`}
        >
          Susun manual
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("import")}
          className={`flex-1 py-1.5 px-3 text-xs font-medium rounded-lg transition-all ${
            activeTab === "import"
              ? "bg-white text-zinc-900 shadow-xs"
              : "text-zinc-500 hover:text-zinc-900"
          }`}
        >
          Impor dari file
        </button>
      </div>

      {activeTab === "import" && (
        <div className="bg-white border-2 border-dashed border-zinc-300 rounded-2xl p-8 text-center hover:border-indigo-400 transition-colors">
          <input
            type="file"
            id="file-import-input"
            accept=".csv,.parquet"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileImport(file);
              e.target.value = "";
            }}
          />
          <label
            htmlFor="file-import-input"
            className="cursor-pointer flex flex-col items-center justify-center space-y-3"
            onDragOver={(e) => {
              e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file) handleFileImport(file);
            }}
          >
            <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
              {isParsingFile ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <Upload className="w-6 h-6" />
              )}
            </div>
            <div>
              <div className="text-sm font-semibold text-zinc-900">
                {isParsingFile
                  ? "Menganalisis berkas..."
                  : "Pilih atau seret berkas CSV / Parquet ke sini"}
              </div>
              <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
                Berkas dibaca langsung di peramban tanpa diunggah atau disimpan ke server.
              </p>
            </div>
            <div className="pt-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 rounded-lg border border-indigo-100">
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Mendukung .csv (maks 5.000 baris) & .parquet
              </span>
            </div>
          </label>
        </div>
      )}

      {!isSettingsConfigured && (
        <Callout type="warning" title="Koneksi penyimpanan belum siap">
          {connectionState?.error === "database_tidak_terjangkau"
            ? USER_COPY.connection.dbUnavailable
            : connectionState?.missing && connectionState.missing.length > 0
            ? USER_COPY.connection.buildIncompleteMessage(connectionState.missing)
            : "Koneksi ke penyimpanan data belum lengkap. Minta admin melengkapinya di halaman Koneksi Databricks."}
          <div className="mt-2">
            <Link
              href="/pengaturan"
              className="underline font-semibold text-indigo-700"
            >
              Buka Koneksi Databricks
            </Link>
          </div>
        </Callout>
      )}

      {/* Form Manual */}
      <form onSubmit={handleFinish} className="space-y-6">
        <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-900 border-b border-zinc-100 pb-3">
            Informasi Template
          </h2>

          <Field
            id="template-name"
            label="Nama Template"
            name="name"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Target Brand Distribution"
            required
          />

          <div>
            <Field
              id="template-slug"
              label="Volume Template"
              hint="Digunakan untuk penamaan folder volume di Unity Catalog (3-60 karakter, huruf kecil, angka, _)."
              name="slug"
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder="target_brand_distribution"
              required
              error={
                slug && !isSlugValid ? "Format Volume tidak valid" : undefined
              }
            />
          </div>

          {/* Live Preview Path Volume */}
          <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 text-xs text-zinc-600 font-mono space-y-1">
            <div className="font-sans font-medium text-zinc-800 text-[13px] mb-1">
              Pratinjau Lokasi Volume di Databricks:
            </div>
            <div>
              /Volumes/{catalogDisplay}/{schemaDisplay}/{slugDisplay}/csv/
            </div>
            <div>
              /Volumes/{catalogDisplay}/{schemaDisplay}/{slugDisplay}/parquet/
            </div>
          </div>

          <div>
            <label
              htmlFor="template-description"
              className="block text-sm font-medium text-zinc-700 mb-1.5"
            >
              Deskripsi (Opsional)
            </label>
            <textarea
              id="template-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Keterangan isi dan tujuan data..."
              rows={2}
              className="w-full px-3 py-2 text-sm bg-white text-zinc-900 border border-zinc-200 rounded-lg placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 transition"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">
              Pemisah CSV (Delimiter)
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-zinc-700 cursor-pointer">
                <input
                  type="radio"
                  name="delimiter"
                  value=";"
                  checked={delimiter === ";"}
                  onChange={() => setDelimiter(";")}
                  className="text-indigo-600 focus:ring-indigo-600"
                />
                Titik koma (;)
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-700 cursor-pointer">
                <input
                  type="radio"
                  name="delimiter"
                  value=","
                  checked={delimiter === ","}
                  onChange={() => setDelimiter(",")}
                  className="text-indigo-600 focus:ring-indigo-600"
                />
                Koma (,)
              </label>
            </div>
          </div>
        </div>

        {/* Column Editor */}
        <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">
                Definisi Kolom
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Tentukan nama, tipe data, dan aturan validasi per kolom.
              </p>
            </div>
            <Button type="button" variant="secondary" onClick={addColumn}>
              <Plus className="w-4 h-4 mr-1 inline" />
              Tambah kolom
            </Button>
          </div>

          {duplicateNames.size > 0 && (
            <Callout type="error" title="Kolom Duplikat">
              Nama kolom berikut tidak boleh sama:{" "}
              {Array.from(duplicateNames).join(", ")}
            </Callout>
          )}

          <div className="space-y-3">
            {columns.map((col, idx) => {
              const isDuplicate = duplicateNames.has(col.name.trim());
              const isInvalidName =
                col.name.trim() && !columnNameRegex.test(col.name.trim());

              return (
                <div
                  key={col.id}
                  className={`border rounded-lg transition-all ${
                    isDuplicate || isInvalidName
                      ? "border-rose-300 bg-rose-50/20"
                      : "border-zinc-200 bg-white"
                  }`}
                >
                  <div className="p-3.5 flex flex-wrap items-center gap-3">
                    <span className="text-xs font-mono text-zinc-400 w-6">
                      #{idx + 1}
                    </span>

                    <div className="flex-1 min-w-44">
                      <input
                        type="text"
                        value={col.name}
                        onChange={(e) =>
                          updateColumn(col.id, { name: e.target.value })
                        }
                        placeholder="nama_kolom"
                        className="w-full h-9 px-2.5 text-xs font-mono bg-white border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-600"
                      />
                      {col.renamed && col.originalName && (
                        <div className="text-[11px] text-amber-600 mt-1">
                          Disesuaikan dari: <span className="font-mono">{col.originalName}</span>
                        </div>
                      )}
                    </div>

                    <div className="w-32">
                      <select
                        value={col.type}
                        onChange={(e) =>
                          updateColumn(col.id, {
                            type: e.target.value as RuleType,
                          })
                        }
                        className="w-full h-9 px-2 text-xs bg-white border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-600"
                      >
                        <option value="text">Teks</option>
                        <option value="digits">Digit Angka</option>
                        <option value="integer">Bilangan Bulat</option>
                        <option value="decimal">Desimal</option>
                        <option value="date">Tanggal</option>
                        <option value="list">Daftar Pilihan</option>
                      </select>
                    </div>

                    <div className="w-28">
                      <select
                        value={col.required ? "wajib" : "opsional"}
                        onChange={(e) =>
                          updateColumn(col.id, {
                            required: e.target.value === "wajib",
                          })
                        }
                        className="w-full h-9 px-2 text-xs bg-white border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-600"
                      >
                        <option value="wajib">Wajib</option>
                        <option value="opsional">Boleh kosong</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-1 ml-auto">
                      <button
                        type="button"
                        onClick={() =>
                          updateColumn(col.id, { isExpanded: !col.isExpanded })
                        }
                        className="p-1.5 text-zinc-500 hover:text-zinc-800 rounded hover:bg-zinc-100"
                        title="Aturan lanjutan"
                      >
                        {col.isExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => moveColumn(idx, "up")}
                        className="p-1.5 text-zinc-400 hover:text-zinc-700 disabled:opacity-30 rounded hover:bg-zinc-100"
                        title="Geser ke atas"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === columns.length - 1}
                        onClick={() => moveColumn(idx, "down")}
                        className="p-1.5 text-zinc-400 hover:text-zinc-700 disabled:opacity-30 rounded hover:bg-zinc-100"
                        title="Geser ke bawah"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeColumn(col.id)}
                        className="p-1.5 text-zinc-400 hover:text-rose-600 rounded hover:bg-rose-50"
                        title="Hapus kolom"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Panel Aturan Lanjutan */}
                  {col.isExpanded && (
                    <div className="p-4 bg-zinc-50/70 border-t border-zinc-200 text-xs space-y-3">
                      {col.type === "digits" && (
                        <div className="flex items-center gap-3">
                          <label className="font-medium text-zinc-700">
                            Panjang digit pasti:
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="64"
                            value={
                              (col.rule as { length?: number }).length || 9
                            }
                            onChange={(e) =>
                              updateColumnRule(col.id, {
                                length: Number(e.target.value),
                              })
                            }
                            className="w-20 h-8 px-2 bg-white border border-zinc-200 rounded text-xs"
                          />
                          <span className="text-zinc-500">
                            (Contoh: 9 digit angka seperti kode material)
                          </span>
                        </div>
                      )}

                      {col.type === "integer" && (
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-4">
                            <div className="flex items-center gap-2">
                              <span className="text-zinc-700">
                                Nilai minimum:
                              </span>
                              <input
                                type="number"
                                value={(col.rule as { min?: number }).min ?? ""}
                                onChange={(e) =>
                                  updateColumnRule(col.id, {
                                    min:
                                      e.target.value === ""
                                        ? undefined
                                        : Number(e.target.value),
                                  })
                                }
                                placeholder={
                                  col.observedMin !== undefined
                                    ? `Saran: ${col.observedMin}`
                                    : "Tanpa batas"
                                }
                                className="w-24 h-8 px-2 bg-white border border-zinc-200 rounded text-xs"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-zinc-700">
                                Nilai maksimum:
                              </span>
                              <input
                                type="number"
                                value={(col.rule as { max?: number }).max ?? ""}
                                onChange={(e) =>
                                  updateColumnRule(col.id, {
                                    max:
                                      e.target.value === ""
                                        ? undefined
                                        : Number(e.target.value),
                                  })
                                }
                                placeholder={
                                  col.observedMax !== undefined
                                    ? `Saran: ${col.observedMax}`
                                    : "Tanpa batas"
                                }
                                className="w-24 h-8 px-2 bg-white border border-zinc-200 rounded text-xs"
                              />
                            </div>
                          </div>
                          {(col.observedMin !== undefined ||
                            col.observedMax !== undefined) && (
                            <div className="text-[11px] text-zinc-500">
                              Nilai sampel teramati: min {col.observedMin}, max {col.observedMax}.
                            </div>
                          )}
                        </div>
                      )}

                      {col.type === "decimal" && (
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-4">
                            <label className="flex items-center gap-1.5 text-zinc-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={
                                  (col.rule as { allowComma?: boolean })
                                    .allowComma ?? true
                                }
                                onChange={(e) =>
                                  updateColumnRule(col.id, {
                                    allowComma: e.target.checked,
                                  })
                                }
                              />
                              Boleh tanda koma (,) sebagai desimal
                            </label>
                            <label className="flex items-center gap-1.5 text-zinc-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={
                                  (col.rule as { allowDot?: boolean })
                                    .allowDot ?? true
                                }
                                onChange={(e) =>
                                  updateColumnRule(col.id, {
                                    allowDot: e.target.checked,
                                  })
                                }
                              />
                              Boleh tanda titik (.) sebagai desimal
                            </label>
                            <label className="flex items-center gap-1.5 text-zinc-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={
                                  (col.rule as { allowScientific?: boolean })
                                    .allowScientific ?? true
                                }
                                onChange={(e) =>
                                  updateColumnRule(col.id, {
                                    allowScientific: e.target.checked,
                                  })
                                }
                              />
                              Boleh notasi ilmiah (misal 1.8E-5)
                            </label>
                          </div>
                          <div className="flex items-center gap-2 pt-1">
                            <span className="text-zinc-700">
                              Teks khusus yang diizinkan (pisahkan koma):
                            </span>
                            <input
                              type="text"
                              value={(
                                (col.rule as { allowedText?: string[] })
                                  .allowedText || []
                              ).join(", ")}
                              onChange={(e) => {
                                const vals = e.target.value
                                  .split(",")
                                  .map((s) => s.trim())
                                  .filter(Boolean);
                                updateColumnRule(col.id, { allowedText: vals });
                              }}
                              placeholder="Maintain % Last BD, N/A"
                              className="flex-1 h-8 px-2 bg-white border border-zinc-200 rounded text-xs"
                            />
                          </div>
                        </div>
                      )}

                      {col.type === "date" && (
                        <div className="flex items-center gap-3">
                          <span className="text-zinc-700">Format tanggal:</span>
                          <select
                            value={
                              (col.rule as { format?: string }).format ||
                              "yyyy-MM-dd"
                            }
                            onChange={(e) =>
                              updateColumnRule(col.id, {
                                format: e.target.value as
                                  | "yyyy-MM-dd"
                                  | "dd/MM/yyyy"
                                  | "MM/dd/yyyy"
                                  | "dd-MM-yyyy"
                                  | "yyyy/MM/dd",
                              })
                            }
                            className="h-8 px-2 bg-white border border-zinc-200 rounded text-xs"
                          >
                            <option value="yyyy-MM-dd">
                              yyyy-MM-dd (2026-01-31)
                            </option>
                            <option value="dd/MM/yyyy">
                              dd/MM/yyyy (31/01/2026)
                            </option>
                            <option value="MM/dd/yyyy">
                              MM/dd/yyyy (01/31/2026)
                            </option>
                            <option value="dd-MM-yyyy">
                              dd-MM-yyyy (31-01-2026)
                            </option>
                            <option value="yyyy/MM/dd">
                              yyyy/MM/dd (2026/01/31)
                            </option>
                          </select>
                        </div>
                      )}

                      {col.type === "list" && (
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-700">
                            Daftar nilai valid (pisahkan koma):
                          </span>
                          <input
                            type="text"
                            value={(
                              (col.rule as { values?: string[] }).values || []
                            ).join(", ")}
                            onChange={(e) => {
                              const vals = e.target.value
                                .split(",")
                                .map((s) => s.trim())
                                .filter(Boolean);
                              updateColumnRule(col.id, { values: vals });
                            }}
                            placeholder="Aktif, Nonaktif, Pending"
                            className="flex-1 h-8 px-2 bg-white border border-zinc-200 rounded text-xs"
                          />
                        </div>
                      )}

                      {col.type === "text" && (
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-700">
                              Panjang minimal:
                            </span>
                            <input
                              type="number"
                              min="0"
                              value={
                                (col.rule as { minLength?: number })
                                  .minLength ?? ""
                              }
                              onChange={(e) =>
                                updateColumnRule(col.id, {
                                  minLength:
                                    e.target.value === ""
                                      ? undefined
                                      : Number(e.target.value),
                                })
                              }
                              placeholder="0"
                              className="w-20 h-8 px-2 bg-white border border-zinc-200 rounded text-xs"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-700">
                              Panjang maksimal:
                            </span>
                            <input
                              type="number"
                              min="0"
                              value={
                                (col.rule as { maxLength?: number })
                                  .maxLength ?? ""
                              }
                              onChange={(e) =>
                                updateColumnRule(col.id, {
                                  maxLength:
                                    e.target.value === ""
                                      ? undefined
                                      : Number(e.target.value),
                                })
                              }
                              placeholder="255"
                              className="w-20 h-8 px-2 bg-white border border-zinc-200 rounded text-xs"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Live Preview Header CSV */}
          <div className="mt-4 pt-4 border-t border-zinc-100">
            {importedInfo && (
              <div className="mb-3 p-3 bg-amber-50/80 border border-amber-200 rounded-lg text-xs text-amber-900">
                <span className="font-medium">Catatan impor:</span> Aturan ditebak dari {importedInfo.sampleRowCount.toLocaleString("id-ID")} baris berkas <span className="font-semibold">{importedInfo.fileName}</span>, periksa sebelum menyimpan.
              </div>
            )}

            <div className="text-xs font-semibold text-zinc-700 mb-1">
              Pratinjau Baris Header CSV:
            </div>
            <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-2.5 font-mono text-xs text-zinc-800 overflow-x-auto whitespace-nowrap">
              {headerPreview || "(Belum ada kolom)"}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <Link href="/template">
            <Button type="button" variant="ghost">
              Batal
            </Button>
          </Link>

          <Button
            type="submit"
            variant="primary"
            disabled={!isSettingsConfigured || isSubmitting}
            isLoading={isSubmitting}
          >
            Selesai
          </Button>
        </div>
      </form>

      {/* Modal / Timeline Proses Pembuatan */}
      {(provisionSteps || volumeExistsError) && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-zinc-200 max-w-lg w-full p-6 shadow-xl space-y-5 animate-in fade-in zoom-in-95">
            <div>
              <h3 className="text-base font-semibold text-zinc-900">
                Memproses Template
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Mempersiapkan volume dan folder di Unity Catalog Databricks.
              </p>
            </div>

            {/* Timeline Langkah */}
            <div className="space-y-3">
              {provisionSteps?.map((step, idx) => (
                <div key={idx} className="flex items-start gap-3 text-xs">
                  {step.status === "success" && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  )}
                  {step.status === "running" && (
                    <Loader2 className="w-4 h-4 text-indigo-600 animate-spin mt-0.5 shrink-0" />
                  )}
                  {step.status === "error" && (
                    <XCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
                  )}
                  {step.status === "pending" && (
                    <div className="w-4 h-4 rounded-full border border-zinc-300 mt-0.5 shrink-0" />
                  )}

                  <div className="flex-1">
                    <div
                      className={`font-medium ${
                        step.status === "error"
                          ? "text-rose-900"
                          : step.status === "success"
                            ? "text-zinc-900"
                            : "text-zinc-500"
                      }`}
                    >
                      {step.name}
                    </div>
                    {step.message && (
                      <div className="text-zinc-500 mt-0.5">{step.message}</div>
                    )}
                    {step.fix && (
                      <div className="text-rose-600 font-medium mt-0.5">
                        {step.fix}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Penanganan Konflik Volume Sudah Ada */}
            {volumeExistsError && currentTemplateId && (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-3">
                <div className="flex items-start gap-2 text-amber-900 font-medium">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>{volumeExistsError.message}</div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    type="button"
                    variant="primary"
                    disabled={isSubmitting}
                    onClick={() => runProvisioning(currentTemplateId, true)}
                  >
                    Gunakan volume yang ada
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isSubmitting}
                    onClick={() => {
                      setVolumeExistsError(null);
                      setProvisionSteps(null);
                    }}
                  >
                    Ganti slug
                  </Button>
                </div>
              </div>
            )}

            {/* Tombol Coba Lagi jika Error Non-Konflik */}
            {provisionSteps?.some((s) => s.status === "error") &&
              !volumeExistsError &&
              currentTemplateId && (
                <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setProvisionSteps(null)}
                  >
                    Tutup
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    disabled={isSubmitting}
                    onClick={() => runProvisioning(currentTemplateId, false)}
                  >
                    Coba lagi
                  </Button>
                </div>
              )}
          </div>
        </div>
      )}
    </div>
  );
}
