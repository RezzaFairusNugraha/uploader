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
      saran: "Periksa kembali pengaturan koneksi Databricks di menu admin atau hubungi pengelola sistem.",
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

export const USER_COPY = {
  nav: {
    unggah: "Unggah",
    template: "Template",
    riwayat: "Riwayat",
    panduan: "Panduan",
    koneksi: "Koneksi Databricks",
  },
  connection: {
    dbUnavailable: "Database sedang tidak bisa dihubungi. Coba lagi sebentar.",
    incompletePrefix: "Koneksi ke penyimpanan data belum lengkap: ",
    incompleteSuffix: ". Minta admin melengkapinya di halaman Koneksi Databricks.",
    labels: {
      alamat: "alamat workspace",
      token: "token akses",
      catalog: "katalog",
      schema: "skema",
    },
    buildIncompleteMessage(missing: ("alamat" | "token" | "catalog" | "schema")[]): string {
      const labels = missing.map((m) => USER_COPY.connection.labels[m] || m);
      return `${USER_COPY.connection.incompletePrefix}${labels.join(", ")} belum diisi${USER_COPY.connection.incompleteSuffix}`;
    },
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
