"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { USER_COPY } from "@/lib/copy";
import type { UploadLogItem } from "@/lib/upload/log";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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

export default function HistoryPage() {
  const [items, setItems] = useState<UploadLogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/history")
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
      <PageHeader
        title={USER_COPY.history.title}
        description={USER_COPY.history.description}
      />

      {isLoading ? (
        <div className="bg-white border border-zinc-200 rounded-xl p-8 text-center text-zinc-500">
          Memuat riwayat pengunggahan...
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white border border-zinc-200 rounded-xl p-8 text-center text-zinc-500">
          {USER_COPY.history.empty}
        </div>
      ) : (
        <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead className="bg-zinc-50 border-b border-zinc-200">
                <tr className="text-zinc-600">
                  <th className="py-3 px-4 font-semibold">{USER_COPY.history.colTime}</th>
                  <th className="py-3 px-4 font-semibold">{USER_COPY.history.colFile}</th>
                  <th className="py-3 px-4 font-semibold">{USER_COPY.history.colFormat}</th>
                  <th className="py-3 px-4 font-semibold">{USER_COPY.history.colSize}</th>
                  <th className="py-3 px-4 font-semibold">{USER_COPY.history.colUploader}</th>
                  <th className="py-3 px-4 font-semibold">{USER_COPY.history.colStatus}</th>
                  <th className="py-3 px-4 font-semibold">{USER_COPY.history.colDestination}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-zinc-50">
                    <td className="py-3 px-4 text-zinc-600 whitespace-nowrap">
                      {formatDate(item.createdAt)}
                    </td>
                    <td className="py-3 px-4 font-medium text-zinc-900">
                      {item.originalName}
                    </td>
                    <td className="py-3 px-4 uppercase text-xs font-semibold text-zinc-500">
                      {item.format}
                    </td>
                    <td className="py-3 px-4 text-zinc-600 whitespace-nowrap">
                      {formatFileSize(item.sizeBytes)}
                    </td>
                    <td className="py-3 px-4 text-zinc-700">
                      {item.uploaderName || "-"}
                    </td>
                    <td className="py-3 px-4">
                      {item.status === "success" ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Berhasil
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
                          Gagal
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs font-mono text-zinc-500 max-w-xs truncate">
                      {item.destinationPath}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
