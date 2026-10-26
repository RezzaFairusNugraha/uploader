"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import type { TemplateVersionItem } from "@/lib/templates/versions";

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

export default function TemplateChangesPage() {
  const [items, setItems] = useState<TemplateVersionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/templates/versions")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.items) {
          setItems(data.items);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="space-y-6 text-base">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Riwayat Perubahan Template"
          description="Daftar pembaruan versi dan catatan perubahan struktur template data."
        />
        <Link
          href="/template"
          className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
        >
          Kembali ke Daftar Template
        </Link>
      </div>

      {isLoading ? (
        <div className="bg-white border border-zinc-200 rounded-xl p-8 text-center text-zinc-500">
          Memuat riwayat perubahan...
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white border border-zinc-200 rounded-xl p-8 text-center text-zinc-500">
          Belum ada catatan perubahan versi template.
        </div>
      ) : (
        <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-xs">
          <table className="w-full text-left border-collapse text-sm">
            <thead className="bg-zinc-50 border-b border-zinc-200">
              <tr className="text-zinc-600">
                <th className="py-3 px-4 font-semibold">Waktu</th>
                <th className="py-3 px-4 font-semibold">Template</th>
                <th className="py-3 px-4 font-semibold">Versi</th>
                <th className="py-3 px-4 font-semibold">Oleh</th>
                <th className="py-3 px-4 font-semibold">Sifat Perubahan</th>
                <th className="py-3 px-4 font-semibold">Ringkasan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {items.map((ver) => (
                <tr key={ver.id} className="hover:bg-zinc-50">
                  <td className="py-3 px-4 text-zinc-600 whitespace-nowrap">
                    {formatDate(ver.createdAt)}
                  </td>
                  <td className="py-3 px-4 font-medium text-zinc-900">
                    {ver.snapshot.name}
                  </td>
                  <td className="py-3 px-4 font-mono text-zinc-700">
                    v{ver.version}
                  </td>
                  <td className="py-3 px-4 text-zinc-700">
                    {ver.changedBy || "-"}
                  </td>
                  <td className="py-3 px-4">
                    {ver.snapshot.status === "dihapus" ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
                        Dihapus
                      </span>
                    ) : ver.isBreaking ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
                        Memerlukan Perhatian
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Aman
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-zinc-600 max-w-sm truncate">
                    {ver.snapshot.status === "dihapus"
                      ? `Dihapus permanen oleh ${ver.changedBy}`
                      : ver.changeSummary}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
