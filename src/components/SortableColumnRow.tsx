"use client";

import React, { useRef, useEffect } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, SlidersHorizontal, Trash2 } from "lucide-react";
import { getColumnRuleSummary } from "@/lib/copy";
import type { ColumnRule } from "@/lib/templates/schema";

export type RuleType = "text" | "digits" | "integer" | "decimal" | "date" | "list";

export interface SortableColumnItemData {
  id: string;
  name: string;
  required: boolean;
  type: RuleType;
  rule: ColumnRule;
  isExpanded: boolean;
  renamed?: boolean;
  originalName?: string;
}

export const defaultRulesByType: Record<RuleType, ColumnRule> = {
  text: { type: "text" },
  digits: { type: "digits", length: 9 },
  integer: { type: "integer" },
  decimal: {
    type: "decimal",
    allowComma: true,
    allowDot: true,
    allowScientific: true,
  },
  date: { type: "date", format: "yyyy-MM-dd" },
  list: { type: "list", values: ["Aktif", "Nonaktif"] },
};

const typeLabels: { type: RuleType; label: string; desc: string }[] = [
  {
    type: "text",
    label: "Teks bebas",
    desc: "Teks bebas: isi dapat berupa huruf, kata, atau kalimat umum.",
  },
  {
    type: "digits",
    label: "Kode angka",
    desc: "Kode angka: isi harus angka dengan jumlah digit tetap, seperti 921000006.",
  },
  {
    type: "integer",
    label: "Bilangan bulat",
    desc: "Bilangan bulat: angka utuh tanpa koma atau pecahan, dapat dibatasi minimum dan maksimum.",
  },
  {
    type: "decimal",
    label: "Angka desimal",
    desc: "Angka desimal: angka dengan pemisah koma atau titik, dapat mengizinkan notasi ilmiah.",
  },
  {
    type: "date",
    label: "Tanggal",
    desc: "Tanggal: format kalender baku yang harus dipatuhi berkas, seperti yyyy-MM-dd.",
  },
  {
    type: "list",
    label: "Pilihan dari daftar",
    desc: "Pilihan dari daftar: hanya menerima salah satu nilai yang sudah ditentukan.",
  },
];

interface SortableColumnRowProps {
  col: SortableColumnItemData;
  index: number;
  total: number;
  isDuplicate?: boolean;
  isInvalidName?: boolean;
  onUpdate: (patch: Partial<SortableColumnItemData>) => void;
  onUpdateRule: (patch: Partial<ColumnRule>) => void;
  onRemove: () => void;
}

export function SortableColumnRow({
  col,
  index,
  total,
  isDuplicate,
  isInvalidName,
  onUpdate,
  onUpdateRule,
  onRemove,
}: SortableColumnRowProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const aturanBtnRef = useRef<HTMLButtonElement>(null);
  const firstPanelButtonRef = useRef<HTMLButtonElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: col.id,
    data: {
      name: col.name,
      index,
      total,
    },
  });

  useEffect(() => {
    if (col.isExpanded) {
      const timer = setTimeout(() => {
        if (firstPanelButtonRef.current) {
          firstPanelButtonRef.current.focus();
        } else if (panelRef.current) {
          const focusable = panelRef.current.querySelector<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          focusable?.focus();
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [col.isExpanded]);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition || undefined,
  };

  const handleTypeChange = (newType: RuleType) => {
    onUpdate({
      type: newType,
      rule: { ...defaultRulesByType[newType] },
    });
  };

  const handlePanelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onUpdate({ isExpanded: false });
      aturanBtnRef.current?.focus();
    }
  };

  const handleClosePanel = () => {
    onUpdate({ isExpanded: false });
    aturanBtnRef.current?.focus();
  };

  const errorMessage = !col.name.trim()
    ? "Nama kolom tidak boleh kosong"
    : isDuplicate
    ? "Nama kolom sudah dipakai"
    : isInvalidName
    ? "Gunakan huruf, angka, dan garis bawah (_), tanpa spasi"
    : null;

  const summary = getColumnRuleSummary(col.rule, col.required);
  const currentTypeInfo = typeLabels.find((t) => t.type === col.type) || typeLabels[0];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border rounded-xl bg-white relative transition-all motion-reduce:transition-none duration-200 ${
        isDragging
          ? "opacity-30 border-indigo-400 shadow-md ring-2 ring-indigo-500 z-10"
          : errorMessage
          ? "border-rose-300 bg-rose-50/20 hover:border-rose-400"
          : "border-zinc-200 hover:border-zinc-300 shadow-xs"
      }`}
    >
      <div className="p-4 grid grid-cols-1 sm:grid-cols-[44px_28px_minmax(0,1fr)_auto_auto] items-center gap-3">
        {/* Kolom 1: Handle */}
        <div className="flex items-center justify-center">
          <button
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            {...listeners}
            style={{ touchAction: "none" }}
            aria-label={`Geser untuk mengubah urutan kolom ${col.name || `#${index + 1}`}`}
            title="Tekan Spasi, lalu panah untuk memindah"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 active:text-indigo-700 active:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-600 rounded-lg cursor-grab active:cursor-grabbing transition-colors"
          >
            <GripVertical className="w-5 h-5" />
          </button>
        </div>

        {/* Kolom 2: Nomor urut (plain muted text, no gray tile) */}
        <div className="text-sm font-mono text-zinc-400 text-center select-none">
          #{index + 1}
        </div>

        {/* Kolom 3: Nama kolom & summary line */}
        <div className="min-w-0">
          <input
            type="text"
            value={col.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            aria-label="Nama kolom"
            placeholder="Nama kolom, misalnya kode_material"
            aria-invalid={Boolean(errorMessage)}
            aria-describedby={`${col.id}-error`}
            className={`w-full min-h-[44px] h-11 px-3 text-base bg-white border rounded-lg focus:outline-none focus:ring-2 font-mono transition-shadow placeholder:text-zinc-400 ${
              errorMessage
                ? "border-rose-400 focus:ring-rose-500"
                : "border-zinc-200 focus:ring-indigo-600"
            }`}
          />
          {errorMessage ? (
            <p id={`${col.id}-error`} className="text-sm text-rose-600 mt-1">
              {errorMessage}
            </p>
          ) : summary.isIncomplete ? (
            <p className="text-sm text-amber-600 font-medium mt-1">
              {summary.text}
            </p>
          ) : (
            <p className="text-sm text-zinc-500 mt-1 truncate">
              {summary.text}
            </p>
          )}
          {col.renamed && col.originalName && !errorMessage && (
            <p className="text-sm text-amber-600 mt-0.5">
              Disesuaikan dari: <span className="font-mono">{col.originalName}</span>
            </p>
          )}
        </div>

        {/* Kolom 4: Tombol Aturan */}
        <div className="flex justify-end">
          <button
            ref={aturanBtnRef}
            type="button"
            onClick={() => onUpdate({ isExpanded: !col.isExpanded })}
            aria-expanded={col.isExpanded}
            aria-controls={`${col.id}-panel`}
            title="Atur aturan pengisian kolom ini"
            className={`min-h-[44px] px-4 rounded-lg flex items-center gap-2 text-base font-medium border whitespace-nowrap transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-600 relative ${
              col.isExpanded
                ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                : "bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900"
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Aturan</span>
            {summary.isIncomplete && (
              <span
                className="w-2 h-2 rounded-full bg-amber-500 absolute top-2 right-2 ring-2 ring-white"
                title="Aturan belum lengkap"
              />
            )}
          </button>
        </div>

        {/* Kolom 5: Tombol Hapus */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Hapus kolom ${col.name || `#${index + 1}`}`}
            title={`Hapus kolom ${col.name || `#${index + 1}`}`}
            className="min-h-[44px] min-w-[44px] px-2.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-rose-500 transition-colors"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Aturan Panel (Open state) */}
      {col.isExpanded && (
        <div
          id={`${col.id}-panel`}
          ref={panelRef}
          onKeyDown={handlePanelKeyDown}
          className="p-5 bg-zinc-50 border-t border-zinc-200 text-base space-y-6 rounded-b-xl transition-all duration-[180ms] motion-reduce:transition-none"
        >
          {/* Section 1: Jenis isi */}
          <div className="space-y-2">
            <span className="block text-base font-medium text-zinc-900">
              Jenis isi
            </span>
            <div className="flex flex-wrap gap-2">
              {typeLabels.map((t, idx) => {
                const isSelected = col.type === t.type;
                return (
                  <button
                    key={t.type}
                    ref={idx === 0 ? firstPanelButtonRef : undefined}
                    type="button"
                    onClick={() => handleTypeChange(t.type)}
                    className={`min-h-[44px] px-4 py-2 rounded-lg text-base font-medium border transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-600 cursor-pointer ${
                      isSelected
                        ? "bg-indigo-600 border-indigo-600 text-white shadow-xs"
                        : "bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
            <p className="text-sm text-zinc-500 mt-1">
              {currentTypeInfo.desc}
            </p>
          </div>

          {/* Section 2: Wajib diisi (Switch) */}
          <div className="space-y-1.5 pt-2 border-t border-zinc-200/60">
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={col.required}
                onClick={() => onUpdate({ required: !col.required })}
                className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 ${
                  col.required ? "bg-indigo-600" : "bg-zinc-300"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    col.required ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
              <span
                onClick={() => onUpdate({ required: !col.required })}
                className="text-base font-medium text-zinc-900 cursor-pointer select-none"
              >
                Wajib diisi
              </span>
            </div>
            <p className="text-sm text-zinc-500">
              {col.required
                ? "Kolom ini tidak boleh kosong di file."
                : "Kolom ini boleh dikosongkan."}
            </p>
          </div>

          {/* Section 3: Aturan pengisian */}
          <div className="space-y-4 pt-2 border-t border-zinc-200/60">
            <span className="block text-base font-medium text-zinc-900">
              Aturan pengisian
            </span>

            {col.type === "digits" && (
              <div className="space-y-1.5 max-w-sm">
                <label className="block text-sm font-medium text-zinc-700">
                  Jumlah Digit Tetap
                </label>
                <input
                  type="number"
                  min="1"
                  max="64"
                  value={(col.rule as { length?: number }).length || ""}
                  onChange={(e) => {
                    const val = e.target.value === "" ? 0 : Number(e.target.value);
                    onUpdateRule({ length: val });
                  }}
                  className="w-full min-h-[44px] h-11 px-3 bg-white border border-zinc-200 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
                <p className="text-sm text-zinc-500">
                  Contoh: 9 (isi kolom harus berupa angka tepat 9 digit, seperti 921000006).
                </p>
                {(!(col.rule as { length?: number }).length ||
                  (col.rule as { length?: number }).length! <= 0) && (
                  <p className="text-sm text-rose-600">
                    Jumlah digit harus berupa angka lebih dari 0.
                  </p>
                )}
              </div>
            )}

            {col.type === "integer" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-zinc-700">
                    Nilai minimum (opsional)
                  </label>
                  <input
                    type="number"
                    value={(col.rule as { min?: number }).min ?? ""}
                    onChange={(e) =>
                      onUpdateRule({
                        min: e.target.value === "" ? undefined : Number(e.target.value),
                      })
                    }
                    placeholder="Contoh: 1"
                    className="w-full min-h-[44px] h-11 px-3 bg-white border border-zinc-200 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                  <p className="text-sm text-zinc-500">
                    Batas terkecil angka yang diterima.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-zinc-700">
                    Nilai maksimum (opsional)
                  </label>
                  <input
                    type="number"
                    value={(col.rule as { max?: number }).max ?? ""}
                    onChange={(e) =>
                      onUpdateRule({
                        max: e.target.value === "" ? undefined : Number(e.target.value),
                      })
                    }
                    placeholder="Contoh: 1000"
                    className="w-full min-h-[44px] h-11 px-3 bg-white border border-zinc-200 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                  <p className="text-sm text-zinc-500">
                    Batas terbesar angka yang diterima.
                  </p>
                </div>
                {(col.rule as { min?: number }).min !== undefined &&
                  (col.rule as { max?: number }).max !== undefined &&
                  (col.rule as { min?: number }).min! > (col.rule as { max?: number }).max! && (
                    <p className="text-sm text-rose-600 sm:col-span-2">
                      Nilai minimum tidak boleh lebih besar dari nilai maksimum.
                    </p>
                  )}
              </div>
            )}

            {col.type === "decimal" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-zinc-700">
                      Nilai minimum (opsional)
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={(col.rule as { min?: number }).min ?? ""}
                      onChange={(e) =>
                        onUpdateRule({
                          min: e.target.value === "" ? undefined : Number(e.target.value),
                        })
                      }
                      placeholder="Contoh: 0.01"
                      className="w-full min-h-[44px] h-11 px-3 bg-white border border-zinc-200 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-zinc-700">
                      Nilai maksimum (opsional)
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={(col.rule as { max?: number }).max ?? ""}
                      onChange={(e) =>
                        onUpdateRule({
                          max: e.target.value === "" ? undefined : Number(e.target.value),
                        })
                      }
                      placeholder="Contoh: 9999.99"
                      className="w-full min-h-[44px] h-11 px-3 bg-white border border-zinc-200 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    />
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <span className="block text-sm font-medium text-zinc-700">
                    Format desimal yang diperbolehkan
                  </span>
                  <div className="flex flex-wrap gap-4">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={(col.rule as { allowComma?: boolean }).allowComma ?? true}
                        onClick={() =>
                          onUpdateRule({
                            allowComma: !((col.rule as { allowComma?: boolean }).allowComma ?? true),
                          })
                        }
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-600 ${
                          ((col.rule as { allowComma?: boolean }).allowComma ?? true)
                            ? "bg-indigo-600"
                            : "bg-zinc-300"
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
                            ((col.rule as { allowComma?: boolean }).allowComma ?? true)
                              ? "translate-x-5"
                              : "translate-x-0"
                          }`}
                        />
                      </button>
                      <span className="text-base text-zinc-700">Koma (contoh: 12,5)</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={(col.rule as { allowDot?: boolean }).allowDot ?? true}
                        onClick={() =>
                          onUpdateRule({
                            allowDot: !((col.rule as { allowDot?: boolean }).allowDot ?? true),
                          })
                        }
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-600 ${
                          ((col.rule as { allowDot?: boolean }).allowDot ?? true)
                            ? "bg-indigo-600"
                            : "bg-zinc-300"
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
                            ((col.rule as { allowDot?: boolean }).allowDot ?? true)
                              ? "translate-x-5"
                              : "translate-x-0"
                          }`}
                        />
                      </button>
                      <span className="text-base text-zinc-700">Titik (contoh: 12.5)</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={(col.rule as { allowScientific?: boolean }).allowScientific ?? true}
                        onClick={() =>
                          onUpdateRule({
                            allowScientific: !(
                              (col.rule as { allowScientific?: boolean }).allowScientific ?? true
                            ),
                          })
                        }
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-600 ${
                          ((col.rule as { allowScientific?: boolean }).allowScientific ?? true)
                            ? "bg-indigo-600"
                            : "bg-zinc-300"
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
                            ((col.rule as { allowScientific?: boolean }).allowScientific ?? true)
                              ? "translate-x-5"
                              : "translate-x-0"
                          }`}
                        />
                      </button>
                      <span className="text-base text-zinc-700">Notasi ilmiah (contoh: 1.2e3)</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5 pt-2">
                  <label className="block text-sm font-medium text-zinc-700">
                    Teks khusus yang diizinkan (opsional)
                  </label>
                  <input
                    type="text"
                    value={((col.rule as { allowedText?: string[] }).allowedText || []).join(", ")}
                    onChange={(e) =>
                      onUpdateRule({
                        allowedText: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="Contoh: N/A, Kosong, -"
                    className="w-full min-h-[44px] h-11 px-3 bg-white border border-zinc-200 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                  <p className="text-sm text-zinc-500">
                    Pisahkan dengan koma jika ada teks non-angka yang sah diterima di kolom ini.
                  </p>
                </div>
              </div>
            )}

            {col.type === "date" && (
              <div className="space-y-1.5 max-w-sm">
                <label className="block text-sm font-medium text-zinc-700">
                  Format Tanggal
                </label>
                <select
                  value={(col.rule as { format?: string }).format || "yyyy-MM-dd"}
                  onChange={(e) =>
                    onUpdateRule({
                      format: e.target.value as "yyyy-MM-dd" | "dd/MM/yyyy" | "MM/dd/yyyy" | "dd-MM-yyyy" | "yyyy/MM/dd",
                    })
                  }
                  className="w-full min-h-[44px] h-11 px-3 bg-white border border-zinc-200 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-indigo-600 font-mono"
                >
                  <option value="yyyy-MM-dd">yyyy-MM-dd (contoh: 2026-10-25)</option>
                  <option value="dd/MM/yyyy">dd/MM/yyyy (contoh: 25/10/2026)</option>
                  <option value="MM/dd/yyyy">MM/dd/yyyy (contoh: 10/25/2026)</option>
                  <option value="dd-MM-yyyy">dd-MM-yyyy (contoh: 25-10-2026)</option>
                  <option value="yyyy/MM/dd">yyyy/MM/dd (contoh: 2026/10/25)</option>
                </select>
                <p className="text-sm text-zinc-500">
                  Pastikan format sesuai dengan penulisan tanggal dalam file CSV Anda.
                </p>
              </div>
            )}

            {col.type === "list" && (
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-zinc-700">
                  Daftar Pilihan (satu per baris)
                </label>
                <textarea
                  rows={4}
                  value={((col.rule as { values?: string[] }).values || []).join("\n")}
                  onChange={(e) =>
                    onUpdateRule({
                      values: e.target.value
                        .split("\n")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder={"Aktif\nNonaktif\nTertunda"}
                  className="w-full p-3 bg-white border border-zinc-200 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
                <p className="text-sm text-zinc-500">
                  Tuliskan setiap nilai pilihan yang sah pada baris baru.
                </p>
                {(!col.rule ||
                  !(col.rule as { values?: string[] }).values ||
                  (col.rule as { values?: string[] }).values!.length === 0) && (
                  <p className="text-sm text-rose-600">
                    Daftar pilihan tidak boleh kosong.
                  </p>
                )}
              </div>
            )}

            {col.type === "text" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-zinc-700">
                      Panjang karakter minimum (opsional)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={(col.rule as { minLength?: number }).minLength ?? ""}
                      onChange={(e) =>
                        onUpdateRule({
                          minLength: e.target.value === "" ? undefined : Number(e.target.value),
                        })
                      }
                      placeholder="Contoh: 3"
                      className="w-full min-h-[44px] h-11 px-3 bg-white border border-zinc-200 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-zinc-700">
                      Panjang karakter maksimum (opsional)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={(col.rule as { maxLength?: number }).maxLength ?? ""}
                      onChange={(e) =>
                        onUpdateRule({
                          maxLength: e.target.value === "" ? undefined : Number(e.target.value),
                        })
                      }
                      placeholder="Contoh: 100"
                      className="w-full min-h-[44px] h-11 px-3 bg-white border border-zinc-200 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-zinc-700">
                    Nilai teks yang diizinkan saja (opsional)
                  </label>
                  <input
                    type="text"
                    value={((col.rule as { allowedValues?: string[] }).allowedValues || []).join(", ")}
                    onChange={(e) =>
                      onUpdateRule({
                        allowedValues: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="Contoh: Ya, Tidak, Mungkin"
                    className="w-full min-h-[44px] h-11 px-3 bg-white border border-zinc-200 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                  <p className="text-sm text-zinc-500">
                    Pisahkan dengan koma jika kolom ini hanya menerima kata-kata tertentu.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Tombol Selesai (bawah kanan panel) */}
          <div className="flex justify-end pt-3 border-t border-zinc-200/60">
            <button
              type="button"
              onClick={handleClosePanel}
              className="min-h-[44px] px-5 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-base font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-600 shadow-xs cursor-pointer"
            >
              Selesai
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function DragOverlayColumnRow({ col }: { col: SortableColumnItemData }) {
  const summary = getColumnRuleSummary(col.rule, col.required);

  return (
    <div className="border border-indigo-500 rounded-xl bg-white shadow-md p-4 flex items-center gap-3 opacity-95 transform scale-[1.01] motion-reduce:transform-none">
      <GripVertical className="w-5 h-5 text-indigo-600 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-base font-mono text-zinc-900 font-semibold truncate block">
          {col.name || "Kolom"}
        </span>
        <span className="text-sm text-zinc-500 truncate block">
          {summary.text}
        </span>
      </div>
      <span className="text-sm px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 font-medium ml-auto shrink-0">
        {col.required ? "Wajib" : "Boleh kosong"}
      </span>
    </div>
  );
}
