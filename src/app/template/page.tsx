"use client";

import { useEffect, useRef, useState, useMemo, useId } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Download,
  History,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Upload,
  X,
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
  draf_deteksi: {
    label: GLOSSARY.status.draf_deteksi,
    dotClass: "bg-amber-500",
    bgClass: "bg-amber-50",
    textClass: "text-amber-800 border-amber-200",
  },
  dihapus: {
    label: "Dihapus",
    dotClass: "bg-rose-500",
    bgClass: "bg-rose-50",
    textClass: "text-rose-700 border-rose-200",
  },
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1);
  return `${val} ${units[i]}`;
}

export default function TemplatePage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<TemplateWithMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCheckingConnection, setIsCheckingConnection] = useState(false);

  const [isAdmin, setIsAdmin] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<TemplateWithMeta | null>(null);
  const [deletePreview, setDeletePreview] = useState<{
    csvFiles: number;
    parquetFiles: number;
    totalSize: number;
    capped: boolean;
    lastUploadAt: string | null;
    uploadsLast7Days: number;
    volumeOwnedByApp: boolean;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [confirmNameInput, setConfirmNameInput] = useState("");
  const [userNameInput, setUserNameInput] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteStep, setDeleteStep] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [loginTarget, setLoginTarget] = useState<TemplateWithMeta | null>(null);
  const [adminPasswordInput, setAdminPasswordInput] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"aktif" | "diarsipkan" | "semua">("aktif");

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const menuTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    fetch("/api/admin/auth")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.isAuthenticated) {
          setIsAdmin(true);
        }
      })
      .catch(() => {});
  }, []);

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
    if (pendingActionId === tpl.id) return;
    setOpenMenuId(null);
    setPendingActionId(tpl.id);
    const isCurrentlyArchived = tpl.status === "diarsipkan";

    if (isCurrentlyArchived) {
      try {
        const res = await fetch(`/api/templates/${tpl.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "aktif" }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.error || "Gagal mengaktifkan kembali template");
        }
        const updated = await res.json();
        setTemplates((prev) =>
          prev.map((t) => (t.id === tpl.id ? { ...t, ...updated, status: "aktif" } : t))
        );
        notify.success(`Template ${tpl.name} diaktifkan kembali`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal mengaktifkan kembali template. Coba lagi.";
        notify.error(msg);
      } finally {
        setPendingActionId(null);
      }
    } else {
      try {
        const res = await fetch(`/api/templates/${tpl.id}/archive`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ changedBy: "Pengguna" }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.error || "Gagal menonaktifkan template");
        }
        const updated = await res.json();

        setTemplates((prev) =>
          prev.map((t) => (t.id === tpl.id ? { ...t, ...updated, status: "diarsipkan" } : t))
        );

        notify.info(`Template ${tpl.name} dinonaktifkan`, {
          action: {
            label: "Batalkan",
            onClick: async () => {
              setPendingActionId(tpl.id);
              try {
                const undoRes = await fetch(`/api/templates/${tpl.id}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ status: "aktif" }),
                });
                if (undoRes.ok) {
                  const restored = await undoRes.json();
                  setTemplates((prev) =>
                    prev.map((t) => (t.id === tpl.id ? { ...t, ...restored, status: "aktif" } : t))
                  );
                  notify.success(`Template ${tpl.name} kembali aktif`);
                } else {
                  throw new Error();
                }
              } catch {
                notify.error(`Gagal membatalkan status template ${tpl.name}. Coba lagi.`);
              } finally {
                setPendingActionId(null);
              }
            },
          },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menonaktifkan template. Coba lagi.";
        notify.error(msg);
      } finally {
        setPendingActionId(null);
      }
    }
  };

  useEffect(() => {
    if (!deleteTarget) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isDeleting) {
        setDeleteTarget(null);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [deleteTarget, isDeleting]);

  const openDeleteDialog = async (tpl: TemplateWithMeta) => {
    setOpenMenuId(null);
    setDeleteTarget(tpl);
    setConfirmNameInput("");
    setDeleteError(null);
    setDeleteStep(null);
    setDeletePreview(null);
    setPreviewError(null);
    setPreviewLoading(true);

    const savedName = localStorage.getItem("uploader_user_name") || "";
    setUserNameInput(savedName);

    try {
      const res = await fetch(`/api/templates/${tpl.id}/delete-preview`);
      const data = await res.json();
      if (!res.ok) {
        setPreviewError(data.error || "Gagal memuat pratinjau penghapusan.");
      } else {
        setDeletePreview(data);
      }
    } catch {
      setPreviewError("Koneksi terputus saat memuat pratinjau penghapusan.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const openAdminLogin = (tpl: TemplateWithMeta) => {
    setOpenMenuId(null);
    setLoginTarget(tpl);
    setAdminPasswordInput("");
    setLoginError(null);
  };

  const handleAdminLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: adminPasswordInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || "Kata sandi salah.");
        return;
      }
      setIsAdmin(true);
      const target = loginTarget;
      setLoginTarget(null);
      if (target) {
        openDeleteDialog(target);
      }
    } catch {
      setLoginError("Gagal menghubungi server.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    if (confirmNameInput.trim() !== deleteTarget.name.trim()) return;
    if (!userNameInput.trim()) return;

    localStorage.setItem("uploader_user_name", userNameInput.trim());

    setIsDeleting(true);
    setDeleteError(null);

    if (deletePreview?.volumeOwnedByApp) {
      setDeleteStep("Menghapus folder penyimpanan di Databricks");
    } else {
      setDeleteStep("Menghapus template");
    }

    try {
      const res = await fetch(`/api/templates/${deleteTarget.id}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmName: confirmNameInput.trim(),
          deletedBy: userNameInput.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setDeleteError(data.error || "Gagal menghapus template. Coba lagi.");
        setIsDeleting(false);
        setDeleteStep(null);
        return;
      }

      notify.success(`Template ${deleteTarget.name} dihapus permanen`);
      setDeleteTarget(null);
      await loadData();
    } catch {
      setDeleteError("Koneksi terputus saat menghapus template. Coba lagi.");
      setIsDeleting(false);
      setDeleteStep(null);
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

  const flaggedCount = useMemo(
    () => templates.filter((t) => t.needsCheck).length,
    [templates]
  );

  const handleCheckAllTemplates = async () => {
    setIsCheckingConnection(true);
    try {
      const res = await fetch("/api/templates/check-connection", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal memeriksa template");
      }
      notify.success(
        `Pemeriksaan selesai. ${data.totalChecked || 0} template diperiksa.`
      );
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan";
      notify.error(msg);
    } finally {
      setIsCheckingConnection(false);
    }
  };

  return (
    <div className="space-y-6 text-base max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeader
          title="Template"
          description="Template adalah contoh format file yang perlu Anda isi sebelum mengunggah."
        />
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto shrink-0">
          <Link href="/template/baru?mode=sync" className="w-full sm:w-auto">
            <Button
              variant="secondary"
              className="w-full sm:w-auto whitespace-nowrap gap-2 min-h-[44px]"
            >
              <RefreshCw className="w-4 h-4 shrink-0" />
              <span>Sinkronkan dengan Databricks</span>
            </Button>
          </Link>
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

      {flaggedCount > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <span className="font-medium">
              Koneksi diganti. {flaggedCount} template perlu diperiksa.
            </span>
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={isCheckingConnection}
            onClick={handleCheckAllTemplates}
            className="whitespace-nowrap"
          >
            {isCheckingConnection ? "Memeriksa..." : "Periksa semua template"}
          </Button>
        </div>
      )}

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
              isAdmin={isAdmin}
              isPending={pendingActionId === tpl.id}
              isMenuOpen={openMenuId === tpl.id}
              onToggleMenu={() =>
                setOpenMenuId((cur) => (cur === tpl.id ? null : tpl.id))
              }
              onCloseMenu={() => setOpenMenuId(null)}
              onDownload={() => handleDownload(tpl.id, tpl.name)}
              onDuplicate={() => handleDuplicate(tpl)}
              onToggleArchive={() => handleToggleArchive(tpl)}
              onDeletePermanent={() => openDeleteDialog(tpl)}
              onOpenAdminLogin={() => openAdminLogin(tpl)}
              triggerRef={(el) => {
                menuTriggerRefs.current[tpl.id] = el;
              }}
            />
          ))}
        </div>
      )}

      {deleteTarget && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isDeleting) {
              setDeleteTarget(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            className="bg-white border border-zinc-200 rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-5 my-8"
          >
            <div className="flex items-start justify-between gap-3">
              <h2
                id="delete-dialog-title"
                className="text-xl font-semibold text-zinc-900 leading-snug"
              >
                Hapus template {deleteTarget.name} secara permanen?
              </h2>
              {!isDeleting && (
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="text-zinc-400 hover:text-zinc-600 p-1 rounded-lg"
                  aria-label="Tutup"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {previewLoading ? (
              <div className="py-6 text-center text-sm text-zinc-500">
                <span className="inline-block w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mr-2 align-middle" />
                Memeriksa isi folder dan berkas terkait...
              </div>
            ) : deletePreview && deletePreview.volumeOwnedByApp ? (
              <div className="space-y-3">
                <div className="text-sm text-zinc-700 bg-zinc-50 border border-zinc-200 rounded-xl p-4 space-y-2">
                  <div className="font-semibold text-zinc-900">Yang akan terhapus:</div>
                  <ul className="list-disc list-inside space-y-1 text-zinc-600">
                    <li>Template ini</li>
                    <li>Folder penyimpanan di Databricks</li>
                    <li>
                      Setiap berkas di dalamnya (
                      {deletePreview.capped ? "lebih dari " : ""}
                      {(deletePreview.csvFiles || 0) + (deletePreview.parquetFiles || 0)} file,{" "}
                      {formatBytes(deletePreview.totalSize || 0)}: {deletePreview.csvFiles || 0} di
                      folder CSV, {deletePreview.parquetFiles || 0} di folder Parquet)
                    </li>
                  </ul>
                  <div className="text-xs text-zinc-500 pt-1">
                    {formatTemplateLastUpload(deletePreview.lastUploadAt)}
                  </div>
                </div>

                {deletePreview.uploadsLast7Days > 0 && (
                  <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-start gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      Template ini dipakai {deletePreview.uploadsLast7Days} kali dalam 7 hari terakhir.
                    </span>
                  </div>
                )}

                <p className="text-sm text-rose-600 font-medium">
                  Tindakan ini tidak bisa dibatalkan. Pastikan tim data sudah tahu, karena proses di
                  sistem data yang membaca folder ini akan gagal.
                </p>
              </div>
            ) : deletePreview && !deletePreview.volumeOwnedByApp ? (
              <div className="space-y-3">
                <div className="text-sm text-zinc-700 bg-zinc-50 border border-zinc-200 rounded-xl p-4">
                  Folder penyimpanan ini tidak dibuat oleh aplikasi, jadi tidak ikut dihapus. Hanya
                  template yang dihapus.
                </div>
                <p className="text-sm text-rose-600 font-medium">
                  Tindakan ini tidak bisa dibatalkan.
                </p>
              </div>
            ) : null}

            {previewError && (
              <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3.5">
                {previewError}
              </div>
            )}

            {deleteError && (
              <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3.5">
                {deleteError}
              </div>
            )}

            {isDeleting && deleteStep && (
              <div className="text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-xl p-3.5 flex items-center gap-2.5">
                <span className="w-4 h-4 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin shrink-0" />
                <span>{deleteStep}...</span>
              </div>
            )}

            <div className="space-y-4 pt-1">
              <div>
                <label className="block text-sm font-medium text-zinc-900 mb-1">
                  Nama Anda <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={userNameInput}
                  onChange={(e) => setUserNameInput(e.target.value)}
                  disabled={isDeleting}
                  placeholder="Nama Anda"
                  className="w-full h-11 px-3 rounded-lg border border-zinc-300 text-base text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-900 mb-1">
                  Ketik nama template untuk melanjutkan
                </label>
                <input
                  type="text"
                  value={confirmNameInput}
                  onChange={(e) => setConfirmNameInput(e.target.value)}
                  disabled={isDeleting}
                  placeholder={deleteTarget.name}
                  className="w-full h-11 px-3 rounded-lg border border-zinc-300 text-base text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 disabled:opacity-50"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="secondary"
                disabled={isDeleting}
                onClick={() => setDeleteTarget(null)}
              >
                Batal
              </Button>
              <button
                type="button"
                disabled={
                  isDeleting ||
                  previewLoading ||
                  Boolean(previewError) ||
                  confirmNameInput.trim() !== deleteTarget.name.trim() ||
                  !userNameInput.trim()
                }
                onClick={handleConfirmDelete}
                className="min-h-[44px] h-11 px-4 rounded-lg text-base font-medium text-white bg-rose-600 hover:bg-rose-700 transition-colors focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none cursor-pointer inline-flex items-center justify-center gap-2"
              >
                {isDeleting && (
                  <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin shrink-0" />
                )}
                <span>Hapus permanen</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {loginTarget && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isLoggingIn) {
              setLoginTarget(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="login-dialog-title"
            className="bg-white border border-zinc-200 rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-700">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h2 id="login-dialog-title" className="text-lg font-semibold text-zinc-900">
                    Masuk sebagai Admin
                  </h2>
                </div>
              </div>
              {!isLoggingIn && (
                <button
                  type="button"
                  onClick={() => setLoginTarget(null)}
                  className="text-zinc-400 hover:text-zinc-600 p-1 rounded-lg"
                  aria-label="Tutup"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            <p className="text-sm text-zinc-600">
              Tindakan hapus permanen memerlukan sesi admin. Masukkan kata sandi admin Anda untuk melanjutkan.
            </p>

            <form onSubmit={handleAdminLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-900 mb-1">
                  Kata Sandi Admin
                </label>
                <input
                  type="password"
                  value={adminPasswordInput}
                  onChange={(e) => setAdminPasswordInput(e.target.value)}
                  disabled={isLoggingIn}
                  placeholder="Masukkan kata sandi"
                  autoFocus
                  required
                  className="w-full h-11 px-3 rounded-lg border border-zinc-300 text-base text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 disabled:opacity-50"
                />
              </div>

              {loginError && (
                <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">
                  {loginError}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isLoggingIn}
                  onClick={() => setLoginTarget(null)}
                >
                  Batal
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isLoggingIn}
                  disabled={!adminPasswordInput || isLoggingIn}
                >
                  Masuk
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

interface TemplateCardProps {
  tpl: TemplateWithMeta;
  isAdmin: boolean;
  isPending?: boolean;
  isMenuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onDownload: () => void;
  onDuplicate: () => void;
  onToggleArchive: () => void;
  onDeletePermanent: () => void;
  onOpenAdminLogin: () => void;
  triggerRef: (el: HTMLButtonElement | null) => void;
}

function TemplateCard({
  tpl,
  isAdmin,
  isPending = false,
  isMenuOpen,
  onToggleMenu,
  onCloseMenu,
  onDownload,
  onDuplicate,
  onToggleArchive,
  onDeletePermanent,
  onOpenAdminLogin,
  triggerRef,
}: TemplateCardProps) {
  let badge = statusBadgeConfig[tpl.status] || statusBadgeConfig.membuat;
  if (tpl.needsCheck) {
    badge = {
      label: "Perlu diperiksa koneksi",
      dotClass: "bg-amber-500",
      bgClass: "bg-amber-50",
      textClass: "text-amber-800 border-amber-200",
    };
  } else if (tpl.visibility === "tidak_terlihat") {
    badge = {
      label: "Folder tidak terlihat oleh koneksi saat ini",
      dotClass: "bg-amber-500",
      bgClass: "bg-amber-50",
      textClass: "text-amber-800 border-amber-200",
    };
  }
  const isReady = tpl.status === "aktif" && !tpl.needsCheck;
  const isArchived = tpl.status === "diarsipkan";
  const isDraftDetection = tpl.status === "draf_deteksi";
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
        {isDraftDetection ? (
          <Link href={`/template/baru?id=${tpl.id}&action=inspect`} className="w-full sm:w-auto">
            <Button
              variant="primary"
              disabled={isPending}
              className="w-full sm:w-auto whitespace-nowrap min-h-[44px]"
            >
              Periksa dan aktifkan
            </Button>
          </Link>
        ) : tpl.needsCheck ? (
          <span className="text-sm text-zinc-400 py-2 sm:py-0 w-full sm:w-auto inline-flex items-center">
            Koneksi diganti. Template ini perlu diperiksa dulu.
          </span>
        ) : isReady ? (
          <Link href={`/?template=${tpl.id}`} className="w-full sm:w-auto">
            <Button
              variant="primary"
              disabled={isPending}
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
          disabled={isPending}
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
            disabled={isPending}
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
            disabled={isPending}
            onClick={onToggleMenu}
            className="min-h-[44px] px-3.5 rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 inline-flex items-center gap-1.5 text-base font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? (
              <span className="w-4 h-4 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin shrink-0" />
            ) : (
              <MoreHorizontal className="w-4 h-4" />
            )}
            <span>Lainnya</span>
          </button>

          {isMenuOpen && !isPending && (
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
                className="w-full text-left px-4 py-2.5 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors cursor-pointer"
              >
                {isArchived ? "Aktifkan kembali" : "Nonaktifkan"}
              </button>
              {(tpl.needsCheck || tpl.visibility === "tidak_terlihat") && (
                <>
                  <div className="border-t border-zinc-200 my-1" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={async () => {
                      onCloseMenu();
                      try {
                        const res = await fetch(`/api/templates/${tpl.id}/provision`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ reuseExistingVolume: false }),
                        });
                        if (res.ok) {
                          notify.success("Folder berhasil disiapkan di koneksi baru");
                          window.location.reload();
                        } else {
                          notify.error("Gagal menyiapkan folder");
                        }
                      } catch {
                        notify.error("Gagal menyiapkan folder");
                      }
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm text-indigo-700 hover:bg-zinc-50 font-medium transition-colors cursor-pointer"
                  >
                    Siapkan folder di koneksi baru
                  </button>
                  <Link
                    href={`/template/baru?mode=sync&adopt=${tpl.id}`}
                    role="menuitem"
                    onClick={onCloseMenu}
                    className="block w-full text-left px-4 py-2.5 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors cursor-pointer"
                  >
                    Pakai folder yang sudah ada
                  </Link>
                </>
              )}
              {(tpl.status === "diarsipkan" || tpl.status === "draf") && (
                <>
                  <div className="border-t border-zinc-200 my-1" />
                  {isAdmin ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onCloseMenu();
                        onDeletePermanent();
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50 font-medium transition-colors cursor-pointer"
                    >
                      Hapus permanen
                    </button>
                  ) : (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onCloseMenu();
                        onOpenAdminLogin();
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm text-zinc-400 hover:bg-zinc-50 transition-colors cursor-pointer"
                    >
                      Hapus permanen (hanya admin)
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
