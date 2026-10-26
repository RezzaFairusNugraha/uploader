"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Lock, LogOut, XCircle } from "lucide-react";
import Button from "@/components/Button";
import Field from "@/components/Field";
import PageHeader from "@/components/PageHeader";
import { notify } from "@/lib/notify";
import type { ConnectionTestResult, MaskedSettings } from "@/lib/settings";

interface FormState {
  workspaceUrl: string;
  token: string;
  catalog: string;
  schema: string;
  maxFileSizeMb: number;
}

const initialFormState: FormState = {
  workspaceUrl: "",
  token: "",
  catalog: "",
  schema: "",
  maxFileSizeMb: 100,
};

export default function DatabricksConnectionPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [adminPasswordInput, setAdminPasswordInput] = useState("");
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);

  const [formData, setFormData] = useState<FormState>(initialFormState);
  const [savedSettings, setSavedSettings] = useState<MaskedSettings | null>(null);
  const [isChangingToken, setIsChangingToken] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  const checkAuth = async () => {
    try {
      const res = await fetch("/api/admin/auth");
      if (res.ok) {
        const data = await res.json();
        setIsAuthenticated(data.isAuthenticated);
        setHasPassword(data.hasPassword);
        if (data.isAuthenticated) {
          loadSettings();
        }
      }
    } catch {
    } finally {
      setAuthChecking(false);
    }
  };

  const loadSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        if (data && data.settings) {
          setSavedSettings(data.settings);
          setFormData({
            workspaceUrl: data.settings.workspaceUrl || "",
            token: "",
            catalog: data.settings.catalog || "",
            schema: data.settings.schema || "",
            maxFileSizeMb: data.settings.maxFileSizeMb || 100,
          });
          if (data.settings.lastTestResult) {
            setTestResult(data.settings.lastTestResult);
          }
        }
      }
    } catch {
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminPasswordInput) {
      notify.error("Kata sandi wajib diisi");
      return;
    }
    setIsSubmittingAuth(true);
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: adminPasswordInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Autentikasi gagal");
      }
      notify.success(data.message || "Berhasil masuk sebagai admin");
      setIsAuthenticated(true);
      setAdminPasswordInput("");
      loadSettings();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan";
      notify.error(msg);
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      setIsAuthenticated(false);
      notify.success("Sesi admin telah berakhir");
    } catch {
      notify.error("Gagal logout");
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === "maxFileSizeMb" ? Number(value) : value,
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const payload: Record<string, unknown> = {
        workspaceUrl: formData.workspaceUrl,
        catalog: formData.catalog,
        schema: formData.schema,
        maxFileSizeMb: formData.maxFileSizeMb,
      };

      if (!savedSettings?.hasToken || isChangingToken) {
        if (!formData.token) {
          notify.error("Personal Access Token wajib diisi");
          setIsSaving(false);
          return;
        }
        payload.token = formData.token;
      }

      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal menyimpan pengaturan");
      }

      if (data.message) {
        notify.success(data.message);
      } else {
        notify.success("Pengaturan koneksi Databricks berhasil disimpan");
      }
      setSavedSettings(data.settings);
      setIsChangingToken(false);
      setFormData((prev) => ({ ...prev, token: "" }));
      window.dispatchEvent(new Event("databricks-status-updated"));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan";
      notify.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await fetch("/api/settings/test", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Pengujian koneksi gagal");
      }

      setTestResult(data.result);
      if (data.success) {
        notify.success("Koneksi ke Databricks berhasil diverifikasi");
      } else {
        notify.error("Pengujian koneksi menemukan kendala");
      }
      window.dispatchEvent(new Event("databricks-status-updated"));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kendala teknis";
      notify.error(msg);
    } finally {
      setIsTesting(false);
    }
  };

  if (authChecking) {
    return (
      <div className="py-12 text-center text-base text-zinc-500">
        Memeriksa hak akses administrator...
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto space-y-6 pt-8">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-zinc-900">
            Akses Khusus Administrator
          </h1>
          <p className="text-base text-zinc-500">
            {hasPassword
              ? "Masukkan kata sandi admin untuk mengubah pengaturan koneksi Databricks."
              : "Buat kata sandi admin pertama untuk mengamankan koneksi penyimpanan."}
          </p>
        </div>

        <form
          onSubmit={handleAuthSubmit}
          className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4 shadow-xs"
        >
          <Field
            id="admin-password"
            label={hasPassword ? "Kata Sandi Admin" : "Buat Kata Sandi Admin"}
            name="adminPassword"
            type="password"
            value={adminPasswordInput}
            onChange={(e) => setAdminPasswordInput(e.target.value)}
            required
            hint={
              hasPassword
                ? "Sesi login berlaku selama 8 jam."
                : "Minimal 6 karakter. Harap simpan kata sandi ini dengan aman."
            }
          />

          <Button
            type="submit"
            variant="primary"
            className="w-full"
            isLoading={isSubmittingAuth}
          >
            {hasPassword ? "Buka Pengaturan" : "Simpan & Buka Pengaturan"}
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-8 text-base">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeader
          title="Koneksi Databricks"
          description="Konfigurasi kredensial Unity Catalog untuk penyimpanan berkas (Area Khusus Administrator)."
        />
        <Button variant="ghost" onClick={handleLogout}>
          <LogOut className="w-4 h-4 mr-1.5 inline" />
          Keluar Admin
        </Button>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-zinc-900 border-b border-zinc-100 pb-3">
            Kredensial Workspace & Akses
          </h2>

          <Field
            id="workspace-url"
            label="Workspace URL"
            name="workspaceUrl"
            value={formData.workspaceUrl}
            onChange={handleChange}
            placeholder="https://adb-xxxxxxxx.azuredatabricks.net"
            hint="Alamat workspace Databricks Anda"
            required
          />

          <div>
            <label className="block text-base font-medium text-zinc-700 mb-1.5">
              Personal Access Token
            </label>
            {savedSettings?.hasToken && !isChangingToken ? (
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  disabled
                  value={savedSettings.tokenMasked}
                  className="flex-1 min-h-[44px] h-11 px-3 text-base bg-zinc-50 border border-zinc-200 rounded-lg text-zinc-500 font-mono"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsChangingToken(true)}
                >
                  Ganti Token
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="password"
                  name="token"
                  value={formData.token}
                  onChange={handleChange}
                  placeholder="dapi..."
                  className="w-full min-h-[44px] h-11 px-3 text-base bg-white border border-zinc-200 rounded-lg text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 font-mono"
                  required={!savedSettings?.hasToken}
                />
                {savedSettings?.hasToken && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsChangingToken(false);
                      setFormData((prev) => ({ ...prev, token: "" }));
                    }}
                    className="min-h-[44px] inline-flex items-center text-sm text-zinc-500 hover:text-zinc-800 underline"
                  >
                    Batal ganti token
                  </button>
                )}
              </div>
            )}
            <p className="text-sm text-zinc-500 mt-1">
              Token dienkripsi dengan AES-256-GCM dan tidak pernah ditampilkan penuh.
            </p>
          </div>
        </div>

        <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-zinc-900 border-b border-zinc-100 pb-3">
            Lokasi Unity Catalog
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              id="catalog"
              label="Catalog (Katalog)"
              name="catalog"
              value={formData.catalog}
              onChange={handleChange}
              hint="Nama katalog Unity Catalog"
              required
            />

            <Field
              id="schema"
              label="Schema (Skema)"
              name="schema"
              value={formData.schema}
              onChange={handleChange}
              hint="Nama skema di dalam katalog"
              required
            />
          </div>
          <p className="text-sm text-zinc-500">
            Pengaturan ini hanya berlaku untuk template baru.
          </p>

          <Field
            id="max-upload-size"
            label="Batas Maksimum Ukuran Berkas (MB)"
            name="maxFileSizeMb"
            type="number"
            value={formData.maxFileSizeMb}
            onChange={handleChange}
            hint="Standar 100 MB"
            required
          />
        </div>

        <div className="flex items-center justify-between pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={handleTestConnection}
            disabled={!savedSettings?.hasToken || isTesting || isSaving}
            isLoading={isTesting}
          >
            Uji Koneksi Read-Only
          </Button>

          <Button type="submit" variant="primary" isLoading={isSaving}>
            Simpan Pengaturan
          </Button>
        </div>
      </form>

      {/* Detail Teknis Status Kolom */}
      <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-xs">
        <button
          type="button"
          onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
          className="w-full min-h-[44px] py-2 flex items-center justify-between text-left text-base font-semibold text-zinc-900"
        >
          <span>Detail teknis status isian</span>
          {showTechnicalDetails ? (
            <ChevronDown className="w-5 h-5 text-zinc-500" />
          ) : (
            <ChevronRight className="w-5 h-5 text-zinc-500" />
          )}
        </button>

        {showTechnicalDetails && (
          <div className="mt-4 pt-3 border-t border-zinc-100 grid grid-cols-2 sm:grid-cols-4 gap-3 text-base">
            <div className="p-3 bg-zinc-50 rounded-lg">
              <div className="text-zinc-500 text-sm">Alamat Workspace</div>
              <div className="font-semibold text-zinc-800 mt-1">
                {Boolean(savedSettings?.workspaceUrl) ? "terisi" : "kosong"}
              </div>
            </div>
            <div className="p-3 bg-zinc-50 rounded-lg">
              <div className="text-zinc-500 text-sm">Token Akses</div>
              <div className="font-semibold text-zinc-800 mt-1">
                {Boolean(savedSettings?.hasToken) ? "terisi" : "kosong"}
              </div>
            </div>
            <div className="p-3 bg-zinc-50 rounded-lg">
              <div className="text-zinc-500 text-sm">Katalog (Catalog)</div>
              <div className="font-semibold text-zinc-800 mt-1">
                {Boolean(savedSettings?.catalog) ? "terisi" : "kosong"}
              </div>
            </div>
            <div className="p-3 bg-zinc-50 rounded-lg">
              <div className="text-zinc-500 text-sm">Skema (Schema)</div>
              <div className="font-semibold text-zinc-800 mt-1">
                {Boolean(savedSettings?.schema) ? "terisi" : "kosong"}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Hasil Uji Koneksi */}
      {testResult && (
        <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-zinc-900 border-b border-zinc-100 pb-2">
            Hasil Uji Koneksi
          </h2>

          <div className="space-y-3">
            {testResult.steps.map((st, idx) => (
              <div
                key={idx}
                className="flex items-start gap-3 text-base p-3.5 rounded-lg border border-zinc-100 bg-zinc-50/50"
              >
                {st.success ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                ) : (
                  <XCircle className="w-5 h-5 text-rose-600 mt-0.5 shrink-0" />
                )}
                <div className="space-y-0.5">
                  <div className="font-semibold text-zinc-900">{st.name}</div>
                  {st.message && (
                    <div className="text-zinc-600 text-sm">{st.message}</div>
                  )}
                  {st.fix && (
                    <div className="text-rose-600 text-sm font-mono">
                      {st.fix}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
