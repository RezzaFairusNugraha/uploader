"use client";

import { useEffect, useRef, useState, useMemo, useId } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Download,
  History,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Upload,
} from "lucide-react";
import Button from "@/components/Button";
import PageHeader from "@/components/PageHeader";
import { notify } from "@/lib/notify";
import {
  formatTemplateCardMeta,
  formatTemplateLastUpload,
  GLOSSARY,
} from "@/lib/copy";
import type { TemplateDefinition, TemplateStatus } from "@/lib/templates";

interface TemplateWithMeta extends TemplateDefinition {
  lastUploadedAt?: string | null;
  lastChangedBy?: string | null;
}

const statusBadgeConfig: Record<
  TemplateStatus,
  { label: string; dotClass: string; bgClass: string; textClass: string }
> = {
  aktif: {
    label: GLOSSARY.status.aktif,
    dotClass: "bg-emerald-500",
    bgClass: "bg-emerald-50",
    textClass: "text-emerald-700 border-emerald-200",
  },
  membuat: {
    label: GLOSSARY.status.membuat,
    dotClass: "bg-amber-500",
    bgClass: "bg-amber-50",
    textClass: "text-amber-700 border-amber-200",
  },
  gagal: {
    label: GLOSSARY.status.gagal,
    dotClass: "bg-rose-500",
    bgClass: "bg-rose-50",
    textClass: "text-rose-700 border-rose-200",
  },
  diarsipkan: {
    label: GLOSSARY.status.diarsipkan,
    dotClass: "bg-zinc-400",
    bgClass: "bg-zinc-100",
    textClass: "text-zinc-600 border-zinc-200",
  },
  draf: {
    label: GLOSSARY.status.draf,
    dotClass: "bg-slate-400",
    bgClass: "bg-slate-100",
    textClass: "text-slate-700 border-slate-200",
  },
};

export default function TemplatePage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<TemplateWithMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"aktif" | "diarsipkan" | "semua">("aktif");

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const loadData = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [tplRes, histRes, verRes] = await Promise.all([
        fetch("/api/templates"),
        fetch("/api/history").catch(() => null),
        fetch("/api/templates/versions").catch(() => null),
      ]);

      if (!tplRes.ok) {
        throw new Error("Gagal memuat template dari database.");
      }

      const tplData = await tplRes.json();
      const rawTemplates: TemplateDefinition[] = tplData.templates || [];

      let historyItems: { templateId?: string; createdAt?: string }[] = [];
      if (histRes && histRes.ok) {
        const histData = await histRes.json();
        historyItems = histData.items || [];
      }

      let versionItems: { templateId?: string; changedBy?: string; createdAt?: string }[] = [];
      if (verRes && verRes.ok) {
        const verData = await verRes.json();
        versionItems = verData.items || [];
      }

      const lastUploadMap = new Map<string, string>();
      for (const item of historyItems) {
        if (item.templateId && item.createdAt && !lastUploadMap.has(item.templateId)) {
          lastUploadMap.set(item.templateId, item.createdAt);
        }
      }

      const lastUpdaterMap = new Map<string, string>();
      for (const item of versionItems) {
        if (item.templateId && item.changedBy && !lastUpdaterMap.has(item.templateId)) {
          lastUpdaterMap.set(item.templateId, item.changedBy);
        }
      }

      const combined: TemplateWithMeta[] = rawTemplates.map((t) => ({
        ...t,
        lastUploadedAt: lastUploadMap.get(t.id) || null,
        lastChangedBy: lastUpdaterMap.get(t.id) || null,
      }));

      combined.sort((a, b) => {
        const dateA = new Date(a.updatedAt || a.createdAt).getTime();
        const dateB = new Date(b.updatedAt || b.createdAt).getTime();
        return dateB - dateA;
      });

      setTemplates(combined);
    } catch {
      setErrorMessage("Daftar template tidak dapat dimuat. Periksa koneksi database dan coba lagi.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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

  const handleDuplicate = (tpl: TemplateWithMeta) => {
    setOpenMenuId(null);
    const params = new URLSearchParams({
      name: `${tpl.name} (Salinan)`,
      delimiter: tpl.delimiter,
      description: tpl.description || "",
      copyFromId: tpl.id,
    });
    router.push(`/template/baru?${params.toString()}`);
  };

  const handleToggleArchive = async (tpl: TemplateWithMeta) => {
    setOpenMenuId(null);
    const isCurrentlyArchived = tpl.status === "diarsipkan";

    if (isCurrentlyArchived) {
      try {
        const res = await fetch(`/api/templates/${tpl.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "aktif" }),
        });
        if (!res.ok) throw new Error();
        setTemplates((prev) =>
          prev.map((t) => (t.id === tpl.id ? { ...t, status: "aktif" } : t))
        );
        notify.success(`Template ${tpl.name} diaktifkan kembali`);
      } catch {
        notify.error("Gagal mengaktifkan kembali template");
      }
    } else {
      try {
        const res = await fetch(`/api/templates/${tpl.id}/archive`, {
          method: "POST",
        });
        if (!res.ok) throw new Error();

        setTemplates((prev) =>
          prev.map((t) => (t.id === tpl.id ? { ...t, status: "diarsipkan" } : t))
        );

        notify.info(`Template ${tpl.name} dinonaktifkan`, {
          action: {
            label: "Batalkan",
            onClick: async () => {
              try {
                const undoRes = await fetch(`/api/templates/${tpl.id}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ status: "aktif" }),
                });
                if (undoRes.ok) {
                  setTemplates((prev) =>
                    prev.map((t) => (t.id === tpl.id ? { ...t, status: "aktif" } : t))
                  );
                  notify.success(`Template ${tpl.name} kembali aktif`);
                }
              } catch {}
            },
          },
        });
      } catch {
        notify.error("Gagal menonaktifkan template");
      }
    }
  };

  const counts = useMemo(() => {
    let aktifCount = 0;
    let diarsipkanCount = 0;
    for (const t of templates) {
      if (t.status === "aktif") aktifCount++;
      if (t.status === "diarsipkan") diarsipkanCount++;
    }
    return {
      aktif: aktifCount,
      diarsipkan: diarsipkanCount,
      semua: templates.length,
    };
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    return templates.filter((tpl) => {
      if (statusFilter === "aktif" && tpl.status !== "aktif") return false;
      if (statusFilter === "diarsipkan" && tpl.status !== "diarsipkan") return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = tpl.name.toLowerCase().includes(q);
        const matchDesc = (tpl.description || "").toLowerCase().includes(q);
        if (!matchName && !matchDesc) return false;
      }
      return true;
    });
  }, [templates, statusFilter, searchQuery]);

  return (
    <div className="space-y-6 text-base max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeader
          title="Template"
          description="Template adalah contoh format file yang perlu Anda isi sebelum mengunggah."
        />
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto shrink-0">
          <Link href="/template/perubahan" className="w-full sm:w-auto">
            <Button
              variant="secondary"
              className="w-full sm:w-auto whitespace-nowrap gap-2 min-h-[44px]"
            >
              <History className="w-4 h-4 shrink-0" />
              <span>Riwayat perubahan</span>
            </Button>
          </Link>
          <Link href="/template/baru" className="w-full sm:w-auto">
            <Button
              variant="primary"
              className="w-full sm:w-auto whitespace-nowrap gap-2 min-h-[44px]"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>Buat template</span>
            </Button>
          </Link>
        </div>
      </div>

      {templates.length > 6 && (
        <div className="relative">
          <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari template..."
            aria-label="Cari template"
            className="w-full min-h-[44px] h-11 pl-11 pr-4 bg-white border border-zinc-200 rounded-xl text-base text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 transition"
          />
        </div>
      )}

      {templates.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setStatusFilter("aktif")}
            className={`min-h-[44px] px-4 py-2 rounded-xl text-base font-medium border transition-colors cursor-pointer ${
              statusFilter === "aktif"
                ? "bg-indigo-600 border-indigo-600 text-white shadow-xs"
                : "bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            Siap dipakai ({counts.aktif})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("diarsipkan")}
            className={`min-h-[44px] px-4 py-2 rounded-xl text-base font-medium border transition-colors cursor-pointer ${
              statusFilter === "diarsipkan"
                ? "bg-indigo-600 border-indigo-600 text-white shadow-xs"
                : "bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            Nonaktif ({counts.diarsipkan})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("semua")}
            className={`min-h-[44px] px-4 py-2 rounded-xl text-base font-medium border transition-colors cursor-pointer ${
              statusFilter === "semua"
                ? "bg-indigo-600 border-indigo-600 text-white shadow-xs"
                : "bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            Semua ({counts.semua})
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white border border-zinc-200 rounded-xl p-5 space-y-4 animate-pulse"
            >
              <div className="flex items-center justify-between">
                <div className="h-6 w-48 bg-zinc-200 rounded-md" />
                <div className="h-6 w-24 bg-zinc-100 rounded-full" />
              </div>
              <div className="space-y-2">
                <div className="h-4 w-64 bg-zinc-100 rounded" />
                <div className="h-4 w-40 bg-zinc-100 rounded" />
              </div>
              <div className="pt-2 flex gap-3">
                <div className="h-11 w-32 bg-zinc-200 rounded-lg" />
                <div className="h-11 w-32 bg-zinc-100 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      ) : errorMessage ? (
        <div className="bg-white border border-rose-200 rounded-xl p-8 text-center space-y-3">
          <p className="text-base text-rose-700 font-medium">{errorMessage}</p>
          <div>
            <Button variant="secondary" onClick={loadData}>
              Coba lagi
            </Button>
          </div>
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
      ) : filteredTemplates.length === 0 ? (
        <div className="bg-white border border-zinc-200 rounded-xl p-8 text-center space-y-3">
          <p className="text-base text-zinc-600">Tidak ada template yang cocok.</p>
          <div>
            <Button
              variant="secondary"
              onClick={() => {
                setSearchQuery("");
                setStatusFilter("semua");
              }}
            >
              Hapus pencarian
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredTemplates.map((tpl) => (
            <TemplateCard
              key={tpl.id}
              tpl={tpl}
              isMenuOpen={openMenuId === tpl.id}
              onToggleMenu={() =>
                setOpenMenuId((cur) => (cur === tpl.id ? null : tpl.id))
              }
              onCloseMenu={() => setOpenMenuId(null)}
              onDownload={() => handleDownload(tpl.id, tpl.name)}
              onDuplicate={() => handleDuplicate(tpl)}
              onToggleArchive={() => handleToggleArchive(tpl)}
              triggerRef={(el) => {
                menuTriggerRefs.current[tpl.id] = el;
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface TemplateCardProps {
  tpl: TemplateWithMeta;
  isMenuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onDownload: () => void;
  onDuplicate: () => void;
  onToggleArchive: () => void;
  triggerRef: (el: HTMLButtonElement | null) => void;
}

function TemplateCard({
  tpl,
  isMenuOpen,
  onToggleMenu,
  onCloseMenu,
  onDownload,
  onDuplicate,
  onToggleArchive,
  triggerRef,
}: TemplateCardProps) {
  const badge = statusBadgeConfig[tpl.status] || statusBadgeConfig.membuat;
  const isReady = tpl.status === "aktif";
  const isArchived = tpl.status === "diarsipkan";
  const menuId = useId();

  const menuContainerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isMenuOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuContainerRef.current &&
        !menuContainerRef.current.contains(e.target as Node)
      ) {
        onCloseMenu();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseMenu();
        buttonRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen, onCloseMenu]);

  const metaPrimary = formatTemplateCardMeta(
    tpl.columns.length,
    tpl.updatedAt || tpl.createdAt,
    tpl.lastChangedBy
  );
  const metaUpload = formatTemplateLastUpload(tpl.lastUploadedAt);

  return (
    <article className="bg-white border border-zinc-200 rounded-xl p-5 hover:border-zinc-300 transition-colors space-y-4">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-lg font-semibold text-zinc-900 line-clamp-2 leading-snug">
          {tpl.name}
        </h2>
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border whitespace-nowrap shrink-0 ${badge.bgClass} ${badge.textClass}`}
        >
          <span className={`w-2 h-2 rounded-full ${badge.dotClass}`} />
          <span>{badge.label}</span>
        </span>
      </div>

      {tpl.description ? (
        <p className="text-sm text-zinc-600 line-clamp-2">{tpl.description}</p>
      ) : null}

      <div className="space-y-0.5 text-sm text-zinc-500">
        <div>{metaPrimary}</div>
        <div>{metaUpload}</div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5 pt-1">
        {isReady ? (
          <Link href={`/?template=${tpl.id}`} className="w-full sm:w-auto">
            <Button
              variant="primary"
              className="w-full sm:w-auto whitespace-nowrap min-h-[44px] gap-2"
            >
              <Upload className="w-4 h-4 shrink-0" />
              <span>Unggah file</span>
            </Button>
          </Link>
        ) : (
          <span className="text-sm text-zinc-400 py-2 sm:py-0 w-full sm:w-auto inline-flex items-center">
            Template belum siap dipakai
          </span>
        )}

        <Button
          type="button"
          variant="secondary"
          onClick={onDownload}
          className="min-h-[44px] whitespace-nowrap gap-2"
        >
          <Download className="w-4 h-4 shrink-0" />
          <span>Unduh template</span>
        </Button>

        <Link href={`/template/${tpl.id}/edit`}>
          <Button
            type="button"
            variant="secondary"
            className="min-h-[44px] whitespace-nowrap gap-2"
          >
            <Pencil className="w-4 h-4 shrink-0" />
            <span>Ubah</span>
          </Button>
        </Link>

        <div className="relative inline-block" ref={menuContainerRef}>
          <button
            ref={(el) => {
              buttonRef.current = el;
              triggerRef(el);
            }}
            type="button"
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
            aria-controls={menuId}
            onClick={onToggleMenu}
            className="min-h-[44px] px-3.5 rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 inline-flex items-center gap-1.5 text-base font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-600"
          >
            <MoreHorizontal className="w-4 h-4" />
            <span>Lainnya</span>
          </button>

          {isMenuOpen && (
            <div
              id={menuId}
              role="menu"
              className="absolute right-0 mt-2 w-56 bg-white border border-zinc-200 rounded-xl shadow-lg py-1.5 z-20 animate-in fade-in zoom-in-95"
            >
              <button
                type="button"
                role="menuitem"
                onClick={onDuplicate}
                className="w-full text-left px-4 py-2.5 text-sm text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 transition-colors cursor-pointer"
              >
                Buat dari template ini
              </button>
              <Link
                href="/template/perubahan"
                role="menuitem"
                onClick={onCloseMenu}
                className="block w-full text-left px-4 py-2.5 text-sm text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 transition-colors cursor-pointer"
              >
                Riwayat perubahan
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={onToggleArchive}
                className="w-full text-left px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
              >
                {isArchived ? "Aktifkan kembali" : "Nonaktifkan"}
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
