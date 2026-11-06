"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Plus,
  UploadCloud,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import Button from "@/components/Button";
import Callout from "@/components/Callout";
import Field from "@/components/Field";
import PageHeader from "@/components/PageHeader";
import {
  defaultRulesByType,
  DragOverlayColumnRow,
  type RuleType,
  SortableColumnRow,
  type SortableColumnItemData,
} from "@/components/SortableColumnRow";
import { notify } from "@/lib/notify";
import { inferFromCsv, inferFromParquet } from "@/lib/templates/infer";
import { sortableAccessibility } from "@/lib/templates/sortableAccessibility";
import {
  columnNameRegex,
  slugify,
  validateSchemaName,
  type ColumnDefinition,
  type ColumnRule,
  type ProvisionStepStatus,
  type TemplateDelimiter,
} from "@/lib/templates";
import { USER_COPY } from "@/lib/copy";

interface ColumnDraft extends SortableColumnItemData {}

export default function NewTemplatePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"import" | "manual">("import");
  const [isConfigured, setIsConfigured] = useState(true);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [isSlugCustomized, setIsSlugCustomized] = useState(false);
  const [description, setDescription] = useState("");
  const [delimiter, setDelimiter] = useState<TemplateDelimiter>(";");
  const [userName, setUserName] = useState("");

  const [columns, setColumns] = useState<ColumnDraft[]>([
    {
      id: "col_1",
      name: "id",
      required: true,
      type: "text",
      rule: { type: "text" },
      isExpanded: false,
    },
  ]);

  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [provisionSteps, setProvisionSteps] = useState<ProvisionStepStatus[] | null>(null);
  const [permissionError, setPermissionError] = useState<{ message: string; detail?: string } | null>(null);
  const [showTechnicalDetail, setShowTechnicalDetail] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    const saved = localStorage.getItem("uploader_user_name");
    if (saved) setUserName(saved);

    fetch("/api/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setIsConfigured(Boolean(data.databricks && data.database));
        } else {
          setIsConfigured(false);
        }
      })
      .catch(() => setIsConfigured(false));

    const searchParams = new URLSearchParams(window.location.search);
    const qName = searchParams.get("name");
    const qDelim = searchParams.get("delimiter");
    const qDesc = searchParams.get("description");
    const qCopyFromId = searchParams.get("copyFromId");

    if (qName) {
      setName(qName);
      setSlug(slugify(qName));
      setActiveTab("manual");
    }
    if (qDelim === ";" || qDelim === ",") {
      setDelimiter(qDelim);
    }
    if (qDesc) {
      setDescription(qDesc);
    }
    if (qCopyFromId) {
      fetch(`/api/templates/${qCopyFromId}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.columns && Array.isArray(data.columns)) {
            setColumns(
              data.columns.map((c: ColumnDefinition, idx: number) => ({
                id: `col_copy_${idx}_${Date.now()}`,
                name: c.name,
                required: c.required,
                type: c.rule.type as RuleType,
                rule: c.rule,
                isExpanded: false,
              }))
            );
            setActiveTab("manual");
          }
        })
        .catch(() => {});
    }
  }, []);

  const handleNameChange = (val: string) => {
    setName(val);
    if (!isSlugCustomized) {
      setSlug(slugify(val));
    }
  };

  const handleSlugChange = (val: string) => {
    setSlug(val.toLowerCase().replace(/[^a-z0-9_]/g, "_"));
    setIsSlugCustomized(true);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setColumns((items) => {
      const oldIndex = items.findIndex((i) => i.id === active.id);
      const newIndex = items.findIndex((i) => i.id === over.id);
      return arrayMove(items, oldIndex, newIndex);
    });
  };

  const addColumn = () => {
    const newId = `col_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newDraft: ColumnDraft = {
      id: newId,
      name: `kolom_${columns.length + 1}`,
      required: true,
      type: "text",
      rule: { type: "text" },
      isExpanded: true,
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

  const removeColumn = (colId: string) => {
    if (columns.length <= 1) {
      notify.warning("Template harus memiliki minimal 1 kolom");
      return;
    }
    const targetIdx = columns.findIndex((c) => c.id === colId);
    if (targetIdx === -1) return;
    const targetCol = columns[targetIdx];
    setColumns((prev) => prev.filter((c) => c.id !== colId));

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

  const updateColumn = (colId: string, patch: Partial<ColumnDraft>) => {
    setColumns((prev) =>
      prev.map((c) => {
        if (c.id !== colId) return c;
        const updated = { ...c, ...patch };
        if (patch.type && patch.type !== c.type) {
          updated.rule = { ...defaultRulesByType[patch.type] };
        }
        return updated;
      })
    );
  };

  const updateColumnRule = (colId: string, rulePatch: Partial<ColumnRule>) => {
    setColumns((prev) =>
      prev.map((c) => {
        if (c.id !== colId) return c;
        return {
          ...c,
          rule: { ...c.rule, ...rulePatch } as ColumnRule,
        };
      })
    );
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
        const buf = await file.arrayBuffer();
        inferred = await inferFromParquet(buf, file.name);
      } else {
        notify.error("Format berkas harus berupa .csv atau .parquet");
        setIsParsingFile(false);
        return;
      }

      setName(inferred.name);
      setSlug(slugify(inferred.name));
      setIsSlugCustomized(false);
      setDelimiter(inferred.delimiter);

      const mapped: ColumnDraft[] = inferred.columns.map((c, i) => ({
        id: `col_imp_${Date.now()}_${i}`,
        name: c.name,
        required: c.required,
        type: c.rule.type as RuleType,
        rule: c.rule,
        isExpanded: false,
      }));

      setColumns(mapped);
      setActiveTab("manual");
      notify.success(`Struktur file berhasil dibaca (${mapped.length} kolom ditemukan)`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal membaca berkas";
      notify.error(msg);
    } finally {
      setIsParsingFile(false);
    }
  };

  const duplicateNames = new Set(
    columns
      .map((c) => c.name.trim().toLowerCase())
      .filter((colName, idx, arr) => colName && arr.indexOf(colName) !== idx)
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) {
      notify.error("Nama template wajib diisi");
      return;
    }

    const trimmedSlug = slug.trim() || slugify(trimmedName);
    const slugCheck = validateSchemaName(trimmedSlug);
    if (!slugCheck.valid) {
      notify.error(slugCheck.error || "Nama folder tidak valid");
      return;
    }

    if (columns.length === 0) {
      notify.error("Template harus memiliki minimal 1 kolom");
      return;
    }

    const seenCols = new Set<string>();
    for (let i = 0; i < columns.length; i++) {
      const c = columns[i];
      const cName = c.name.trim();
      if (!cName) {
        notify.error(`Kolom #${i + 1} belum memiliki nama`);
        return;
      }
      if (!columnNameRegex.test(cName)) {
        notify.error(
          `Nama kolom '${cName}' tidak valid. Gunakan huruf, angka, atau underscore`
        );
        return;
      }
      if (seenCols.has(cName.toLowerCase())) {
        notify.error(`Nama kolom '${cName}' terduplikasi`);
        return;
      }
      seenCols.add(cName.toLowerCase());

      if (c.type === "digits") {
        const len = (c.rule as { length?: number }).length;
        if (!len || len <= 0) {
          notify.error(`Kolom '${cName}' harus memiliki jumlah digit lebih dari 0`);
          return;
        }
      }
      if (c.type === "list") {
        const vals = (c.rule as { values?: string[] }).values;
        if (!vals || vals.length === 0) {
          notify.error(`Kolom '${cName}' harus memiliki minimal 1 pilihan daftar`);
          return;
        }
      }
    }

    setIsSubmitting(true);
    setPermissionError(null);

    const definitionPayload = {
      name: trimmedName,
      slug: trimmedSlug,
      description: description.trim(),
      delimiter,
      volume: {
        catalog: "main",
        schema: trimmedSlug,
        name: "file_storage",
      },
      columns: columns.map((c) => ({
        name: c.name.trim(),
        required: c.required,
        rule: c.rule,
      })),
    };

    try {
      const createRes = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(definitionPayload),
      });

      const createData = await createRes.json();
      if (!createRes.ok || !createData.id) {
        throw new Error(createData.error || "Gagal menyimpan template");
      }

      const templateId = createData.id;

      const provRes = await fetch(`/api/templates/${templateId}/provision`, {
        method: "POST",
      });

      const provData = await provRes.json();
      if (provData.steps) {
        setProvisionSteps(provData.steps);
      }

      if (!provRes.ok || !provData.success) {
        if (provRes.status === 403 || provData.errorDetail) {
          setPermissionError({
            message: provData.error || "Akun koneksi belum punya izin membuat folder penyimpanan baru. Hubungi admin.",
            detail: provData.errorDetail,
          });
        }
        throw new Error(provData.error || "Gagal menyiapkan folder penyimpanan");
      }

      notify.success("Template berhasil dibuat dan siap dipakai");
      setTimeout(() => {
        startTransition(() => {
          router.push("/template");
        });
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan";
      notify.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/template"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-900"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali ke daftar template</span>
        </Link>
      </div>

      <PageHeader
        title="Buat Template Baru"
        description="Siapkan struktur kolom dan folder penyimpanan untuk unggahan data Anda."
      />

      {!isConfigured && (
        <Callout type="error">
          {USER_COPY.connection.notConnected}
        </Callout>
      )}

      {permissionError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-2 text-red-900">
          <div className="flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="text-base font-semibold">{permissionError.message}</div>
              {permissionError.detail && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowTechnicalDetail(!showTechnicalDetail)}
                    className="inline-flex items-center gap-1 text-sm font-medium text-red-700 hover:underline"
                  >
                    <span>Detail teknis</span>
                    {showTechnicalDetail ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5" />
                    )}
                  </button>
                  {showTechnicalDetail && (
                    <div className="mt-2 p-2 bg-red-100/60 rounded text-sm font-mono text-red-800">
                      {permissionError.detail}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex border border-zinc-200 rounded-xl p-1 bg-zinc-100/70 max-w-md">
        <button
          type="button"
          onClick={() => setActiveTab("import")}
          className={`flex-1 min-h-[44px] py-2 px-3 text-sm font-medium rounded-lg transition-all ${
            activeTab === "import"
              ? "bg-white text-zinc-900 shadow-xs"
              : "text-zinc-600 hover:text-zinc-900"
          }`}
        >
          Dari file contoh
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("manual")}
          className={`flex-1 min-h-[44px] py-2 px-3 text-sm font-medium rounded-lg transition-all ${
            activeTab === "manual"
              ? "bg-white text-zinc-900 shadow-xs"
              : "text-zinc-600 hover:text-zinc-900"
          }`}
        >
          Isi sendiri
        </button>
      </div>

      {activeTab === "import" && (
        <div className="bg-white border border-zinc-200 rounded-xl p-8 text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
            <UploadCloud className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">
              Unggah file contoh CSV atau Parquet
            </h2>
            <p className="text-sm text-zinc-500 mt-1">
              Aplikasi akan mendeteksi nama kolom, jenis data, dan pemisah kolom secara otomatis.
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt,.parquet"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileImport(e.target.files[0]);
              }
            }}
          />

          <Button
            type="button"
            variant="primary"
            disabled={isParsingFile}
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[44px] px-6"
          >
            {isParsingFile ? "Membaca file..." : "Pilih file contoh"}
          </Button>
        </div>
      )}

      {activeTab === "manual" && (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-semibold text-zinc-900 border-b border-zinc-100 pb-3">
              Informasi Template
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field
                id="template-name"
                label="Nama Template"
                required
                hint="Nama yang mudah dipahami (contoh: Target Penjualan 2026)"
              >
                <input
                  id="template-name"
                  type="text"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="Masukkan nama template"
                  className="w-full h-11 px-3 text-base bg-white border border-zinc-200 rounded-lg text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </Field>

              <Field
                id="template-slug"
                label="Nama Folder (Slug)"
                required
                hint="Huruf kecil, angka, garis bawah (3-60 karakter)"
              >
                <input
                  id="template-slug"
                  type="text"
                  value={slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  placeholder="nama_folder"
                  className="w-full h-11 px-3 text-base bg-white border border-zinc-200 rounded-lg text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 font-mono"
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field id="template-delimiter" label="Pemisah Kolom CSV (Delimiter)" required>
                <select
                  id="template-delimiter"
                  value={delimiter}
                  onChange={(e) => setDelimiter(e.target.value as TemplateDelimiter)}
                  className="w-full h-11 px-3 text-base bg-white border border-zinc-200 rounded-lg text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                >
                  <option value=";">Titik koma (;)</option>
                  <option value=",">Koma (,)</option>
                </select>
              </Field>

              <Field id="template-description" label="Deskripsi (Opsional)">
                <input
                  id="template-description"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Penjelasan singkat penggunaan template"
                  className="w-full h-11 px-3 text-base bg-white border border-zinc-200 rounded-lg text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </Field>
            </div>
          </div>

          <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <div>
                <h2 className="text-base font-semibold text-zinc-900">
                  Daftar Kolom ({columns.length})
                </h2>
                <p className="text-sm text-zinc-500 mt-0.5">
                  Tentukan kolom dan klik tombol Aturan untuk menyesuaikan aturan pengisian.
                </p>
              </div>

              <Button
                type="button"
                variant="secondary"
                onClick={addColumn}
                className="min-h-[44px] gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah kolom</span>
              </Button>
            </div>

            <DndContext
              id="template-baru-dnd"
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
                    const isDup = duplicateNames.has(col.name.trim().toLowerCase());
                    const isInvalid = !columnNameRegex.test(col.name.trim());
                    return (
                      <div key={col.id} id={col.id}>
                        <SortableColumnRow
                          col={col}
                          index={idx}
                          total={columns.length}
                          isDuplicate={isDup}
                          isInvalidName={Boolean(col.name.trim() && isInvalid)}
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

          {provisionSteps && (
            <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-3">
              <h3 className="text-base font-semibold text-zinc-900">
                Kemajuan Penyiapan Folder
              </h3>
              <div className="space-y-2">
                {provisionSteps.map((step) => (
                  <div
                    key={step.step}
                    className="flex items-center justify-between py-2 border-b border-zinc-100 last:border-0"
                  >
                    <span className="text-base text-zinc-800">{step.name}</span>
                    <div className="flex items-center gap-2">
                      {step.status === "success" && (
                        <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Selesai</span>
                        </span>
                      )}
                      {step.status === "running" && (
                        <span className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Memproses</span>
                        </span>
                      )}
                      {step.status === "pending" && (
                        <span className="inline-flex items-center gap-1 text-sm text-zinc-400">
                          <Clock className="w-4 h-4" />
                          <span>Menunggu</span>
                        </span>
                      )}
                      {step.status === "error" && (
                        <span className="inline-flex items-center gap-1 text-sm font-medium text-red-600">
                          <XCircle className="w-4 h-4" />
                          <span>Gagal</span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-200">
            <Link href="/template">
              <Button type="button" variant="secondary" className="min-h-[44px]">
                Batal
              </Button>
            </Link>
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting}
              className="min-h-[44px] px-6"
            >
              {isSubmitting ? "Menyiapkan..." : "Simpan dan buat folder"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
