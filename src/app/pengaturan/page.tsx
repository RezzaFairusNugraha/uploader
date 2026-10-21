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
  volume: string;
  subfolderCsv: string;
  subfolderParquet: string;
  maxFileSizeMb: number;
}

const initialFormState: FormState = {
  workspaceUrl: "",
  token: "",
  catalog: "",
  schema: "",
  volume: "",
  subfolderCsv: "csv",
  subfolderParquet: "parquet",
  maxFileSizeMb: 100,
};

export default function SettingsPage() {
  const [formData, setFormData] = useState<FormState>(initialFormState);
  const [savedSettings, setSavedSettings] = useState<MaskedSettings | null>(null);
  const [isChangingToken, setIsChangingToken] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);

  useEffect(() => {
    let active = true;

    fetch("/api/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active) {
          return;
        }
        if (data && data.configured) {
          setSavedSettings(data);
          setFormData({
            workspaceUrl: data.workspaceUrl || "",
            token: "",
            catalog: data.catalog || "",
            schema: data.schema || "",
            volume: data.volume || "",
            subfolderCsv: data.subfolderCsv || "csv",
            subfolderParquet: data.subfolderParquet || "parquet",
            maxFileSizeMb: data.maxFileSizeMb || 100,
          });
          if (data.lastTestResult) {
            setTestResult(data.lastTestResult);
          }
        }
        setIsLoading(false);
      })
      .catch(() => {
        if (active) {
          notify.error("Gagal memuat pengaturan tersimpan");
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const handleChange = (
    field: keyof FormState,
    value: string | number
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async (): Promise<boolean> => {
    setIsSaving(true);

    const payload = {
      workspaceUrl: formData.workspaceUrl,
      catalog: formData.catalog,
      schema: formData.schema,
      volume: formData.volume,
      subfolderCsv: formData.subfolderCsv,
      subfolderParquet: formData.subfolderParquet,
      maxFileSizeMb: Number(formData.maxFileSizeMb) || 100,
      token: formData.token.trim() || undefined,
    };

    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result) {
        notify.error("Validasi pengaturan gagal", {
          description:
            (result && result.error) ||
            `Gagal menyimpan pengaturan (status ${response.status})`,
        });
        setIsSaving(false);
        return false;
      }

      setSavedSettings(result.settings);
      const replacedToken = isChangingToken && formData.token.trim().length > 0;
      setIsChangingToken(false);
      setFormData((prev) => ({ ...prev, token: "" }));
      if (replacedToken) {
        notify.success("Token diganti");
      } else {
        notify.success("Pengaturan disimpan");
      }
      window.dispatchEvent(new Event("databricks-status-updated"));
      setIsSaving(false);
      return true;
    } catch {
      notify.error("Kesalahan jaringan", {
        description: "Gagal terhubung ke server saat menyimpan",
      });
      setIsSaving(false);
      return false;
    }
  };

  const isFormDirty = (): boolean => {
    if (!savedSettings) {
      return true;
    }
    if (formData.token.trim().length > 0) {
      return true;
    }
    return (
      formData.workspaceUrl !== savedSettings.workspaceUrl ||
      formData.catalog !== savedSettings.catalog ||
      formData.schema !== savedSettings.schema ||
      formData.volume !== savedSettings.volume ||
      formData.subfolderCsv !== savedSettings.subfolderCsv ||
      formData.subfolderParquet !== savedSettings.subfolderParquet ||
      Number(formData.maxFileSizeMb) !== savedSettings.maxFileSizeMb
    );
  };

  const handleTestConnection = async () => {
    if (isFormDirty()) {
      const savedOk = await handleSave();
      if (!savedOk) {
        return;
      }
    }

    setIsTesting(true);

    try {
      const response = await fetch("/api/settings/test", {
        method: "POST",
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data) {
        notify.error("Tes koneksi gagal", {
          description:
            (data && data.error) ||
            `Gagal menjalankan tes koneksi (status ${response.status})`,
        });
        setIsTesting(false);
        return;
      }

      const res = data.result as ConnectionTestResult;
      setTestResult(res);
      window.dispatchEvent(new Event("databricks-status-updated"));

      if (res.success) {
        notify.success("Koneksi berhasil", {
          description: "Volume utama dan subfolder terjangkau",
        });
      } else {
        const failedStep = res.steps.find((s) => !s.success);
        notify.error("Koneksi gagal", {
          description: failedStep?.fix || failedStep?.message || "Periksa konfigurasi Databricks",
        });
      }
    } catch {
      notify.error("Koneksi terputus saat menguji server");
    } finally {
      setIsTesting(false);
    }
  };

  const catalogName = formData.catalog.trim() || "<catalog>";
  const schemaName = formData.schema.trim() || "<schema>";
  const volumeName = formData.volume.trim() || "<volume>";
  const csvSub = formData.subfolderCsv.trim() || "csv";
  const parquetSub = formData.subfolderParquet.trim() || "parquet";

  const destinationCsv = `/Volumes/${catalogName}/${schemaName}/${volumeName}/${csvSub}/`;
  const destinationParquet = `/Volumes/${catalogName}/${schemaName}/${volumeName}/${parquetSub}/`;

  if (isLoading) {
    return (
      <div>
        <PageHeader
          title="Pengaturan"
          description="Kredensial Databricks Files API dan lokasi target Volume."
        />
        <div className="bg-white border border-zinc-200 rounded-xl p-12 text-center text-sm text-zinc-500">
          Memuat konfigurasi...
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Pengaturan"
        description="Kredensial Databricks Files API dan lokasi target Volume."
      />

      <div className="space-y-6">
        <div className="bg-white border border-zinc-200 rounded-xl p-6 sm:p-8 space-y-6">
          <Field
            id="workspaceUrl"
            label="Workspace URL"
            placeholder="https://dbc-xxxx.cloud.databricks.com"
            value={formData.workspaceUrl}
            onChange={(e) => handleChange("workspaceUrl", e.target.value)}
          />

          <div>
            <label
              htmlFor="token"
              className="block text-sm font-medium text-zinc-700 mb-1.5"
            >
              Personal Access Token
            </label>
            {savedSettings?.hasToken && !isChangingToken ? (
              <div className="flex items-center gap-3">
                <div className="h-10 flex-1 px-3 flex items-center bg-zinc-50 border border-zinc-200 rounded-lg text-sm font-mono text-zinc-600">
                  {savedSettings.tokenMasked}
                </div>
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
                    id="token"
                    type="password"
                    placeholder="dapi..."
                    value={formData.token}
                    onChange={(e) => handleChange("token", e.target.value)}
                    className="h-10 flex-1 px-3 text-sm bg-white text-zinc-900 border border-zinc-200 rounded-lg placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 transition-colors"
                  />
                  {savedSettings?.hasToken && isChangingToken ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setIsChangingToken(false);
                        handleChange("token", "");
                      }}
                    >
                      Batal
                    </Button>
                  ) : null}
                </div>
                <p className="text-xs text-zinc-500">
                  Token disimpan dengan enkripsi AES-256-GCM di server dan tidak pernah dikirimkan kembali ke peramban.
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field
              id="catalog"
              label="Catalog"
              placeholder="databricks_catalog"
              value={formData.catalog}
              onChange={(e) => handleChange("catalog", e.target.value)}
            />
            <Field
              id="schema"
              label="Schema"
              placeholder="databricks_schema"
              value={formData.schema}
              onChange={(e) => handleChange("schema", e.target.value)}
            />
            <Field
              id="volume"
              label="Volume"
              placeholder="file_storage"
              value={formData.volume}
              onChange={(e) => handleChange("volume", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              id="subfolderCsv"
              label="Subfolder CSV"
              placeholder="csv"
              value={formData.subfolderCsv}
              onChange={(e) => handleChange("subfolderCsv", e.target.value)}
            />
            <Field
              id="subfolderParquet"
              label="Subfolder Parquet"
              placeholder="parquet"
              value={formData.subfolderParquet}
              onChange={(e) => handleChange("subfolderParquet", e.target.value)}
            />
          </div>

          <Field
            id="maxFileSizeMb"
            label="Batas ukuran file (MB)"
            type="number"
            min={1}
            value={formData.maxFileSizeMb}
            onChange={(e) => handleChange("maxFileSizeMb", Number(e.target.value))}
          />

          <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-lg">
            <p className="text-xs font-medium text-zinc-600 mb-1.5">
              Destinasi target Volume (read-only):
            </p>
            <div className="space-y-1 font-mono text-xs text-zinc-800">
              <p className="break-all">{destinationCsv}</p>
              <p className="break-all">{destinationParquet}</p>
            </div>
          </div>

          <div className="pt-2 flex items-center gap-3">
            <Button
              type="button"
              variant="primary"
              isLoading={isSaving}
              onClick={() => handleSave()}
            >
              Simpan
            </Button>
            <Button
              type="button"
              variant="secondary"
              isLoading={isTesting}
              onClick={handleTestConnection}
            >
              Tes Koneksi
            </Button>
          </div>
        </div>

        {testResult ? (
          <div className="bg-white border border-zinc-200 rounded-xl p-6 sm:p-8 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200">
              <h2 className="text-base font-semibold text-zinc-900">
                Hasil Uji Koneksi
              </h2>
              <span className="text-xs text-zinc-500">
                Diuji pada: {new Date(testResult.testedAt).toLocaleTimeString("id-ID")}
              </span>
            </div>

            <div className="divide-y divide-zinc-100">
              {testResult.steps.map((step, idx) => (
                <div key={idx} className="py-3 flex items-start gap-3">
                  {step.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-zinc-900">
                        {step.name}
                      </p>
                      <span
                        className={`text-xs font-medium ${
                          step.success ? "text-emerald-700" : "text-rose-700"
                        }`}
                      >
                        {step.success ? "Berhasil" : "Gagal"}
                      </span>
                    </div>
                    {step.message && !step.success ? (
                      <p className="text-xs text-rose-600">{step.message}</p>
                    ) : null}
                    {step.fix ? (
                      <p className="text-xs text-zinc-500">{step.fix}</p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            <p className="pt-2 text-xs text-zinc-500 italic">
              Izin tulis baru terbukti saat unggah pertama.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
