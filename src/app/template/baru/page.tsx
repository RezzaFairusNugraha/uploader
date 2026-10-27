"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Pencil,
  Plus,
  Upload,
  XCircle,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import Button from "@/components/Button";
import Callout from "@/components/Callout";
import Field from "@/components/Field";
import PageHeader from "@/components/PageHeader";
import {
  SortableColumnRow,
  DragOverlayColumnRow,
  type SortableColumnItemData,
} from "@/components/SortableColumnRow";
import { notify } from "@/lib/notify";
import type { MaskedSettings } from "@/lib/settings";
import { inferFromCsv, inferFromParquet } from "@/lib/templates/infer";
import {
  columnNameRegex,
  slugRegex,
  slugify,
  type ColumnDefinition,
  type ColumnRule,
  type ProvisionStepStatus,
  type TemplateDefinition,
  type TemplateDelimiter,
} from "@/lib/templates/schema";
import { arrayMove, generateStableColumnId } from "@/lib/templates/sortable";
import { sortableAccessibility } from "@/lib/templates/sortableAccessibility";

type RuleType = "text" | "integer" | "digits" | "decimal" | "date" | "list";

type ColumnDraft = SortableColumnItemData;

const defaultRules: Record<RuleType, ColumnRule> = {
  text: { type: "text" },
  integer: { type: "integer" },
  digits: { type: "digits", length: 9 },
  decimal: {
    type: "decimal",
    allowComma: true,
    allowDot: true,
    allowScientific: true,
  },
  date: { type: "date", format: "yyyy-MM-dd" },
  list: { type: "list", values: ["Aktif", "Nonaktif"] },
};

interface DiscoveredVolumeItem {
  name: string;
  catalog: string;
  schema: string;
  status: "sudah_template" | "belum_template" | "bukan_template";
  csvFiles: number;
  parquetFiles: number;
  unsupportedFormats: Array<{ ext: string; count: number }>;
  templateId?: string;
  templateName?: string;
}

interface TidakTerlihatItem {
  templateId: string;
  templateName: string;
  volumeName: string;
  catalog: string;
  schema: string;
  status: "tidak_terlihat";
}

export default function NewTemplatePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"sync" | "import" | "manual">("manual");
  const [settings, setSettings] = useState<MaskedSettings | null>(null);
  const [isSettingsConfigured, setIsSettingsConfigured] = useState(true);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [isSlugCustomized, setIsSlugCustomized] = useState(false);
  const [description, setDescription] = useState("");
  const [delimiter, setDelimiter] = useState<TemplateDelimiter>(";");
  const [csvFolder, setCsvFolder] = useState("csv");
  const [parquetFolder, setParquetFolder] = useState("parquet");
  const [isEditingFolders, setIsEditingFolders] = useState(false);
  const [userName, setUserName] = useState("");

  const [isVerifyingDraft, setIsVerifyingDraft] = useState(false);
  const [verifyingTemplateId, setVerifyingTemplateId] = useState<string | null>(null);
  const [verifyingVolumeName, setVerifyingVolumeName] = useState<string | null>(null);
  const [detectedWarnings, setDetectedWarnings] = useState<string[]>([]);
  const [detectedOtherGroups, setDetectedOtherGroups] = useState<
    Array<{ files: string[]; columns: string[]; count: number }>
  >([]);

  const [columns, setColumns] = useState<ColumnDraft[]>([
    {
      id: "col-1",
      name: "kode_material",
      required: true,
      type: "digits",
      rule: { type: "digits", length: 9 },
      isExpanded: false,
    },
    {
      id: "col-2",
      name: "tahun",
      required: true,
      type: "digits",
      rule: { type: "digits", length: 4 },
      isExpanded: false,
    },
    {
      id: "col-3",
      name: "persentase",
      required: true,
      type: "decimal",
      rule: {
        type: "decimal",
        allowComma: true,
        allowDot: true,
        allowScientific: true,
      },
      isExpanded: false,
    },
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [importedInfo, setImportedInfo] = useState<{
    fileName: string;
    sampleRowCount: number;
  } | null>(null);
  const [provisionSteps, setProvisionSteps] = useState<ProvisionStepStatus[] | null>(null);
  const [volumeExistsError, setVolumeExistsError] = useState<{
    message: string;
    templateId: string;
  } | null>(null);
  const [currentTemplateId, setCurrentTemplateId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const [catalogs, setCatalogs] = useState<string[]>([]);
  const [schemas, setSchemas] = useState<string[]>([]);
  const [selectedCatalog, setSelectedCatalog] = useState("");
  const [selectedSchema, setSelectedSchema] = useState("");
  const [discoveredVolumes, setDiscoveredVolumes] = useState<DiscoveredVolumeItem[]>([]);
  const [tidakTerlihatList, setTidakTerlihatList] = useState<TidakTerlihatItem[]>([]);
  const [selectedSyncVolumes, setSelectedSyncVolumes] = useState<Set<string>>(new Set());
  const [isLoadingDiscovery, setIsLoadingDiscovery] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [isBulkImporting, setIsBulkImporting] = useState(false);
  const [inspectingVolumeName, setInspectingVolumeName] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setColumns((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
    setActiveDragId(null);
  };

  const loadDraftForInspection = async (id: string) => {
    try {
      const res = await fetch(`/api/templates/${id}`);
      if (!res.ok) throw new Error("Gagal memuat template");
      const tpl: TemplateDefinition = await res.json();
      setName(tpl.name);
      setSlug(tpl.slug);
      setDescription(tpl.description || "");
      setDelimiter(tpl.delimiter);
      setCsvFolder(tpl.csvFolder ?? "csv");
      setParquetFolder(tpl.parquetFolder ?? "parquet");
      setVerifyingVolumeName(tpl.volume?.name || tpl.slug);
      setVerifyingTemplateId(tpl.id);
      setIsVerifyingDraft(true);
      setActiveTab("manual");

      const mappedCols: ColumnDraft[] = tpl.columns.map((c) => ({
        id: generateStableColumnId(),
        name: c.name,
        required: c.required,
        type: c.rule.type as RuleType,
        rule: c.rule,
        isExpanded: false,
      }));
      setColumns(mappedCols);
    } catch {
      notify.error("Template tidak ditemukan");
    }
  };

  const loadLocations = async (catalogToSelect?: string) => {
    try {
      const catQuery = catalogToSelect || selectedCatalog;
      const res = await fetch(
        `/api/databricks/locations${catQuery ? `?catalog=${encodeURIComponent(catQuery)}` : ""}`
      );
      if (!res.ok) return;
      const data = await res.json();
      if (data.catalogs) setCatalogs(data.catalogs);
      if (data.schemas) setSchemas(data.schemas);
      if (!selectedCatalog && data.defaultCatalog) setSelectedCatalog(data.defaultCatalog);
      if (!selectedSchema && data.defaultSchema) setSelectedSchema(data.defaultSchema);
    } catch {}
  };

  const loadDiscovery = async () => {
    if (!selectedCatalog || !selectedSchema) return;
    setIsLoadingDiscovery(true);
    setDiscoveryError(null);
    try {
      const res = await fetch(
        `/api/databricks/discover?catalog=${encodeURIComponent(selectedCatalog)}&schema=${encodeURIComponent(selectedSchema)}`
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal memuat folder penyimpanan Databricks");
      }
      setDiscoveredVolumes(data.volumes || []);
      setTidakTerlihatList(data.tidakTerlihat || []);
      setSelectedSyncVolumes(new Set());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan";
      setDiscoveryError(msg);
    } finally {
      setIsLoadingDiscovery(false);
    }
  };

  const resetForm = useCallback(() => {
    setName("");
    setSlug("");
    setIsSlugCustomized(false);
    setDescription("");
    setDelimiter(",");
    setCsvFolder("csv");
    setParquetFolder("parquet");
    setIsVerifyingDraft(false);
    setVerifyingTemplateId(null);
    setVerifyingVolumeName(null);
    setCurrentTemplateId(null);
    setProvisionSteps(null);
    setVolumeExistsError(null);
    setDetectedWarnings([]);
    setDetectedOtherGroups([]);
    setSelectedSyncVolumes(new Set());
    setColumns([
      {
        id: generateStableColumnId(),
        name: "",
        required: true,
        type: "text",
        rule: { type: "text" },
        isExpanded: true,
      },
    ]);
  }, []);

  const handleCancel = async () => {
    if (currentTemplateId && !isVerifyingDraft) {
      try {
        await fetch(`/api/templates/${currentTemplateId}`, {
          method: "DELETE",
        });
      } catch {}
    }
    resetForm();
    router.push("/template");
  };

  const handleGantiSlug = async () => {
    if (currentTemplateId && !isVerifyingDraft) {
      try {
        await fetch(`/api/templates/${currentTemplateId}`, {
          method: "DELETE",
        });
      } catch {}
      setCurrentTemplateId(null);
    }
    setVolumeExistsError(null);
    setProvisionSteps(null);
  };

  const handleCloseProvisionError = async () => {
    if (currentTemplateId && !isVerifyingDraft) {
      try {
        await fetch(`/api/templates/${currentTemplateId}`, {
          method: "DELETE",
        });
      } catch {}
      setCurrentTemplateId(null);
    }
    setProvisionSteps(null);
  };

  useEffect(() => {
    return () => {
      if (currentTemplateId && !isVerifyingDraft) {
        fetch(`/api/templates/${currentTemplateId}`, {
          method: "DELETE",
          keepalive: true,
        }).catch(() => {});
      }
    };
  }, [currentTemplateId, isVerifyingDraft]);

  useEffect(() => {
    const saved = localStorage.getItem("uploader_user_name");
    if (saved) setUserName(saved);

    fetch("/api/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.connection) {
          setIsSettingsConfigured(Boolean(data.configured));
        } else if (data?.settings) {
          setIsSettingsConfigured(Boolean(data.configured));
        } else {
          setIsSettingsConfigured(false);
        }
        if (data?.settings) {
          setSettings(data.settings);
          setSelectedCatalog(data.settings.catalog || "");
          setSelectedSchema(data.settings.schema || "");
        }
      })
      .catch(() => {
        setIsSettingsConfigured(false);
      });

    const searchParams = new URLSearchParams(window.location.search);
    const mode = searchParams.get("mode");
    const inspectId = searchParams.get("id");
    const action = searchParams.get("action");

    if (inspectId && action === "inspect") {
      loadDraftForInspection(inspectId);
    } else {
      resetForm();
      if (mode === "sync") {
        setActiveTab("sync");
      }
    }
  }, [resetForm]);

  useEffect(() => {
    if (activeTab === "sync") {
      loadLocations();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "sync" && selectedCatalog && selectedSchema) {
      loadDiscovery();
    }
  }, [activeTab, selectedCatalog, selectedSchema]);

  const handleNameChange = (val: string) => {
    setName(val);
    if (!isSlugCustomized && !isVerifyingDraft) {
      setSlug(slugify(val));
    }
  };

  const handleSlugChange = (val: string) => {
    if (isVerifyingDraft) return;
    setIsSlugCustomized(true);
    setSlug(val.trim().toLowerCase());
  };

  const columnContainerRef = useRef<HTMLDivElement>(null);
  const newlyAddedColumnIdRef = useRef<string | null>(null);

  const isSlugValid = slugRegex.test(slug);

  const columnNames = columns.map((c) => c.name.trim());
  const duplicateNames = new Set(
    columnNames.filter((item, index) => item && columnNames.indexOf(item) !== index)
  );

  const addColumn = () => {
    const newIdx = columns.length + 1;
    const newId = generateStableColumnId();
    newlyAddedColumnIdRef.current = newId;
    const newDraft: ColumnDraft = {
      id: newId,
      name: `kolom_${newIdx}`,
      required: true,
      type: "text",
      rule: { type: "text" },
      isExpanded: false,
    };
    setColumns((prev) => [...prev, newDraft]);
  };

  const removeColumn = (id: string) => {
    const targetIdx = columns.findIndex((c) => c.id === id);
    if (targetIdx === -1) return;
    const targetCol = columns[targetIdx];
    setColumns((prev) => prev.filter((c) => c.id !== id));
    notify.info(`Kolom ${targetCol.name} dihapus`, {
      action: {
        label: "Batalkan",
        onClick: () => {
          setColumns((current) => {
            const restored = [...current];
            const insertIdx = Math.min(targetIdx, restored.length);
            restored.splice(insertIdx, 0, targetCol);
            return restored;
          });
        },
      },
    });
  };

  const updateColumn = (id: string, patch: Partial<ColumnDraft>) => {
    setColumns((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const updated = { ...c, ...patch };
        if (patch.type && patch.type !== c.type) {
          updated.rule = { ...defaultRules[patch.type] };
        }
        return updated;
      })
    );
  };

  const updateColumnRule = (id: string, patchRule: Partial<ColumnRule>) => {
    setColumns((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        return {
          ...c,
          rule: { ...c.rule, ...patchRule } as ColumnRule,
        };
      })
    );
  };

  const runProvisioning = async (
    templateId: string,
    reuseExistingVolume: boolean = false
  ) => {
    setIsSubmitting(true);
    setVolumeExistsError(null);

    setProvisionSteps([
      { step: "save_definition", name: "Simpan definisi template", status: "success" },
      { step: "create_volume", name: "Buat volume di Unity Catalog", status: "running" },
      { step: "create_csv", name: "Buat folder csv/", status: "pending" },
      { step: "create_parquet", name: "Buat folder parquet/", status: "pending" },
      { step: "activate", name: "Aktifkan template", status: "pending" },
    ]);

    try {
      const res = await fetch(`/api/templates/${templateId}/provision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reuseExistingVolume }),
      });

      const data = await res.json();
      if (data.steps) {
        setProvisionSteps(data.steps);
      }

      if (!res.ok || !data.success) {
        if (data.volumeExists) {
          setVolumeExistsError({
            message: data.error || "Volume sudah ada di Unity Catalog.",
            templateId,
          });
        }
        throw new Error(data.error || "Gagal memproses template ke Databricks");
      }

      setCurrentTemplateId(null);
      notify.success("Template berhasil dibuat dan diaktifkan");
      setTimeout(() => {
        router.push("/template");
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan";
      notify.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileImport = async (file: File) => {
    setIsParsingFile(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      let inferred;

      if (ext === "csv" || ext === "txt") {
        const text = await file.text();
        inferred = inferFromCsv(text, file.name);
      } else if (ext === "parquet") {
        const buffer = await file.arrayBuffer();
        inferred = await inferFromParquet(buffer, file.name);
      } else {
        throw new Error("Format berkas harus berupa CSV (.csv) atau Parquet (.parquet)");
      }

      setName(inferred.name);
      setSlug(slugify(inferred.name));
      setIsSlugCustomized(false);
      setDelimiter(inferred.delimiter);

      const mappedColumns: ColumnDraft[] = inferred.columns.map((c) => ({
        id: generateStableColumnId(),
        name: c.name,
        originalName: c.originalName,
        renamed: c.renamed,
        required: c.required,
        type: c.type,
        rule: c.rule,
        isExpanded: false,
        observedMin: c.observedMin,
        observedMax: c.observedMax,
      }));

      setColumns(mappedColumns);
      setImportedInfo({
        fileName: file.name,
        sampleRowCount: inferred.sampleRowCount,
      });
      setActiveTab("manual");
      notify.success(`Berhasil mengimpor struktur dari ${file.name}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal membaca berkas";
      notify.error(msg);
    } finally {
      setIsParsingFile(false);
    }
  };

  const handleInspectVolume = async (volName: string) => {
    setInspectingVolumeName(volName);
    try {
      const res = await fetch("/api/databricks/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          catalog: selectedCatalog,
          schema: selectedSchema,
          volume: volName,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal memeriksa folder penyimpanan");
      }
      const inspectData = data.data;
      const draft = inspectData.draft;

      setName(draft.name);
      setSlug(draft.slug);
      setDelimiter(draft.delimiter);
      setCsvFolder(draft.csvFolder || "csv");
      setParquetFolder(draft.parquetFolder || "parquet");
      setVerifyingVolumeName(volName);
      setDetectedWarnings(inspectData.warnings || []);
      setDetectedOtherGroups(inspectData.otherGroups || []);
      setIsVerifyingDraft(true);

      const mappedCols: ColumnDraft[] = draft.columns.map((c: ColumnDefinition) => ({
        id: generateStableColumnId(),
        name: c.name,
        required: c.required,
        type: c.rule.type as RuleType,
        rule: c.rule,
        isExpanded: false,
      }));
      setColumns(mappedCols);
      setActiveTab("manual");
      notify.success(`Folder ${volName} berhasil diperiksa`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan";
      notify.error(msg);
    } finally {
      setInspectingVolumeName(null);
    }
  };

  const handleBulkImport = async () => {
    if (selectedSyncVolumes.size === 0) return;
    setIsBulkImporting(true);
    try {
      const res = await fetch("/api/databricks/import-drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          catalog: selectedCatalog,
          schema: selectedSchema,
          volumes: Array.from(selectedSyncVolumes),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal membuat draf");
      }
      notify.success(`${data.imported || 0} draf berhasil dibuat`);
      router.push("/template");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan";
      notify.error(msg);
    } finally {
      setIsBulkImporting(false);
    }
  };

  const handleFinish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSettingsConfigured) {
      notify.error("Pengaturan belum lengkap");
      return;
    }

    if (!isSlugValid) {
      notify.error("Nama folder tidak valid (3-60 huruf kecil, angka, atau _)");
      return;
    }

    if (duplicateNames.size > 0) {
      notify.error("Terdapat nama kolom duplikat");
      return;
    }

    if (columns.length === 0) {
      notify.error("Template minimal harus memiliki 1 kolom");
      return;
    }

    for (const c of columns) {
      if (!columnNameRegex.test(c.name.trim())) {
        notify.error(`Nama kolom '${c.name}' tidak valid`);
        return;
      }
    }

    if (isVerifyingDraft && !userName.trim()) {
      notify.error("Nama Anda wajib diisi untuk mengaktifkan template");
      return;
    }

    if (userName.trim()) {
      localStorage.setItem("uploader_user_name", userName.trim());
    }

    setIsSubmitting(true);
    setVolumeExistsError(null);

    const formattedColumns: ColumnDefinition[] = columns.map((c) => ({
      name: c.name.trim(),
      required: c.required,
      rule: c.rule,
    }));

    try {
      if (isVerifyingDraft && verifyingTemplateId) {
        const updateRes = await fetch(`/api/templates/${verifyingTemplateId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim(),
            delimiter,
            csvFolder: csvFolder.trim(),
            parquetFolder: parquetFolder.trim(),
            columns: formattedColumns,
            updatedBy: userName.trim(),
          }),
        });

        if (!updateRes.ok) {
          const errData = await updateRes.json().catch(() => null);
          throw new Error(errData?.error || "Gagal memperbarui draf template");
        }

        await runProvisioning(verifyingTemplateId, true);
        return;
      }

      const activeCat = selectedCatalog || settings?.catalog || "";
      const activeSch = selectedSchema || settings?.schema || "";
      const volumeNameToUse = verifyingVolumeName || slug;

      const createRes = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slug,
          description: description.trim(),
          delimiter,
          volume: {
            catalog: activeCat,
            schema: activeSch,
            name: volumeNameToUse,
          },
          csvFolder: csvFolder.trim(),
          parquetFolder: parquetFolder.trim(),
          volumeCreatedByApp: !isVerifyingDraft,
          columns: formattedColumns,
          createdBy: userName.trim() || undefined,
        }),
      });

      const created = await createRes.json();
      if (!createRes.ok) {
        throw new Error(created.error || "Gagal menyimpan template");
      }

      setCurrentTemplateId(created.id);
      await runProvisioning(created.id, isVerifyingDraft);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan";
      notify.error(msg);
      setIsSubmitting(false);
    }
  };

  const catalogDisplay = selectedCatalog || settings?.catalog || "<katalog>";
  const schemaDisplay = selectedSchema || settings?.schema || "<skema>";
  const slugDisplay = verifyingVolumeName || slug || "<folder>";

  const headerPreview = columns.map((c) => c.name.trim() || "<kolom>").join(delimiter);

  const candidateVolumes = useMemo(
    () => discoveredVolumes.filter((v) => v.status === "belum_template"),
    [discoveredVolumes]
  );
  const existingVolumes = useMemo(
    () => discoveredVolumes.filter((v) => v.status === "sudah_template"),
    [discoveredVolumes]
  );
  const otherFolderVolumes = useMemo(
    () => discoveredVolumes.filter((v) => v.status === "bukan_template"),
    [discoveredVolumes]
  );

  const isAllCandidatesSelected =
    candidateVolumes.length > 0 &&
    candidateVolumes.every((v) => selectedSyncVolumes.has(v.name));

  const toggleSelectAll = () => {
    if (isAllCandidatesSelected) {
      setSelectedSyncVolumes(new Set());
    } else {
      setSelectedSyncVolumes(new Set(candidateVolumes.map((v) => v.name)));
    }
  };

  const toggleVolumeSelect = (volName: string) => {
    setSelectedSyncVolumes((prev) => {
      const next = new Set(prev);
      if (next.has(volName)) {
        next.delete(volName);
      } else {
        next.add(volName);
      }
      return next;
    });
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title={isVerifyingDraft ? "Periksa dan Aktifkan Template" : "Buat Template"}
        description={
          isVerifyingDraft
            ? "Periksa kolom hasil pembacaan otomatis dari Databricks sebelum mengaktifkan template."
            : "Definisikan aturan kolom atau buat otomatis dari folder di Databricks."
        }
      />

      {!isVerifyingDraft && (
        <div className="flex border border-zinc-200 rounded-xl p-1 bg-zinc-100/70 max-w-lg">
          <button
            type="button"
            onClick={() => setActiveTab("sync")}
            className={`flex-1 min-h-[44px] py-2 px-3 text-sm font-medium rounded-lg transition-all ${
              activeTab === "sync"
                ? "bg-white text-zinc-900 shadow-xs"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            Dari folder di Databricks
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("import")}
            className={`flex-1 min-h-[44px] py-2 px-3 text-sm font-medium rounded-lg transition-all ${
              activeTab === "import"
                ? "bg-white text-zinc-900 shadow-xs"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            Dari file contoh
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("manual")}
            className={`flex-1 min-h-[44px] py-2 px-3 text-sm font-medium rounded-lg transition-all ${
              activeTab === "manual"
                ? "bg-white text-zinc-900 shadow-xs"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            Isi sendiri
          </button>
        </div>
      )}

      {activeTab === "sync" && !isVerifyingDraft && (
        <div className="space-y-6">
          <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-semibold text-zinc-900 border-b border-zinc-100 pb-3">
              Lokasi di Databricks
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  Katalog (Catalog)
                </label>
                {catalogs.length > 0 ? (
                  <select
                    value={selectedCatalog}
                    onChange={(e) => {
                      setSelectedCatalog(e.target.value);
                      loadLocations(e.target.value);
                    }}
                    className="w-full h-11 px-3 text-base bg-white border border-zinc-200 rounded-lg text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  >
                    {catalogs.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={selectedCatalog}
                    onChange={(e) => setSelectedCatalog(e.target.value)}
                    placeholder="Nama katalog"
                    className="w-full h-11 px-3 text-base bg-white border border-zinc-200 rounded-lg text-zinc-900"
                  />
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  Skema (Schema)
                </label>
                {schemas.length > 0 ? (
                  <select
                    value={selectedSchema}
                    onChange={(e) => setSelectedSchema(e.target.value)}
                    className="w-full h-11 px-3 text-base bg-white border border-zinc-200 rounded-lg text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  >
                    {schemas.map((sch) => (
                      <option key={sch} value={sch}>
                        {sch}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={selectedSchema}
                    onChange={(e) => setSelectedSchema(e.target.value)}
                    placeholder="Nama skema"
                    className="w-full h-11 px-3 text-base bg-white border border-zinc-200 rounded-lg text-zinc-900"
                  />
                )}
              </div>
            </div>
          </div>

          <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-100 pb-4">
              <div className="flex items-center gap-2.5 shrink-0">
                <h2 className="text-base font-semibold text-zinc-900 whitespace-nowrap">
                  Folder Penyimpanan
                </h2>
                <span className="text-xs px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-600 font-medium whitespace-nowrap">
                  {discoveredVolumes.length} folder
                </span>
              </div>
              {candidateVolumes.length > 0 && (
                <div className="flex flex-wrap sm:flex-nowrap items-center gap-3">
                  <label className="inline-flex items-center gap-2 text-sm text-zinc-700 cursor-pointer min-h-[44px] px-2 py-1 rounded-lg hover:bg-zinc-50 select-none whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={isAllCandidatesSelected}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-600 cursor-pointer shrink-0"
                    />
                    <span className="whitespace-nowrap font-medium">Pilih semua</span>
                  </label>
                  <Button
                    type="button"
                    variant="primary"
                    disabled={selectedSyncVolumes.size === 0 || isBulkImporting}
                    isLoading={isBulkImporting}
                    onClick={handleBulkImport}
                    className="whitespace-nowrap min-h-[44px]"
                  >
                    Buat draf dari yang dipilih ({selectedSyncVolumes.size})
                  </Button>
                </div>
              )}
            </div>

            {isLoadingDiscovery ? (
              <div className="py-12 space-y-3">
                <div className="h-12 bg-zinc-100 rounded-xl animate-pulse" />
                <div className="h-12 bg-zinc-100 rounded-xl animate-pulse" />
                <div className="h-12 bg-zinc-100 rounded-xl animate-pulse" />
              </div>
            ) : discoveryError ? (
              <div className="py-8 text-center space-y-3">
                <p className="text-sm text-rose-700 font-medium">{discoveryError}</p>
                <Button type="button" variant="secondary" onClick={loadDiscovery}>
                  Coba lagi
                </Button>
              </div>
            ) : discoveredVolumes.length === 0 ? (
              <div className="py-12 text-center text-sm text-zinc-500">
                Tidak ada folder yang bisa dilihat dengan koneksi ini.
              </div>
            ) : (
              <div className="space-y-3">
                {candidateVolumes.map((vol) => (
                  <div
                    key={vol.name}
                    className="p-4 border border-zinc-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-zinc-300 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedSyncVolumes.has(vol.name)}
                        onChange={() => toggleVolumeSelect(vol.name)}
                        className="w-4 h-4 mt-1 rounded text-indigo-600 focus:ring-indigo-600"
                      />
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-zinc-900 text-base">
                            {vol.name}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 border border-zinc-200 font-medium">
                            Belum jadi template
                          </span>
                        </div>
                        <p className="text-sm text-zinc-500">
                          {vol.csvFiles} file CSV · {vol.parquetFiles} file Parquet
                        </p>
                        {vol.unsupportedFormats.length > 0 && (
                          <p className="text-xs text-zinc-400">
                            Format lain:{" "}
                            {vol.unsupportedFormats
                              .map((f) => `${f.count} file ${f.ext}`)
                              .join(", ")}{" "}
                            (belum bisa dibaca)
                          </p>
                        )}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={inspectingVolumeName === vol.name}
                      isLoading={inspectingVolumeName === vol.name}
                      onClick={() => handleInspectVolume(vol.name)}
                      className="whitespace-nowrap min-h-[44px]"
                    >
                      Buat template
                    </Button>
                  </div>
                ))}

                {existingVolumes.map((vol) => (
                  <div
                    key={vol.name}
                    className="p-4 border border-zinc-200 bg-zinc-50/50 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-zinc-900 text-base">
                          {vol.name}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                          Sudah jadi template
                        </span>
                      </div>
                      <p className="text-sm text-zinc-500">
                        {vol.csvFiles} file CSV · {vol.parquetFiles} file Parquet
                      </p>
                    </div>
                    <Link href="/template">
                      <Button type="button" variant="ghost" className="whitespace-nowrap">
                        Lihat template
                      </Button>
                    </Link>
                  </div>
                ))}

                {otherFolderVolumes.length > 0 && (
                  <details className="border border-zinc-200 rounded-xl p-4 bg-zinc-50 space-y-3">
                    <summary className="cursor-pointer font-medium text-sm text-zinc-700 select-none">
                      Folder lain ({otherFolderVolumes.length})
                    </summary>
                    <div className="pt-2 divide-y divide-zinc-200">
                      {otherFolderVolumes.map((vol) => (
                        <div key={vol.name} className="py-2.5 flex items-center justify-between">
                          <span className="text-sm text-zinc-700">{vol.name}</span>
                          <span className="text-xs text-zinc-400">Belum ada file</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}
          </div>

          {tidakTerlihatList.length > 0 && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2 text-amber-900">
              <div className="flex items-center gap-2 font-medium">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                <span>Template yang folder-nya tidak terlihat</span>
              </div>
              <p className="text-sm text-amber-800">
                Folder tidak terlihat oleh koneksi saat ini. Mungkin koneksi diganti atau izin berubah.
              </p>
              <div className="pt-1 flex flex-wrap gap-2">
                {tidakTerlihatList.map((t) => (
                  <span
                    key={t.templateId}
                    className="inline-flex items-center px-3 py-1 bg-white border border-amber-300 rounded-md text-xs font-medium text-amber-900"
                  >
                    {t.templateName} ({t.volumeName})
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "import" && !isVerifyingDraft && (
        <div className="bg-white border-2 border-dashed border-zinc-300 rounded-2xl p-8 text-center hover:border-indigo-400 transition-colors">
          <input
            type="file"
            id="file-import-input"
            accept=".csv,.parquet"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileImport(file);
              e.target.value = "";
            }}
          />
          <label
            htmlFor="file-import-input"
            className="cursor-pointer flex flex-col items-center justify-center space-y-3"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file) handleFileImport(file);
            }}
          >
            <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
              {isParsingFile ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <Upload className="w-6 h-6" />
              )}
            </div>
            <div>
              <div className="text-base font-semibold text-zinc-900">
                {isParsingFile
                  ? "Menganalisis berkas..."
                  : "Pilih atau seret berkas CSV / Parquet ke sini"}
              </div>
              <p className="text-sm text-zinc-500 mt-1 max-w-sm mx-auto">
                Berkas dibaca langsung di peramban tanpa diunggah atau disimpan ke server.
              </p>
            </div>
            <div className="pt-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-700 bg-indigo-50 rounded-lg border border-indigo-100">
                <FileSpreadsheet className="w-4 h-4" />
                Mendukung .csv (maks 5.000 baris) & .parquet
              </span>
            </div>
          </label>
        </div>
      )}

      {isVerifyingDraft && (
        <div className="space-y-4">
          {detectedWarnings.length > 0 && (
            <Callout type="warning" title="Catatan Pemeriksaan Otomatis">
              <ul className="list-disc list-inside space-y-1">
                {detectedWarnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </Callout>
          )}

          {detectedOtherGroups.length > 0 && (
            <details className="border border-amber-200 bg-amber-50 rounded-xl p-4 text-sm text-amber-900">
              <summary className="cursor-pointer font-medium select-none">
                Lihat daftar berkas yang kolomnya berbeda
              </summary>
              <div className="mt-2 space-y-2 pt-2 border-t border-amber-200">
                {detectedOtherGroups.map((g, idx) => (
                  <div key={idx} className="space-y-1">
                    <p className="font-semibold text-amber-950">
                      Kolom: {g.columns.join(", ")}
                    </p>
                    <ul className="list-disc list-inside text-xs text-amber-800">
                      {g.files.map((fname, fidx) => (
                        <li key={fidx}>{fname}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
          )}

          <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm text-zinc-700">
            <div>
              <span>Folder yang dibaca sistem data: </span>
              <span className="font-semibold text-zinc-900">
                {csvFolder || "(akar folder)"}, {parquetFolder || "(akar folder)"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsEditingFolders((prev) => !prev)}
              className="text-indigo-600 hover:text-indigo-800 font-medium underline inline-flex items-center gap-1 cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>{isEditingFolders ? "Tutup" : "Ubah"}</span>
            </button>
          </div>

          {isEditingFolders && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white border border-zinc-200 rounded-xl p-4">
              <Field
                id="csv-folder-edit"
                label="Folder CSV"
                name="csvFolder"
                value={csvFolder}
                onChange={(e) => setCsvFolder(e.target.value)}
                hint="Kosongkan jika file berada di akar folder"
              />
              <Field
                id="parquet-folder-edit"
                label="Folder Parquet"
                name="parquetFolder"
                value={parquetFolder}
                onChange={(e) => setParquetFolder(e.target.value)}
                hint="Kosongkan jika file berada di akar folder"
              />
            </div>
          )}
        </div>
      )}

      {activeTab === "manual" && (
        <form onSubmit={handleFinish} className="space-y-6">
          <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-semibold text-zinc-900 border-b border-zinc-100 pb-3">
              Informasi Template
            </h2>

            <Field
              id="template-name"
              label="Nama Template"
              name="name"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Target Brand Distribution"
              required
            />

            <div>
              <Field
                id="template-slug"
                label="Volume Template"
                hint={
                  isVerifyingDraft
                    ? "Terkunci sesuai folder penyimpanan di Databricks."
                    : "Digunakan untuk penamaan folder volume di Unity Catalog (3-60 karakter, huruf kecil, angka, _)."
                }
                name="slug"
                value={slug}
                disabled={isVerifyingDraft}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="target_brand_distribution"
                required
                error={
                  slug && !isSlugValid && !isVerifyingDraft
                    ? "Format Volume tidak valid"
                    : undefined
                }
              />
            </div>

            <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 text-sm text-zinc-600 font-mono space-y-1">
              <div className="font-sans font-medium text-zinc-800 text-sm mb-1">
                Pratinjau Lokasi Volume di Databricks:
              </div>
              <div>
                /Volumes/{catalogDisplay}/{schemaDisplay}/{slugDisplay}/{csvFolder ? `${csvFolder}/` : ""}
              </div>
              <div>
                /Volumes/{catalogDisplay}/{schemaDisplay}/{slugDisplay}/{parquetFolder ? `${parquetFolder}/` : ""}
              </div>
            </div>

            <div>
              <label
                htmlFor="template-description"
                className="block text-base font-medium text-zinc-700 mb-1.5"
              >
                Deskripsi (Opsional)
              </label>
              <textarea
                id="template-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Keterangan isi dan tujuan data..."
                rows={2}
                className="w-full px-3 py-2.5 text-base bg-white text-zinc-900 border border-zinc-200 rounded-lg placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 transition"
              />
            </div>

            <div>
              <label className="block text-base font-medium text-zinc-700 mb-1.5">
                Pemisah CSV (Delimiter)
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 min-h-[44px] text-base text-zinc-700 cursor-pointer">
                  <input
                    type="radio"
                    name="delimiter"
                    value=";"
                    checked={delimiter === ";"}
                    onChange={() => setDelimiter(";")}
                    className="w-4 h-4 text-indigo-600 focus:ring-indigo-600"
                  />
                  Titik koma (;)
                </label>
                <label className="flex items-center gap-2 min-h-[44px] text-base text-zinc-700 cursor-pointer">
                  <input
                    type="radio"
                    name="delimiter"
                    value=","
                    checked={delimiter === ","}
                    onChange={() => setDelimiter(",")}
                    className="w-4 h-4 text-indigo-600 focus:ring-indigo-600"
                  />
                  Koma (,)
                </label>
              </div>
            </div>

            {isVerifyingDraft && (
              <div>
                <Field
                  id="user-name-activate"
                  label="Nama Anda"
                  name="userName"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="Contoh: Budi Santoso"
                  hint="Dicatat dalam riwayat versi sebagai pihak yang mengaktifkan template"
                  required
                />
              </div>
            )}
          </div>

          <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-zinc-900">Kolom</h2>
                <span className="text-sm px-2.5 py-0.5 rounded-full bg-zinc-100 text-zinc-600 font-medium">
                  {columns.length} kolom
                </span>
              </div>
              <Button type="button" variant="secondary" onClick={addColumn}>
                <Plus className="w-4 h-4 mr-1 inline" />
                Tambah kolom
              </Button>
            </div>

            {duplicateNames.size > 0 && (
              <Callout type="error" title="Kolom Duplikat">
                Nama kolom berikut tidak boleh sama: {Array.from(duplicateNames).join(", ")}
              </Callout>
            )}

            {columns.length === 0 ? (
              <div className="py-12 text-center border-2 border-dashed border-zinc-200 rounded-xl space-y-3">
                <p className="text-base text-zinc-500">Belum ada kolom.</p>
                <div>
                  <Button type="button" variant="primary" onClick={addColumn}>
                    <Plus className="w-4 h-4 mr-1.5 inline" />
                    Tambah kolom
                  </Button>
                </div>
              </div>
            ) : (
              <div ref={columnContainerRef} className="space-y-3">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  accessibility={sortableAccessibility}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={columns.map((c) => c.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-3">
                      {columns.map((col, idx) => {
                        const isDuplicate = duplicateNames.has(col.name.trim());
                        const isInvalidName =
                          col.name.trim() && !columnNameRegex.test(col.name.trim());

                        return (
                          <div key={col.id} id={col.id}>
                            <SortableColumnRow
                              col={col}
                              index={idx}
                              total={columns.length}
                              isDuplicate={isDuplicate}
                              isInvalidName={Boolean(isInvalidName)}
                              onUpdate={(patch) => updateColumn(col.id, patch)}
                              onUpdateRule={(patch) => updateColumnRule(col.id, patch)}
                              onRemove={() => removeColumn(col.id)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </SortableContext>
                  <DragOverlay>
                    {activeDragId ? (
                      (() => {
                        const activeCol = columns.find((c) => c.id === activeDragId);
                        return activeCol ? <DragOverlayColumnRow col={activeCol} /> : null;
                      })()
                    ) : null}
                  </DragOverlay>
                </DndContext>
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-zinc-100">
              {importedInfo && (
                <div className="mb-3 p-3 bg-amber-50/80 border border-amber-200 rounded-lg text-sm text-amber-900">
                  <span className="font-medium">Catatan impor:</span> Aturan ditebak dari{" "}
                  {importedInfo.sampleRowCount.toLocaleString("id-ID")} baris berkas{" "}
                  <span className="font-semibold">{importedInfo.fileName}</span>, periksa sebelum menyimpan.
                </div>
              )}

              <div className="text-sm font-semibold text-zinc-700 mb-1">
                Pratinjau Baris Header CSV:
              </div>
              <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 font-mono text-sm text-zinc-800 overflow-x-auto whitespace-nowrap">
                {headerPreview || "(Belum ada kolom)"}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={handleCancel}
              disabled={isSubmitting}
            >
              Batal
            </Button>

            <Button
              type="submit"
              variant="primary"
              disabled={!isSettingsConfigured || isSubmitting}
              isLoading={isSubmitting}
            >
              {isVerifyingDraft ? "Aktifkan template" : "Selesai"}
            </Button>
          </div>
        </form>
      )}

      {(provisionSteps || volumeExistsError) && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-zinc-200 max-w-lg w-full p-6 shadow-xl space-y-5 animate-in fade-in zoom-in-95">
            <div>
              <h3 className="text-lg font-semibold text-zinc-900">
                Memproses Template
              </h3>
              <p className="text-sm text-zinc-500 mt-0.5">
                Mempersiapkan folder penyimpanan di Databricks.
              </p>
            </div>

            <div className="space-y-3">
              {provisionSteps?.map((step, idx) => (
                <div key={idx} className="flex items-start gap-3 text-sm">
                  {step.status === "success" && (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                  )}
                  {step.status === "running" && (
                    <Loader2 className="w-5 h-5 text-indigo-600 animate-spin mt-0.5 shrink-0" />
                  )}
                  {step.status === "error" && (
                    <XCircle className="w-5 h-5 text-rose-600 mt-0.5 shrink-0" />
                  )}
                  {step.status === "pending" && (
                    <div className="w-5 h-5 rounded-full border border-zinc-300 mt-0.5 shrink-0" />
                  )}

                  <div className="flex-1">
                    <div
                      className={`font-medium ${
                        step.status === "error"
                          ? "text-rose-900"
                          : step.status === "success"
                            ? "text-zinc-900"
                            : "text-zinc-500"
                      }`}
                    >
                      {step.name}
                    </div>
                    {step.message && (
                      <div className="text-zinc-500 mt-0.5">{step.message}</div>
                    )}
                    {step.fix && (
                      <div className="text-rose-600 font-medium mt-0.5">
                        {step.fix}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {volumeExistsError && currentTemplateId && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm space-y-3">
                <div className="flex items-start gap-2 text-amber-900 font-medium">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>{volumeExistsError.message}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    type="button"
                    variant="primary"
                    disabled={isSubmitting}
                    onClick={() => runProvisioning(currentTemplateId, true)}
                  >
                    Gunakan folder yang ada
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isSubmitting}
                    onClick={handleGantiSlug}
                  >
                    Ganti slug
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={isSubmitting}
                    onClick={handleCancel}
                    className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                  >
                    Batalkan pembuatan
                  </Button>
                </div>
              </div>
            )}

            {provisionSteps?.some((s) => s.status === "error") &&
              !volumeExistsError &&
              currentTemplateId && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-100">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleCancel}
                    className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                  >
                    Batalkan pembuatan
                  </Button>
                  <div className="flex items-center gap-2 ml-auto">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleCloseProvisionError}
                    >
                      Tutup
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      disabled={isSubmitting}
                      onClick={() => runProvisioning(currentTemplateId, false)}
                    >
                      Coba lagi
                    </Button>
                  </div>
                </div>
              )}
          </div>
        </div>
      )}
    </div>
  );
}
