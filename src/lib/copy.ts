export const GLOSSARY = {
  volume: "Folder penyimpanan",
  slug: "Nama folder",
  delimiter: "Pemisah kolom",
  validasi: "Pemeriksaan",
  rule: "Aturan pengisian",
  required: "Wajib diisi",
  status: {
    membuat: "Sedang disiapkan",
    aktif: "Siap dipakai",
    gagal: "Gagal disiapkan",
    diarsipkan: "Nonaktif",
    draf: "Draf",
    draf_deteksi: "Draf, perlu diperiksa",
  },
} as const;

export interface FriendlyError {
  judul: string;
  saran: string;
}

export function mapFriendlyError(err: unknown): FriendlyError {
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";

  if (message.includes("403") || message.includes("permission") || message.includes("izin")) {
    return {
      judul: "Akses penyimpanan ditolak",
      saran: "Hubungi administrator untuk memastikan akun layanan memiliki izin penulisan pada folder penyimpanan.",
    };
  }

  if (message.includes("401") || message.includes("token")) {
    return {
      judul: "Kunci akses tidak sah atau kedaluwarsa",
      saran: "Kunci akses penyimpanan perlu diperbarui. Hubungi admin.",
    };
  }

  if (message.includes("404") || message.includes("tidak ditemukan")) {
    return {
      judul: "Data atau folder tujuan tidak ditemukan",
      saran: "Pastikan template yang Anda pilih masih aktif dan folder penyimpanan telah tersedia.",
    };
  }

  if (message.includes("409") || message.includes("sudah ada") || message.includes("conflict")) {
    return {
      judul: "Data atau nama yang dimasukkan sudah terdaftar",
      saran: "Gunakan nama atau versi lain yang belum pernah dipakai sebelumnya.",
    };
  }

  if (message.includes("delimiter") || message.includes("Pemisah kolom")) {
    return {
      judul: "Pemisah kolom berkas tidak sesuai",
      saran: "Pastikan berkas CSV menggunakan pemisah kolom yang sesuai dengan pengaturan template.",
    };
  }

  if (message.includes("ukuran") || message.includes("size") || message.includes("melebihi")) {
    return {
      judul: "Ukuran berkas melebihi batas yang diizinkan",
      saran: "Kecilkan ukuran berkas atau pisahkan data ke dalam beberapa berkas terpisah.",
    };
  }

  return {
    judul: "Terjadi kendala saat memproses permintaan",
    saran: "Periksa kembali kelengkapan berkas Anda dan coba beberapa saat lagi.",
  };
}

export interface ColumnRuleSummaryResult {
  text: string;
  isIncomplete: boolean;
}

export function isColumnRuleIncomplete(rule: { type: string; [key: string]: unknown }): boolean {
  if (!rule || !rule.type) return true;
  switch (rule.type) {
    case "digits": {
      const len = rule.length;
      return typeof len !== "number" || isNaN(len) || len <= 0;
    }
    case "list": {
      const vals = rule.values;
      return !Array.isArray(vals) || vals.length === 0 || vals.every((v) => typeof v === "string" && !v.trim());
    }
    case "integer": {
      const min = rule.min;
      const max = rule.max;
      if (typeof min === "number" && typeof max === "number" && min > max) return true;
      return false;
    }
    case "text": {
      const min = rule.minLength;
      const max = rule.maxLength;
      if (typeof min === "number" && typeof max === "number" && min > max) return true;
      return false;
    }
    default:
      return false;
  }
}

export function getColumnRuleSummary(
  rule: { type: string; [key: string]: unknown },
  required: boolean
): ColumnRuleSummaryResult {
  const isIncomplete = isColumnRuleIncomplete(rule);
  if (isIncomplete) {
    return {
      text: "Aturan belum lengkap",
      isIncomplete: true,
    };
  }

  const reqLabel = required ? "Wajib diisi" : "Boleh kosong";

  switch (rule.type) {
    case "digits": {
      const len = (rule.length as number) || 9;
      return {
        text: `Kode angka · ${len} digit · ${reqLabel}`,
        isIncomplete: false,
      };
    }
    case "integer": {
      const min = rule.min as number | undefined;
      const max = rule.max as number | undefined;
      let detail = "semua angka";
      if (min !== undefined && max !== undefined) {
        detail = `${min} sampai ${max}`;
      } else if (min !== undefined) {
        detail = `min ${min}`;
      } else if (max !== undefined) {
        detail = `maks ${max}`;
      }
      return {
        text: `Bilangan bulat · ${detail} · ${reqLabel}`,
        isIncomplete: false,
      };
    }
    case "decimal": {
      const allowComma = (rule.allowComma as boolean) ?? true;
      const allowDot = (rule.allowDot as boolean) ?? true;
      let detail = "angka desimal";
      if (allowComma && allowDot) {
        detail = "koma atau titik";
      } else if (allowComma) {
        detail = "koma";
      } else if (allowDot) {
        detail = "titik";
      }
      return {
        text: `Angka desimal · ${detail} · ${reqLabel}`,
        isIncomplete: false,
      };
    }
    case "date": {
      const fmt = (rule.format as string) || "yyyy-MM-dd";
      return {
        text: `Tanggal · ${fmt} · ${reqLabel}`,
        isIncomplete: false,
      };
    }
    case "list": {
      const values = ((rule.values as string[]) || []).filter(Boolean);
      const sample = values.slice(0, 2).join(", ");
      const more = values.length > 2 ? "..." : "";
      const detail = values.length > 0 ? `${sample}${more}` : "pilihan";
      return {
        text: `Pilihan dari daftar · ${detail} · ${reqLabel}`,
        isIncomplete: false,
      };
    }
    case "text":
    default: {
      const minLen = rule.minLength as number | undefined;
      const maxLen = rule.maxLength as number | undefined;
      let detail = "tanpa batas";
      if (minLen && maxLen) {
        detail = `${minLen}-${maxLen} karakter`;
      } else if (maxLen) {
        detail = `maks ${maxLen} karakter`;
      } else if (minLen) {
        detail = `min ${minLen} karakter`;
      }
      return {
        text: `Teks bebas · ${detail} · ${reqLabel}`,
        isIncomplete: false,
      };
    }
  }
}

export function formatTemplateCardMeta(
  columnCount: number,
  updatedAtIso: string,
  updaterName?: string | null
): string {
  let formattedDate = updatedAtIso;
  try {
    const d = new Date(updatedAtIso);
    formattedDate = d.toLocaleString("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    formattedDate = updatedAtIso;
  }
  const name = updaterName?.trim() || "Admin";
  return `${columnCount} kolom · Diperbarui ${formattedDate} oleh ${name}`;
}

export function formatTemplateLastUpload(lastUploadIso?: string | null): string {
  if (!lastUploadIso) {
    return "Belum pernah dipakai";
  }
  try {
    const d = new Date(lastUploadIso);
    const formatted = d.toLocaleString("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
    });
    return `Terakhir diunggah ${formatted}`;
  } catch {
    return `Terakhir diunggah ${lastUploadIso}`;
  }
}

export function resolveSelectedTemplateId(
  templates: { id: string; status: string }[],
  queryParamId?: string | null,
  currentSelectedId?: string
): string {
  if (queryParamId) {
    const matched = templates.find((t) => t.id === queryParamId && t.status === "aktif");
    if (matched) return matched.id;
  }
  if (currentSelectedId) {
    const matchedCurrent = templates.find((t) => t.id === currentSelectedId && t.status === "aktif");
    if (matchedCurrent) return matchedCurrent.id;
  }
  const firstActive = templates.find((t) => t.status === "aktif");
  return firstActive ? firstActive.id : "";
}

export const USER_COPY = {
  nav: {
    unggah: "Unggah",
    template: "Template",
    riwayat: "Riwayat",
    panduan: "Panduan",
  },
  connection: {
    notConnected: "Aplikasi belum terhubung ke penyimpanan data. Hubungi admin.",
    dbUnavailable: "Database sedang tidak bisa dihubungi. Coba lagi sebentar.",
    hostMismatch:
      "Template ini dibuat untuk koneksi yang berbeda dari koneksi saat ini. Hubungi admin.",
  },
  admin: {
    loginTitle: "Masukkan kata sandi admin",
    loginHint: "Kata sandi admin hanya diperlukan untuk menghapus template secara permanen.",
    wrongPassword: "Kata sandi admin salah. Periksa lalu coba lagi.",
    blocked: "Terlalu banyak percobaan gagal. Tunggu 5 menit lalu coba lagi.",
    notConfigured: "Login admin belum disiapkan. Hubungi admin.",
    required: "Sesi admin diperlukan. Masukkan kata sandi admin lalu coba lagi.",
  },
  upload: {
    step1Title: "1. Pilih Template",
    step1Desc: "Pilih template data yang akan Anda gunakan untuk memeriksa berkas.",
    step2Title: "2. Pilih Berkas",
    step2Desc: "Tarik atau pilih berkas CSV maupun Parquet dari komputer Anda.",
    step3Title: "3. Kirim ke Penyimpanan",
    step3Desc: "Periksa hasil pemeriksaan berkas sebelum mengirim ke penyimpanan Databricks.",
    downloadTemplate: "Unduh format template",
    sendButton: "Kirim ke Databricks",
    sending: "Mengirim ke Databricks...",
    sentSuccess: "File terkirim",
    uploadAnother: "Unggah berkas lain",
    downloadIssuesCsv: "Unduh daftar masalah (.csv)",
    fullValidationInBrowser: "Diperiksa lengkap di browser Anda.",
    uploaderNameLabel: "Nama Pengunggah",
    uploaderNamePlaceholder: "Masukkan nama Anda",
    noTemplates: "Belum ada template aktif yang siap digunakan.",
    createNewTemplate: "Buat template baru",
  },
  history: {
    title: "Riwayat Pengunggahan",
    description: "Daftar 50 berkas terakhir yang telah diproses dan dikirim ke penyimpanan.",
    empty: "Belum ada riwayat pengunggahan berkas.",
    colTime: "Waktu",
    colFile: "Nama Berkas",
    colTemplate: "Template",
    colFormat: "Format",
    colSize: "Ukuran",
    colUploader: "Pengunggah",
    colStatus: "Status",
    colDestination: "Tujuan Penyimpanan",
  },
} as const;
