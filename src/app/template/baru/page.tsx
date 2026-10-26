"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Plus,
  Upload,
  XCircle,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import Button from "@/components/Button";
import Callout from "@/components/Callout";
import Field from "@/components/Field";
import PageHeader from "@/components/PageHeader";
import {
  SortableColumnRow,
  DragOverlayColumnRow,
  type SortableColumnItemData,
} from "@/components/SortableColumnRow";
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
import { arrayMove, generateStableColumnId } from "@/lib/templates/sortable";
import { sortableAccessibility } from "@/lib/templates/sortableAccessibility";

type RuleType = "text" | "integer" | "digits" | "decimal" | "date" | "list";

type ColumnDraft = SortableColumnItemData;

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
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setColumns((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
    setActiveDragId(null);
  };

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

  const columnContainerRef = useRef<HTMLDivElement>(null);
  const newlyAddedColumnIdRef = useRef<string | null>(null);

  const isSlugValid = slugRegex.test(slug);

  const columnNames = columns.map((c) => c.name.trim());
  const duplicateNames = new Set(
    columnNames.filter(
      (item, index) => item && columnNames.indexOf(item) !== index,
    ),
  );

  const addColumn = () => {
    const newIdx = columns.length + 1;
    const newId = generateStableColumnId();
    newlyAddedColumnIdRef.current = newId;
    const newDraft: ColumnDraft = {
      id: newId,
      name: `kolom_${newIdx}`,
      required: true,
      type: "text",
      rule: { type: "text" },
      isExpanded: false,
    };
    setColumns((prev) => [...prev, newDraft]);
    setTimeout(() => {
      const el = document.getElementById(newId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        const input = el.querySelector("input[type='text']") as HTMLInputElement | null;
        input?.focus();
      }
    }, 50);
  };

  const removeColumn = (id: string) => {
    const targetIdx = columns.findIndex((c) => c.id === id);
    if (targetIdx === -1) return;
    const targetCol = columns[targetIdx];
    setColumns((prev) => prev.filter((c) => c.id !== id));

    notify.info(`Kolom ${targetCol.name} dihapus`, {
      action: {
        label: "Batalkan",
        onClick: () => {
          setColumns((current) => {
            const restored = [...current];
            const insertIdx = Math.min(targetIdx, restored.length);
            restored.splice(insertIdx, 0, targetCol);
            return restored;
          });
        },
      },
    });
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

      const mappedColumns: ColumnDraft[] = inferred.columns.map((c) => ({
        id: generateStableColumnId(),
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
          className={`flex-1 min-h-[44px] py-2 px-3 text-sm font-medium rounded-lg transition-all ${
            activeTab === "manual"
              ? "bg-white text-zinc-900 shadow-xs"
              : "text-zinc-600 hover:text-zinc-900"
          }`}
        >
          Susun manual
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("import")}
          className={`flex-1 min-h-[44px] py-2 px-3 text-sm font-medium rounded-lg transition-all ${
            activeTab === "import"
              ? "bg-white text-zinc-900 shadow-xs"
              : "text-zinc-600 hover:text-zinc-900"
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
              <div className="text-base font-semibold text-zinc-900">
                {isParsingFile
                  ? "Menganalisis berkas..."
                  : "Pilih atau seret berkas CSV / Parquet ke sini"}
              </div>
              <p className="text-sm text-zinc-500 mt-1 max-w-sm mx-auto">
                Berkas dibaca langsung di peramban tanpa diunggah atau disimpan ke server.
              </p>
            </div>
            <div className="pt-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-700 bg-indigo-50 rounded-lg border border-indigo-100">
                <FileSpreadsheet className="w-4 h-4" />
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
          <h2 className="text-base font-semibold text-zinc-900 border-b border-zinc-100 pb-3">
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
          <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 text-sm text-zinc-600 font-mono space-y-1">
            <div className="font-sans font-medium text-zinc-800 text-sm mb-1">
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
              className="block text-base font-medium text-zinc-700 mb-1.5"
            >
              Deskripsi (Opsional)
            </label>
            <textarea
              id="template-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Keterangan isi dan tujuan data..."
              rows={2}
              className="w-full px-3 py-2.5 text-base bg-white text-zinc-900 border border-zinc-200 rounded-lg placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 transition"
            />
          </div>

          <div>
            <label className="block text-base font-medium text-zinc-700 mb-1.5">
              Pemisah CSV (Delimiter)
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 min-h-[44px] text-base text-zinc-700 cursor-pointer">
                <input
                  type="radio"
                  name="delimiter"
                  value=";"
                  checked={delimiter === ";"}
                  onChange={() => setDelimiter(";")}
                  className="w-4 h-4 text-indigo-600 focus:ring-indigo-600"
                />
                Titik koma (;)
              </label>
              <label className="flex items-center gap-2 min-h-[44px] text-base text-zinc-700 cursor-pointer">
                <input
                  type="radio"
                  name="delimiter"
                  value=","
                  checked={delimiter === ","}
                  onChange={() => setDelimiter(",")}
                  className="w-4 h-4 text-indigo-600 focus:ring-indigo-600"
                />
                Koma (,)
              </label>
            </div>
          </div>
        </div>

        {/* Column Editor */}
        <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-zinc-900">Kolom</h2>
              <span className="text-sm px-2.5 py-0.5 rounded-full bg-zinc-100 text-zinc-600 font-medium">
                {columns.length} kolom
              </span>
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

          {columns.length === 0 ? (
            <div className="py-12 text-center border-2 border-dashed border-zinc-200 rounded-xl space-y-3">
              <p className="text-base text-zinc-500">Belum ada kolom.</p>
              <div>
                <Button type="button" variant="primary" onClick={addColumn}>
                  <Plus className="w-4 h-4 mr-1.5 inline" />
                  Tambah kolom
                </Button>
              </div>
            </div>
          ) : (
            <div ref={columnContainerRef} className="space-y-3">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                accessibility={sortableAccessibility}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={columns.map((c) => c.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-3">
                    {columns.map((col, idx) => {
                      const isDuplicate = duplicateNames.has(col.name.trim());
                      const isInvalidName =
                        col.name.trim() && !columnNameRegex.test(col.name.trim());

                      return (
                        <div key={col.id} id={col.id}>
                          <SortableColumnRow
                            col={col}
                            index={idx}
                            total={columns.length}
                            isDuplicate={isDuplicate}
                            isInvalidName={Boolean(isInvalidName)}
                            onUpdate={(patch) => updateColumn(col.id, patch)}
                            onUpdateRule={(patch) => updateColumnRule(col.id, patch)}
                            onRemove={() => removeColumn(col.id)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </SortableContext>
                <DragOverlay>
                  {activeDragId ? (
                    (() => {
                      const activeCol = columns.find((c) => c.id === activeDragId);
                      return activeCol ? <DragOverlayColumnRow col={activeCol} /> : null;
                    })()
                  ) : null}
                </DragOverlay>
              </DndContext>
            </div>
          )}

          {/* Live Preview Header CSV */}
          <div className="mt-4 pt-4 border-t border-zinc-100">
            {importedInfo && (
              <div className="mb-3 p-3 bg-amber-50/80 border border-amber-200 rounded-lg text-sm text-amber-900">
                <span className="font-medium">Catatan impor:</span> Aturan ditebak dari {importedInfo.sampleRowCount.toLocaleString("id-ID")} baris berkas <span className="font-semibold">{importedInfo.fileName}</span>, periksa sebelum menyimpan.
              </div>
            )}

            <div className="text-sm font-semibold text-zinc-700 mb-1">
              Pratinjau Baris Header CSV:
            </div>
            <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 font-mono text-sm text-zinc-800 overflow-x-auto whitespace-nowrap">
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
              <h3 className="text-lg font-semibold text-zinc-900">
                Memproses Template
              </h3>
              <p className="text-sm text-zinc-500 mt-0.5">
                Mempersiapkan volume dan folder di Unity Catalog Databricks.
              </p>
            </div>

            {/* Timeline Langkah */}
            <div className="space-y-3">
              {provisionSteps?.map((step, idx) => (
                <div key={idx} className="flex items-start gap-3 text-sm">
                  {step.status === "success" && (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                  )}
                  {step.status === "running" && (
                    <Loader2 className="w-5 h-5 text-indigo-600 animate-spin mt-0.5 shrink-0" />
                  )}
                  {step.status === "error" && (
                    <XCircle className="w-5 h-5 text-rose-600 mt-0.5 shrink-0" />
                  )}
                  {step.status === "pending" && (
                    <div className="w-5 h-5 rounded-full border border-zinc-300 mt-0.5 shrink-0" />
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
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm space-y-3">
                <div className="flex items-start gap-2 text-amber-900 font-medium">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
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
