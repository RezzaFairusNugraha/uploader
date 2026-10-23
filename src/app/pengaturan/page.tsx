"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
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

export default function SettingsPage() {
  const [formData, setFormData] = useState<FormState>(initialFormState);
  const [savedSettings, setSavedSettings] = useState<MaskedSettings | null>(
    null,
  );
  const [isChangingToken, setIsChangingToken] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(
    null,
  );

  useEffect(() => {
    let active = true;

    fetch("/api/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active) {
          return;
        }

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
      })
      .catch(() => {})
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

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

      setSavedSettings(data.settings);
      setIsChangingToken(false);
      setFormData((prev) => ({ ...prev, token: "" }));
      notify.success("Pengaturan disimpan");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Terjadi kesalahan";
      notify.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);

    try {
      const res = await fetch("/api/settings/test", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Uji koneksi gagal dijalankan");
      }

      setTestResult(data.result);
      if (data.result.success) {
        notify.success("Koneksi berhasil");
      } else {
        const failedStep = data.result.steps?.find(
          (s: { success: boolean }) => !s.success,
        );
        notify.error(failedStep?.fix || "Koneksi gagal");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Uji koneksi gagal";
      notify.error(message);
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-12 text-center text-sm text-zinc-500">
        Memuat pengaturan...
      </div>
    );
  }

  const catalogDisplay = formData.catalog || "<katalog>";
  const schemaDisplay = formData.schema || "<skema>";

  return (
    <div className="space-y-8">
      <PageHeader
        title="Pengaturan"
        description="Konfigurasi koneksi Databricks dan Unity Catalog."
      />

      <form onSubmit={handleSave} className="space-y-6">
        <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-5">
          <h2 className="text-sm font-semibold text-zinc-900 border-b border-zinc-100 pb-3">
            Kredensial Databricks
          </h2>

          <Field
            id="workspaceUrl"
            label="URL Workspace"
            hint="Contoh: https://adb-123456789.azuredatabricks.net"
            name="workspaceUrl"
            value={formData.workspaceUrl}
            onChange={handleChange}
            placeholder="https://dbc-xxxx.cloud.databricks.com"
            required
          />

          <div>
            <label className="block text-sm font-medium text-zinc-900 mb-1.5">
              Personal Access Token (PAT)
            </label>

            {savedSettings?.hasToken && !isChangingToken ? (
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  disabled
                  value={savedSettings.tokenMasked}
                  className="flex-1 h-10 px-3 rounded-lg border border-zinc-200 bg-zinc-50 text-sm font-mono text-zinc-500 cursor-not-allowed"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsChangingToken(true)}
                >
                  Ganti token
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <input
                    type="password"
                    name="token"
                    value={formData.token}
                    onChange={handleChange}
                    placeholder="dapi..."
                    required={!savedSettings?.hasToken}
                    className="flex-1 h-10 px-3 rounded-lg border border-zinc-200 bg-white text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent transition"
                  />
                  {savedSettings?.hasToken && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setIsChangingToken(false);
                        setFormData((prev) => ({ ...prev, token: "" }));
                      }}
                    >
                      Batal
                    </Button>
                  )}
                </div>
                <p className="text-xs text-zinc-500">
                  Token disimpan dengan enkripsi AES-256-GCM pada disk lokal.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-5">
          <h2 className="text-sm font-semibold text-zinc-900 border-b border-zinc-100 pb-3">
            Target Unity Catalog
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              id="catalog"
              label="Katalog"
              hint="Nama katalog Unity Catalog"
              name="catalog"
              value={formData.catalog}
              onChange={handleChange}
              placeholder="main"
              required
            />

            <Field
              id="schema"
              label="Skema"
              hint="Nama skema / database"
              name="schema"
              value={formData.schema}
              onChange={handleChange}
              placeholder="sales"
              required
            />
          </div>

          <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 text-xs text-zinc-600 font-mono space-y-1">
            <div className="font-sans font-medium text-zinc-800 text-[13px] mb-1">
              Pola Lokasi Volume:
            </div>
            <div>
              /Volumes/{catalogDisplay}/{schemaDisplay}/&lt;Volume&gt;/csv/
            </div>
            <div>
              /Volumes/{catalogDisplay}/{schemaDisplay}/&lt;Volume&gt;/parquet/
            </div>
          </div>

          <Field
            id="maxFileSizeMb"
            label="Batas ukuran berkas (MB)"
            hint="Maksimal ukuran berkas yang dapat diunggah."
            type="number"
            name="maxFileSizeMb"
            min={1}
            max={1000}
            value={formData.maxFileSizeMb}
            onChange={handleChange}
            required
            className="w-full sm:w-48"
          />
        </div>

        <div className="flex items-center justify-between pt-2">
          <Button
            type="button"
            variant="secondary"
            disabled={!savedSettings?.configured || isTesting || isSaving}
            isLoading={isTesting}
            onClick={handleTestConnection}
          >
            Uji koneksi
          </Button>

          <Button type="submit" variant="primary" isLoading={isSaving}>
            Simpan pengaturan
          </Button>
        </div>
      </form>

      {testResult && (
        <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">
              Hasil Uji Koneksi
            </h2>
            <span className="text-xs text-zinc-500">
              {new Date(testResult.testedAt).toLocaleTimeString("id-ID", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
          </div>

          <div className="space-y-3">
            {testResult.steps.map((step, idx) => (
              <div
                key={idx}
                className="flex items-start gap-3 text-sm p-3 rounded-lg bg-zinc-50 border border-zinc-100"
              >
                {step.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-zinc-900">{step.name}</div>
                  {step.message && (
                    <div className="text-xs text-zinc-500 mt-0.5">
                      {step.message}
                    </div>
                  )}
                  {step.fix && (
                    <div className="text-xs text-indigo-600 mt-1 font-medium">
                      Saran: {step.fix}
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
