"use client";

import { useEffect, useState, use, Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
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
import { diffTemplates } from "@/lib/templates/diff";
import {
  columnNameRegex,
  type ColumnDefinition,
  type ColumnRule,
  type TemplateDefinition,
  type TemplateDelimiter,
} from "@/lib/templates/schema";
import { arrayMove, generateStableColumnId } from "@/lib/templates/sortable";
import { sortableAccessibility } from "@/lib/templates/sortableAccessibility";
import type { TemplateVersionItem } from "@/lib/templates/versions";

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

function formatDate(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return d.toLocaleString("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return isoStr;
  }
}

export default function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="py-12 text-center text-base text-zinc-500">
          Memuat halaman edit...
        </div>
      }
    >
      <EditTemplateForm params={params} />
    </Suspense>
  );
}

function EditTemplateForm({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { id } = use(params);

  const [isLoading, setIsLoading] = useState(true);
  const [template, setTemplate] = useState<TemplateDefinition | null>(null);
  const [versions, setVersions] = useState<TemplateVersionItem[]>([]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [delimiter, setDelimiter] = useState<TemplateDelimiter>(";");
  const [changedBy, setChangedBy] = useState("");
  const [columns, setColumns] = useState<ColumnDraft[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const [breakingDiff, setBreakingDiff] = useState<{
    changes: string[];
    isBreaking: boolean;
    summary: string;
  } | null>(null);
  const [confirmedBreaking, setConfirmedBreaking] = useState(false);
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
    const savedName = localStorage.getItem("uploader_user_name");
    if (savedName) {
      setChangedBy(savedName);
    }

    let active = true;

    fetch(`/api/templates/${id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: TemplateDefinition | null) => {
        if (!active || !data) return;
        setTemplate(data);
        setName(data.name);
        setDescription(data.description || "");
        setDelimiter(data.delimiter);
        setColumns(
          data.columns.map((c) => ({
            id: generateStableColumnId(),
            name: c.name,
            required: c.required,
            type: c.rule.type as RuleType,
            rule: c.rule,
            isExpanded: false,
          }))
        );
      })
      .catch(() => {})
      .finally(() => {
        if (active) setIsLoading(false);
      });

    fetch(`/api/templates/${id}/versions`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data?.items) {
          setVersions(data.items);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [id]);

  const addColumn = () => {
    const newDraft: ColumnDraft = {
      id: generateStableColumnId(),
      name: `kolom_${columns.length + 1}`,
      required: true,
      type: "text",
      rule: { type: "text" },
      isExpanded: true,
    };
    setColumns([...columns, newDraft]);
  };

  const removeColumn = (colId: string) => {
    if (columns.length <= 1) {
      notify.error("Template harus memiliki minimal 1 kolom");
      return;
    }
    setColumns(columns.filter((c) => c.id !== colId));
  };

  const updateColumn = (colId: string, patch: Partial<ColumnDraft>) => {
    setColumns(
      columns.map((c) => {
        if (c.id !== colId) return c;
        const updated = { ...c, ...patch };
        if (patch.type && patch.type !== c.type) {
          updated.rule = { ...defaultRules[patch.type] };
        }
        return updated;
      })
    );
  };

  const updateColumnRule = (colId: string, rulePatch: Partial<ColumnRule>) => {
    setColumns(
      columns.map((c) => {
        if (c.id !== colId) return c;
        return {
          ...c,
          rule: { ...c.rule, ...rulePatch } as ColumnRule,
        };
      })
    );
  };

  const moveColumn = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= columns.length) return;
    const nextCols = [...columns];
    const [moved] = nextCols.splice(index, 1);
    nextCols.splice(targetIndex, 0, moved);
    setColumns(nextCols);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!template) return;

    if (!name.trim()) {
      notify.error("Nama template wajib diisi");
      return;
    }

    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      if (!col.name.trim()) {
        notify.error(`Kolom #${i + 1} belum memiliki nama`);
        return;
      }
      if (!columnNameRegex.test(col.name.trim())) {
        notify.error(
          `Nama kolom '${col.name}' tidak valid. Gunakan huruf, angka, atau underscore`
        );
        return;
      }
    }

    const formattedColumns: ColumnDefinition[] = columns.map((c) => ({
      name: c.name.trim(),
      required: c.required,
      rule: c.rule,
    }));

    const nextTpl: TemplateDefinition = {
      ...template,
      name: name.trim(),
      description: description.trim(),
      delimiter,
      columns: formattedColumns,
    };

    const diff = diffTemplates(template, nextTpl);
    if (diff.isBreaking && !confirmedBreaking) {
      setBreakingDiff(diff);
      return;
    }

    setIsSaving(true);
    if (changedBy.trim()) {
      localStorage.setItem("uploader_user_name", changedBy.trim());
    }

    try {
      const res = await fetch(`/api/templates/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          delimiter,
          columns: formattedColumns,
          changedBy: changedBy.trim() || undefined,
        }),
      });

      const updated = await res.json();
      if (!res.ok) {
        throw new Error(updated.error || "Gagal memperbarui template");
      }

      notify.success("Perubahan template berhasil disimpan");
      setTimeout(() => {
        router.push("/template");
      }, 800);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan";
      notify.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-12 text-center text-base text-zinc-500">
        Memuat data template...
      </div>
    );
  }

  if (!template) {
    return (
      <div className="space-y-4">
        <PageHeader title="Template Tidak Ditemukan" description="" />
        <Link href="/template">
          <Button variant="secondary">Kembali ke daftar template</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8 text-base">
      <PageHeader
        title={`Ubah Template: ${template.name}`}
        description={`Versi ${template.version} • Terbuka untuk semua rekan kerja.`}
      />

      {breakingDiff && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-6 space-y-4">
          <div className="text-base font-semibold text-amber-950">
            Konfirmasi Perubahan Berdampak Besar
          </div>
          <p className="text-sm text-amber-900">
            Perubahan berikut dapat menyebabkan berkas data lama tidak lagi memenuhi aturan:
          </p>
          <ul className="list-disc list-inside text-sm text-amber-800 space-y-1">
            {breakingDiff.changes.map((ch, idx) => (
              <li key={idx}>{ch}</li>
            ))}
          </ul>
          <div className="pt-2 flex items-center gap-4">
            <button
              type="button"
              onClick={() => {
                setConfirmedBreaking(true);
                setBreakingDiff(null);
              }}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-semibold transition"
            >
              Saya paham dan lanjutkan
            </button>
            <button
              type="button"
              onClick={() => setBreakingDiff(null)}
              className="text-sm text-amber-900 underline"
            >
              Kembali periksa
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
          <h2 className="text-base font-semibold text-zinc-900 border-b border-zinc-100 pb-3">
            Informasi Template
          </h2>

          <Field
            id="template-name"
            label="Nama Template"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <Field
            id="template-changed-by"
            label="Nama Anda (Penyunting)"
            name="changedBy"
            value={changedBy}
            onChange={(e) => setChangedBy(e.target.value)}
            hint="Akan dicatat di riwayat perubahan template."
          />

          <div>
            <label
              htmlFor="template-description"
              className="block text-sm font-medium text-zinc-700 mb-1.5"
            >
              Deskripsi
            </label>
            <textarea
              id="template-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-base bg-white text-zinc-900 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 transition"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">
              Pemisah Kolom CSV
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

        {/* Kolom */}
        <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
            <div>
              <h2 className="text-base font-semibold text-zinc-900">
                Aturan Pengisian Kolom
              </h2>
              <p className="text-sm text-zinc-500 mt-0.5">
                Atur nama kolom dan kriteria pemeriksaan nilai.
              </p>
            </div>
            <Button type="button" variant="secondary" onClick={addColumn}>
              <Plus className="w-4 h-4 mr-1 inline" />
              Tambah kolom
            </Button>
          </div>

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
                {columns.map((col, idx) => (
                  <SortableColumnRow
                    key={col.id}
                    col={col}
                    index={idx}
                    total={columns.length}
                    onUpdate={(patch) => updateColumn(col.id, patch)}
                    onUpdateRule={(patch) => updateColumnRule(col.id, patch)}
                    onMove={(dir) => moveColumn(idx, dir)}
                    onRemove={() => removeColumn(col.id)}
                  />
                ))}
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

        {/* Riwayat Versi Template Ini */}
        {versions.length > 0 && (
          <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-3">
            <h2 className="text-base font-semibold text-zinc-900 border-b border-zinc-100 pb-2">
              Riwayat Versi Template Ini
            </h2>
            <div className="divide-y divide-zinc-100">
              {versions.map((ver) => (
                <div key={ver.id} className="py-2.5 flex items-center justify-between text-sm">
                  <div>
                    <span className="font-semibold text-zinc-800">Versi {ver.version}</span>
                    <span className="text-zinc-400 mx-2">•</span>
                    <span className="text-zinc-600">{ver.changeSummary}</span>
                  </div>
                  <div className="text-xs text-zinc-400">
                    Oleh {ver.changedBy} • {formatDate(ver.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <Link href="/template">
            <Button type="button" variant="ghost">
              Batal
            </Button>
          </Link>

          <Button type="submit" variant="primary" isLoading={isSaving}>
            Simpan perubahan
          </Button>
        </div>
      </form>
    </div>
  );
}
