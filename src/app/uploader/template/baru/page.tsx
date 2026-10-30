"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Database,
  FileSpreadsheet,
  FileUp,
  GripVertical,
  Plus,
  Trash2,
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
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Button from "@/components/Button";
import Callout from "@/components/Callout";
import Field from "@/components/Field";
import PageHeader from "@/components/PageHeader";
import { notify } from "@/lib/notify";
import { inferFromCsv, inferFromParquet } from "@/lib/templates/infer";
import {
  slugify,
  validateSchemaName,
  type ColumnDefinition,
  type ColumnRule,
  type ProvisionStepStatus,
  type TemplateDelimiter,
} from "@/lib/templates";
import { USER_COPY } from "@/lib/copy";

interface ColumnDraft {
  id: string;
  name: string;
  required: boolean;
  rule: ColumnRule;
  formatOption?: string;
}

function SortableColumnItem({
  col,
  idx,
  onUpdate,
  onRemove,
  canRemove,
}: {
  col: ColumnDraft;
  idx: number;
  onUpdate: (updated: ColumnDraft) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: col.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  const ruleType = col.rule.type;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-3 p-4 bg-white border rounded-xl transition-all ${
        isDragging
          ? "border-indigo-500 shadow-lg ring-2 ring-indigo-500/20 opacity-90"
          : "border-zinc-200 hover:border-zinc-300"
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Pindahkan urutan kolom"
        className="mt-2.5 p-1 text-zinc-400 hover:text-zinc-700 cursor-grab active:cursor-grabbing shrink-0"
      >
        <GripVertical className="w-5 h-5" />
      </button>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
        <div className="md:col-span-5">
          <input
            type="text"
            value={col.name}
            onChange={(e) => onUpdate({ ...col, name: e.target.value })}
            placeholder="Nama kolom"
            className="w-full h-11 px-3 text-base bg-white border border-zinc-200 rounded-lg text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
          />
        </div>

        <div className="md:col-span-4">
          <select
            value={ruleType}
            onChange={(e) => {
              const newType = e.target.value;
              let newRule: ColumnRule;
              if (newType === "digits") newRule = { type: "digits", length: 6 };
              else if (newType === "integer") newRule = { type: "integer" };
              else if (newType === "decimal") newRule = { type: "decimal" };
              else if (newType === "date") newRule = { type: "date", format: "yyyy-MM-dd" };
              else if (newType === "list") newRule = { type: "list", values: ["PILIHAN_1"] };
              else newRule = { type: "text" };
              onUpdate({ ...col, rule: newRule });
            }}
            className="w-full h-11 px-3 text-base bg-white border border-zinc-200 rounded-lg text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
          >
            <option value="text">Teks</option>
            <option value="digits">Digit angka</option>
            <option value="integer">Bilangan bulat</option>
            <option value="decimal">Desimal</option>
            <option value="date">Tanggal</option>
            <option value="list">Daftar pilihan</option>
          </select>
        </div>

        <div className="md:col-span-3 flex items-center justify-between h-11 px-1">
          <label className="flex items-center gap-2 cursor-pointer text-base text-zinc-700">
            <input
              type="checkbox"
              checked={col.required}
              onChange={(e) => onUpdate({ ...col, required: e.target.checked })}
              className="w-4 h-4 rounded text-indigo-600 border-zinc-300 focus:ring-indigo-600"
            />
            <span>Wajib diisi</span>
          </label>

          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="p-2 text-zinc-400 hover:text-red-600 transition-colors"
              title="Hapus kolom"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

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
      rule: { type: "text" },
    },
  ]);

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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setColumns((items) => {
      const oldIndex = items.findIndex((i) => i.id === active.id);
      const newIndex = items.findIndex((i) => i.id === over.id);
      return arrayMove(items, oldIndex, newIndex);
    });
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
        rule: c.rule,
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
    for (const c of columns) {
      const cName = c.name.trim();
      if (!cName) {
        notify.error("Nama kolom tidak boleh kosong");
        return;
      }
      if (seenCols.has(cName.toLowerCase())) {
        notify.error(`Nama kolom '${cName}' terduplikasi`);
        return;
      }
      seenCols.add(cName.toLowerCase());
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
          router.push("/uploader/template");
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
          href="/uploader/template"
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
                  Tentukan kolom yang harus ada pada berkas yang diunggah.
                </p>
              </div>

              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  setColumns((prev) => [
                    ...prev,
                    {
                      id: `col_${Date.now()}`,
                      name: `kolom_${prev.length + 1}`,
                      required: true,
                      rule: { type: "text" },
                    },
                  ])
                }
                className="min-h-[44px] gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah kolom</span>
              </Button>
            </div>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={columns.map((c) => c.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-3">
                  {columns.map((col, idx) => (
                    <SortableColumnItem
                      key={col.id}
                      col={col}
                      idx={idx}
                      onUpdate={(up) =>
                        setColumns((prev) =>
                          prev.map((c) => (c.id === col.id ? up : c))
                        )
                      }
                      onRemove={() =>
                        setColumns((prev) => prev.filter((c) => c.id !== col.id))
                      }
                      canRemove={columns.length > 1}
                    />
                  ))}
                </div>
              </SortableContext>
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
            <Link href="/uploader/template">
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
