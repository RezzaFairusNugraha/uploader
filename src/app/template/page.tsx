"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Archive, Download, Plus } from "lucide-react";
import Button from "@/components/Button";
import PageHeader from "@/components/PageHeader";
import { notify } from "@/lib/notify";
import type { TemplateDefinition, TemplateStatus } from "@/lib/templates";

const statusLabel: Record<TemplateStatus, { text: string; bg: string; color: string }> = {
  draf: {
    text: "Draf",
    bg: "bg-slate-100",
    color: "text-slate-700 border-slate-200",
  },
  membuat: {
    text: "Membuat",
    bg: "bg-amber-50",
    color: "text-amber-700 border-amber-200",
  },
  aktif: {
    text: "Aktif",
    bg: "bg-emerald-50",
    color: "text-emerald-700 border-emerald-200",
  },
  gagal: {
    text: "Gagal",
    bg: "bg-rose-50",
    color: "text-rose-700 border-rose-200",
  },
  diarsipkan: {
    text: "Diarsipkan",
    bg: "bg-zinc-100",
    color: "text-zinc-600 border-zinc-200",
  },
};

export default function TemplatePage() {
  const [templates, setTemplates] = useState<TemplateDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const fetchTemplates = async () => {
      try {
        const res = await fetch("/api/templates");
        if (!res.ok) {
          throw new Error("Gagal memuat template");
        }
        const data = await res.json();
        if (active) {
          setTemplates(data.templates || []);
        }
      } catch {
        if (active) {
          notify.error("Gagal memuat daftar template");
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    fetchTemplates();
    return () => {
      active = false;
    };
  }, []);

  const loadTemplates = async () => {
    try {
      const res = await fetch("/api/templates");
      if (!res.ok) {
        throw new Error("Gagal memuat template");
      }
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch {
      notify.error("Gagal memuat daftar template");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async (id: string, name: string) => {
    try {
      const res = await fetch(`/api/templates/${id}/file?contoh=1`);
      if (!res.ok) {
        throw new Error("Gagal mengunduh");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name.toLowerCase().replace(/[^a-z0-9_]/g, "_")}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      notify.success("Template berhasil diunduh");
    } catch {
      notify.error("Gagal mengunduh berkas template");
    }
  };

  const handleArchive = async (id: string, name: string) => {
    if (!confirm(`Arsipkan template '${name}'?`)) {
      return;
    }
    setArchivingId(id);
    try {
      const res = await fetch(`/api/templates/${id}/archive`, {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error("Gagal mengarsipkan");
      }
      notify.success(`Template '${name}' berhasil diarsipkan`);
      await loadTemplates();
    } catch {
      notify.error("Gagal mengarsipkan template");
    } finally {
      setArchivingId(null);
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <PageHeader
          title="Template CSV"
          description="Daftar konfigurasi template data dan volume Unity Catalog."
        />
        <Link href="/template/baru">
          <Button variant="primary">
            <Plus className="w-4 h-4 mr-1.5 inline" />
            Buat template
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="bg-white border border-zinc-200 rounded-xl p-8 text-center text-sm text-zinc-500">
          Memuat daftar template...
        </div>
      ) : templates.length === 0 ? (
        <div className="bg-white border border-zinc-200 rounded-xl p-8 text-center text-sm text-zinc-500">
          Belum ada template yang dibuat. Klik tombol di atas untuk membuat template pertama.
        </div>
      ) : (
        <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/75 text-zinc-600 text-xs font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Nama Template</th>
                  <th className="py-3 px-4">Jumlah Kolom</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Path Volume</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {templates.map((tpl) => {
                  const badge = statusLabel[tpl.status] || statusLabel.membuat;
                  const volumePath = `/Volumes/${tpl.volume.catalog}/${tpl.volume.schema}/${tpl.volume.name}`;
                  const isArchived = tpl.status === "diarsipkan";

                  return (
                    <tr key={tpl.id} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="py-3.5 px-4 font-medium text-zinc-900">
                        <div>{tpl.name}</div>
                        <div className="text-xs text-zinc-400 font-mono mt-0.5">
                          {tpl.slug}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-zinc-600">
                        {tpl.columns.length} kolom
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 text-xs font-medium rounded border ${badge.bg} ${badge.color}`}
                        >
                          {badge.text}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs font-mono text-zinc-600 max-w-xs truncate">
                        {volumePath}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleDownload(tpl.id, tpl.name)}
                            className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium px-2 py-1 rounded hover:bg-indigo-50 transition"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Unduh template
                          </button>
                          <Link
                            href={`/template/${tpl.id}/edit`}
                            className="inline-flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-900 font-medium px-2 py-1 rounded hover:bg-zinc-100 transition"
                          >
                            Edit
                          </Link>
                          {!isArchived && (
                            <button
                              type="button"
                              disabled={archivingId === tpl.id}
                              onClick={() => handleArchive(tpl.id, tpl.name)}
                              className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-rose-600 font-medium px-2 py-1 rounded hover:bg-rose-50 transition disabled:opacity-50"
                            >
                              <Archive className="w-3.5 h-3.5" />
                              Arsipkan
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
