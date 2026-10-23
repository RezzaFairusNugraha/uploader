"use client";

import { useEffect, useState, use, Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
} from "lucide-react";
import Button from "@/components/Button";
import Callout from "@/components/Callout";
import Field from "@/components/Field";
import PageHeader from "@/components/PageHeader";
import { notify } from "@/lib/notify";
import {
  columnNameRegex,
  type ColumnDefinition,
  type ColumnRule,
  type TemplateDefinition,
  type TemplateDelimiter,
} from "@/lib/templates/schema";

type RuleType = "text" | "integer" | "digits" | "decimal" | "date" | "list";

interface ColumnDraft {
  id: string;
  name: string;
  required: boolean;
  type: RuleType;
  rule: ColumnRule;
  isExpanded: boolean;
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

export default function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="py-12 text-center text-sm text-zinc-500">
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

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [delimiter, setDelimiter] = useState<TemplateDelimiter>(";");
  const [columns, setColumns] = useState<ColumnDraft[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
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
          data.columns.map((c, idx) => ({
            id: `col-${idx}-${Date.now()}`,
            name: c.name,
            required: c.required,
            type: c.rule.type as RuleType,
            rule: c.rule,
            isExpanded: false,
          }))
        );
      })
      .catch(() => {
        notify.error("Gagal memuat template");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  const columnNames = columns.map((c) => c.name.trim());
  const duplicateNames = new Set(
    columnNames.filter((item, index) => item && columnNames.indexOf(item) !== index)
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

  const removeColumn = (colId: string) => {
    setColumns((prev) => prev.filter((c) => c.id !== colId));
  };

  const moveColumn = (index: number, direction: "up" | "down") => {
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= columns.length) return;
    const updated = [...columns];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIdx, 0, moved);
    setColumns(updated);
  };

  const updateColumn = (colId: string, patch: Partial<ColumnDraft>) => {
    setColumns((prev) =>
      prev.map((c) => {
        if (c.id !== colId) return c;
        const updated = { ...c, ...patch };
        if (patch.type && patch.type !== c.type) {
          updated.rule = { ...defaultRules[patch.type] };
        }
        return updated;
      })
    );
  };

  const updateColumnRule = (colId: string, patchRule: Partial<ColumnRule>) => {
    setColumns((prev) =>
      prev.map((c) => {
        if (c.id !== colId) return c;
        return {
          ...c,
          rule: { ...c.rule, ...patchRule } as ColumnRule,
        };
      })
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

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
        notify.error(`Nama kolom '${c.name}' tidak valid`);
        return;
      }
    }

    setIsSaving(true);

    const formattedColumns: ColumnDefinition[] = columns.map((c) => ({
      name: c.name.trim(),
      required: c.required,
      rule: c.rule,
    }));

    try {
      const res = await fetch(`/api/templates/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          delimiter,
          columns: formattedColumns,
        }),
      });

      const updated = await res.json();
      if (!res.ok) {
        throw new Error(updated.error || "Gagal memperbarui template");
      }

      notify.success("Perubahan template disimpan");
      setTimeout(() => {
        router.push("/template");
      }, 1000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan";
      notify.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-12 text-center text-sm text-zinc-500">
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

  const volumePath = `/Volumes/${template.volume.catalog}/${template.volume.schema}/${template.volume.name}`;

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Edit Template: ${template.name}`}
        description={`Versi ${template.version} • Terdaftar di Unity Catalog.`}
      />

      <Callout type="warning" title="Peringatan Perubahan Definisi">
        Berkas yang sudah diunggah sebelumnya tidak akan divalidasi ulang secara
        otomatis. Perubahan nama atau aturan kolom dapat mempengaruhi pipeline
        pemrosesan data Databricks yang bergantung pada template ini.
      </Callout>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-900 border-b border-zinc-100 pb-3">
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

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">
              Slug & Lokasi Volume (Read-only)
            </label>
            <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-mono text-zinc-600 space-y-1">
              <div>Slug: {template.slug}</div>
              <div>Path: {volumePath}</div>
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">
              Slug dan lokasi volume tidak dapat diubah setelah volume dibuat di Unity Catalog.
            </p>
          </div>

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
              className="w-full px-3 py-2 text-sm bg-white text-zinc-900 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 transition"
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
                Perbarui struktur kolom dan aturan validasi.
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
            {columns.map((col, idx) => (
              <div
                key={col.id}
                className="border border-zinc-200 bg-white rounded-lg transition-all"
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
                      className="w-full h-9 px-2.5 text-xs font-mono bg-white border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-600"
                    />
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
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === columns.length - 1}
                      onClick={() => moveColumn(idx, "down")}
                      className="p-1.5 text-zinc-400 hover:text-zinc-700 disabled:opacity-30 rounded hover:bg-zinc-100"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeColumn(col.id)}
                      className="p-1.5 text-zinc-400 hover:text-rose-600 rounded hover:bg-rose-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {col.isExpanded && (
                  <div className="p-4 bg-zinc-50/70 border-t border-zinc-200 text-xs space-y-3">
                    {col.type === "digits" && (
                      <div className="flex items-center gap-3">
                        <span className="text-zinc-700">Panjang digit:</span>
                        <input
                          type="number"
                          min="1"
                          max="64"
                          value={(col.rule as { length?: number }).length || 9}
                          onChange={(e) =>
                            updateColumnRule(col.id, {
                              length: Number(e.target.value),
                            })
                          }
                          className="w-20 h-8 px-2 bg-white border border-zinc-200 rounded text-xs"
                        />
                      </div>
                    )}

                    {col.type === "decimal" && (
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-4">
                          <label className="flex items-center gap-1.5 text-zinc-700">
                            <input
                              type="checkbox"
                              checked={(col.rule as { allowComma?: boolean }).allowComma ?? true}
                              onChange={(e) =>
                                updateColumnRule(col.id, {
                                  allowComma: e.target.checked,
                                })
                              }
                            />
                            Boleh koma (,)
                          </label>
                          <label className="flex items-center gap-1.5 text-zinc-700">
                            <input
                              type="checkbox"
                              checked={(col.rule as { allowDot?: boolean }).allowDot ?? true}
                              onChange={(e) =>
                                updateColumnRule(col.id, {
                                  allowDot: e.target.checked,
                                })
                              }
                            />
                            Boleh titik (.)
                          </label>
                          <label className="flex items-center gap-1.5 text-zinc-700">
                            <input
                              type="checkbox"
                              checked={(col.rule as { allowScientific?: boolean }).allowScientific ?? true}
                              onChange={(e) =>
                                updateColumnRule(col.id, {
                                  allowScientific: e.target.checked,
                                })
                              }
                            />
                            Boleh notasi ilmiah
                          </label>
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <span className="text-zinc-700">Teks khusus:</span>
                          <input
                            type="text"
                            value={
                              ((col.rule as { allowedText?: string[] }).allowedText || []).join(
                                ", "
                              )
                            }
                            onChange={(e) => {
                              const vals = e.target.value
                                .split(",")
                                .map((s) => s.trim())
                                .filter(Boolean);
                              updateColumnRule(col.id, { allowedText: vals });
                            }}
                            className="flex-1 h-8 px-2 bg-white border border-zinc-200 rounded text-xs"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

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
