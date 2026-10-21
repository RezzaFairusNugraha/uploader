"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Download } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import {
  formatRuleDescription,
  getAllTemplates,
  type TemplateConfig,
} from "@/lib/templates";

export default function TemplatePage() {
  const templates = getAllTemplates();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div>
      <PageHeader
        title="Template CSV"
        description="Unduh acuan format CSV dan pelajari aturan kolom sebelum mengunggah berkas data."
      />

      <div className="space-y-4">
        {templates.map((tpl: TemplateConfig) => {
          const hasColumns = tpl.columns.length > 0;
          const isExpanded = expandedId === tpl.id;

          return (
            <div
              key={tpl.id}
              className="bg-white border border-zinc-200 rounded-xl p-5 sm:p-6 transition-all"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h2 className="text-base font-semibold text-zinc-900">
                      {tpl.name}
                    </h2>
                    <span className="text-xs font-medium text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-md">
                      {hasColumns
                        ? `${tpl.columns.length} kolom`
                        : "CSV / Parquet"}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-600 leading-normal">
                    {tpl.description}
                  </p>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  {hasColumns ? (
                    <>
                      <a
                        href={`/api/templates/${tpl.id}`}
                        download={`${tpl.id}.csv`}
                        className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg text-xs font-medium transition-colors bg-white text-zinc-900 border border-zinc-200 hover:bg-zinc-50 active:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 shadow-xs"
                      >
                        <Download className="w-3.5 h-3.5 text-zinc-600" />
                        Unduh template
                      </a>
                    </>
                  ) : (
                    <span className="text-xs text-zinc-500 italic py-1.5">
                      Belum ada template, unggah file Parquet atau CSV langsung
                    </span>
                  )}
                </div>
              </div>

              {hasColumns ? (
                <div className="mt-4 pt-3 border-t border-zinc-100">
                  <button
                    type="button"
                    onClick={() => toggleExpand(tpl.id)}
                    className="text-xs font-medium text-zinc-600 hover:text-zinc-900 inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 rounded-sm cursor-pointer"
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp className="w-3.5 h-3.5 text-zinc-500" />
                        Sembunyikan aturan kolom
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                        Lihat aturan kolom ({tpl.columns.length})
                      </>
                    )}
                  </button>

                  {isExpanded ? (
                    <div className="mt-3 overflow-x-auto border border-zinc-200 rounded-lg">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-700 font-medium">
                          <tr>
                            <th className="px-3.5 py-2">Nama Kolom</th>
                            <th className="px-3.5 py-2">Label</th>
                            <th className="px-3.5 py-2">Keharusan</th>
                            <th className="px-3.5 py-2">Aturan Validasi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 bg-white">
                          {tpl.columns.map((col) => (
                            <tr key={col.name} className="hover:bg-zinc-50/50">
                              <td className="px-3.5 py-2 font-mono text-zinc-900 font-medium">
                                {col.name}
                              </td>
                              <td className="px-3.5 py-2 text-zinc-700">
                                {col.label}
                              </td>
                              <td className="px-3.5 py-2">
                                <span
                                  className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-medium ${
                                    col.required
                                      ? "bg-zinc-100 text-zinc-800"
                                      : "bg-zinc-50 text-zinc-500"
                                  }`}
                                >
                                  {col.required ? "Wajib" : "Opsional"}
                                </span>
                              </td>
                              <td className="px-3.5 py-2 text-zinc-600">
                                {formatRuleDescription(col.rule)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
