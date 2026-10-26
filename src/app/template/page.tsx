"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Archive, Download, History, Plus } from "lucide-react";
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
    text: "Sedang disiapkan",
    bg: "bg-amber-50",
    color: "text-amber-700 border-amber-200",
  },
  aktif: {
    text: "Siap dipakai",
    bg: "bg-emerald-50",
    color: "text-emerald-700 border-emerald-200",
  },
  gagal: {
    text: "Gagal disiapkan",
    bg: "bg-rose-50",
    color: "text-rose-700 border-rose-200",
  },
  diarsipkan: {
    text: "Nonaktif",
    bg: "bg-zinc-100",
    color: "text-zinc-600 border-zinc-200",
  },
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
        throw new Error("Gagal mengunduh format template");
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
      notify.success("Format template berhasil diunduh");
    } catch {
      notify.error("Gagal mengunduh berkas template");
    }
  };

  const handleArchive = async (id: string, name: string) => {
    if (!confirm(`Nonaktifkan template '${name}'?`)) {
      return;
    }
    setArchivingId(id);
    try {
      const res = await fetch(`/api/templates/${id}/archive`, {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error("Gagal menonaktifkan");
      }
      notify.success(`Template '${name}' berhasil dinonaktifkan`);
      await loadTemplates();
    } catch {
      notify.error("Gagal menonaktifkan template");
    } finally {
      setArchivingId(null);
    }
  };

  return (
    <div className="space-y-6 text-base">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeader
          title="Daftar Template"
          description="Template adalah contoh format file yang harus diisi. Semua orang dapat membuat dan memperbarui template."
        />
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <Link href="/template/perubahan" className="w-full sm:w-auto">
            <Button variant="secondary" className="w-full sm:w-auto whitespace-nowrap gap-2 min-h-[44px]">
              <History className="w-4 h-4 shrink-0" />
              <span>Riwayat perubahan</span>
            </Button>
          </Link>
          <Link href="/template/baru" className="w-full sm:w-auto">
            <Button variant="primary" className="w-full sm:w-auto whitespace-nowrap gap-2 min-h-[44px]">
              <Plus className="w-4 h-4 shrink-0" />
              <span>Buat template</span>
            </Button>
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white border border-zinc-200 rounded-xl p-8 text-center text-base text-zinc-500">
          Memuat daftar template...
        </div>
      ) : templates.length === 0 ? (
        <div className="bg-white border border-zinc-200 rounded-xl p-8 text-center space-y-4">
          <div className="space-y-1">
            <p className="text-base font-semibold text-zinc-900">Belum ada template.</p>
            <p className="text-base text-zinc-500">
              Buat template pertama untuk mulai mengunggah file.
            </p>
          </div>
          <div>
            <Link href="/template/baru">
              <Button variant="primary">
                <Plus className="w-4 h-4 mr-1.5 inline" />
                Buat template
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-600 font-semibold">
                  <th className="py-3 px-4">Nama Template</th>
                  <th className="py-3 px-4">Jumlah Kolom</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Pembaruan Terakhir</th>
                  <th className="py-3 px-4 text-right">Tindakan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {templates.map((tpl) => {
                  const badge = statusLabel[tpl.status] || statusLabel.membuat;
                  const isArchived = tpl.status === "diarsipkan";

                  return (
                    <tr key={tpl.id} className="hover:bg-zinc-50 transition-colors">
                      <td className="py-3.5 px-4 font-medium text-zinc-900">
                        <div>{tpl.name}</div>
                        {tpl.description && (
                          <div className="text-xs text-zinc-500 mt-0.5 max-w-sm truncate">
                            {tpl.description}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-zinc-600">
                        {tpl.columns.length} kolom (v{tpl.version})
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-block px-2.5 py-0.5 text-xs font-medium rounded border ${badge.bg} ${badge.color}`}
                        >
                          {badge.text}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-zinc-500 text-xs">
                        {formatDate(tpl.updatedAt)}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleDownload(tpl.id, tpl.name)}
                            className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium px-2 py-1 rounded hover:bg-indigo-50 transition"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Unduh
                          </button>
                          <Link
                            href={`/template/${tpl.id}/edit`}
                            className="inline-flex items-center gap-1 text-xs text-zinc-700 hover:text-zinc-900 font-medium px-2 py-1 rounded hover:bg-zinc-100 transition"
                          >
                            Ubah
                          </Link>
                          {!isArchived && (
                            <button
                              type="button"
                              disabled={archivingId === tpl.id}
                              onClick={() => handleArchive(tpl.id, tpl.name)}
                              className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-rose-600 font-medium px-2 py-1 rounded hover:bg-rose-50 transition disabled:opacity-50"
                            >
                              <Archive className="w-3.5 h-3.5" />
                              Nonaktifkan
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
