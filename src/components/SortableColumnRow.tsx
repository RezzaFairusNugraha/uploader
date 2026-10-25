"use client";

import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Trash2,
} from "lucide-react";
import type { ColumnRule } from "@/lib/templates/schema";

export type RuleType = "text" | "integer" | "digits" | "decimal" | "date" | "list";

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

interface SortableColumnRowProps {
  col: SortableColumnItemData;
  index: number;
  total: number;
  isDuplicate?: boolean;
  isInvalidName?: boolean;
  onUpdate: (patch: Partial<SortableColumnItemData>) => void;
  onUpdateRule: (patch: Partial<ColumnRule>) => void;
  onMove: (direction: "up" | "down") => void;
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
  onMove,
  onRemove,
}: SortableColumnRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: col.id,
    data: {
      name: col.name,
      index,
    },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition || undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border rounded-lg bg-white relative transition-all motion-reduce:transition-none duration-200 ${
        isDragging
          ? "opacity-40 border-indigo-400 shadow-md ring-2 ring-indigo-500"
          : isDuplicate || isInvalidName
          ? "border-rose-300 bg-rose-50/20 hover:border-rose-400"
          : "border-zinc-200 hover:border-zinc-300"
      }`}
    >
      <div className="p-3.5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Pindahkan urutan kolom ${col.name || `#${index + 1}`}`}
          className="min-h-[44px] min-w-[32px] px-1 flex items-center justify-center text-zinc-400 hover:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-600 rounded-md cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="w-5 h-5" />
        </button>

        <span className="text-sm font-mono text-zinc-400 w-6">
          #{index + 1}
        </span>

        <div className="flex-1 min-w-44">
          <input
            type="text"
            value={col.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder="nama_kolom"
            className="w-full h-10 px-2.5 text-sm bg-white border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-600 font-mono"
          />
          {col.renamed && col.originalName && (
            <div className="text-[11px] text-amber-600 mt-1">
              Disesuaikan dari: <span className="font-mono">{col.originalName}</span>
            </div>
          )}
        </div>

        <div className="w-36">
          <select
            value={col.type}
            onChange={(e) => onUpdate({ type: e.target.value as RuleType })}
            className="w-full h-10 px-2 text-sm bg-white border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-600"
          >
            <option value="text">Teks</option>
            <option value="digits">Digit Angka</option>
            <option value="integer">Bilangan Bulat</option>
            <option value="decimal">Desimal</option>
            <option value="date">Tanggal</option>
            <option value="list">Daftar Pilihan</option>
          </select>
        </div>

        <div className="w-32">
          <select
            value={col.required ? "wajib" : "opsional"}
            onChange={(e) => onUpdate({ required: e.target.value === "wajib" })}
            className="w-full h-10 px-2 text-sm bg-white border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-600"
          >
            <option value="wajib">Wajib diisi</option>
            <option value="opsional">Boleh kosong</option>
          </select>
        </div>

        <div className="flex items-center gap-1 ml-auto">
          <button
            type="button"
            onClick={() => onUpdate({ isExpanded: !col.isExpanded })}
            className="min-h-[44px] min-w-[36px] px-2 text-zinc-500 hover:text-zinc-800 rounded hover:bg-zinc-100 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-indigo-600"
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
            disabled={index === 0}
            onClick={() => onMove("up")}
            className="min-h-[44px] min-w-[36px] px-2 text-zinc-400 hover:text-zinc-700 disabled:opacity-30 rounded hover:bg-zinc-100 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-indigo-600"
            title="Naik"
            aria-label={`Naikkan kolom ${col.name}`}
          >
            <ArrowUp className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={index === total - 1}
            onClick={() => onMove("down")}
            className="min-h-[44px] min-w-[36px] px-2 text-zinc-400 hover:text-zinc-700 disabled:opacity-30 rounded hover:bg-zinc-100 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-indigo-600"
            title="Turun"
            aria-label={`Turunkan kolom ${col.name}`}
          >
            <ArrowDown className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="min-h-[44px] min-w-[36px] px-2 text-zinc-400 hover:text-rose-600 rounded hover:bg-rose-50 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-rose-500"
            title="Hapus kolom"
            aria-label={`Hapus kolom ${col.name}`}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {col.isExpanded && (
        <div className="p-4 bg-zinc-50/70 border-t border-zinc-200 text-sm space-y-3">
          {col.type === "digits" && (
            <div className="flex items-center gap-3">
              <span className="text-zinc-700 font-medium">Panjang digit:</span>
              <input
                type="number"
                min="1"
                max="64"
                value={(col.rule as { length?: number }).length || 9}
                onChange={(e) =>
                  onUpdateRule({
                    length: Number(e.target.value),
                  })
                }
                className="w-20 h-9 px-2 bg-white border border-zinc-200 rounded text-sm"
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
                      onUpdateRule({
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
                      onUpdateRule({
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
                      onUpdateRule({
                        allowScientific: e.target.checked,
                      })
                    }
                  />
                  Boleh notasi ilmiah
                </label>
              </div>
            </div>
          )}

          {col.type === "list" && (
            <div className="space-y-1">
              <span className="text-zinc-700 font-medium">Pilihan nilai (pisahkan dengan koma):</span>
              <input
                type="text"
                value={((col.rule as { values?: string[] }).values || []).join(", ")}
                onChange={(e) =>
                  onUpdateRule({
                    values: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  })
                }
                className="w-full h-9 px-2.5 bg-white border border-zinc-200 rounded text-sm"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DragOverlayColumnRow({ col }: { col: SortableColumnItemData }) {
  return (
    <div className="border border-indigo-500 rounded-lg bg-white shadow-lg p-3.5 flex items-center gap-3 opacity-95">
      <GripVertical className="w-5 h-5 text-indigo-600" />
      <span className="text-sm font-mono text-zinc-900 font-semibold">
        {col.name || "Kolom"}
      </span>
      <span className="text-xs px-2 py-0.5 rounded bg-zinc-100 text-zinc-600 uppercase">
        {col.type}
      </span>
      <span className="text-xs px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-medium ml-auto">
        {col.required ? "Wajib" : "Boleh kosong"}
      </span>
    </div>
  );
}
