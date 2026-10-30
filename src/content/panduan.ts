export interface GuideTopic {
  id: string;
  title: string;
  summary: string;
  content: string[];
}

export const PANDUAN_TOPICS: GuideTopic[] = [
  {
    id: "pengenalan",
    title: "1. Pengenalan & Alur Kerja",
    summary: "Memahami bagaimana Data Uploader membantu Anda menyiapkan dan mengirim data.",
    content: [
      "Data Uploader dirancang untuk memudahkan staf non-teknis memeriksa dan mengunggah berkas data ke penyimpanan cloud Databricks secara mandiri.",
      "Seluruh proses validasi berkas dilakukan langsung di dalam peramban (browser) komputer Anda. Berkas tidak akan dikirim sebelum dipastikan benar-benar memenuhi format dan aturan pengisian kolom.",
      "Koneksi ke Databricks telah disiapkan terpusat oleh administrator. Anda tidak perlu memasukkan token, kunci rahasia, atau pengaturan teknis apa pun untuk mulai mengunggah berkas.",
      "Alur kerja terdiri dari 3 langkah mudah: Pilih Template Data, Pilih Berkas (CSV atau Parquet), dan Kirim ke Penyimpanan Databricks.",
    ],
  },
  {
    id: "format-berkas",
    title: "2. Format Berkas yang Diterima",
    summary: "Panduan menyiapkan berkas CSV dan Parquet agar lolos pemeriksaan.",
    content: [
      "Format CSV: Pastikan berkas disimpan dengan format UTF-8. Pemisah kolom harus sesuai dengan pengaturan template (titik koma ';' atau koma ','). Header pada baris pertama harus memiliki nama kolom yang persis sama dengan template.",
      "Jika data Anda saat ini berada di aplikasi Microsoft Excel (.xlsx atau .xls), silakan buka berkas tersebut di Excel lalu gunakan menu 'Save As' atau 'Simpan Sebagai' dengan format 'CSV UTF-8 (Comma delimited) (*.csv)'.",
      "Format Parquet: Berkas .parquet harus valid dengan skema kolom dan tipe data yang sesuai dengan aturan template.",
      "Ukuran Berkas: Maksimal ukuran berkas yang didukung dapat dilihat pada area unggah (standar 100 MB).",
    ],
  },
  {
    id: "aturan-pengisian",
    title: "3. Aturan Pengisian Kolom",
    summary: "Mengenal jenis aturan pemeriksaan yang diterapkan pada setiap kolom.",
    content: [
      "Wajib diisi: Kolom tidak boleh bernilai kosong pada baris data mana pun.",
      "Digit Angka: Seluruh nilai harus berupa angka dan memiliki panjang karakter tetap (misalnya 16 digit untuk NIK atau 8 digit untuk ID).",
      "Bilangan Bulat: Nilai harus berupa angka bulat tanpa pecahan atau desimal.",
      "Desimal: Menerima angka pecahan dengan pemisah koma atau titik, serta notasi ilmiah jika diizinkan oleh template.",
      "Tanggal: Format penulisan tanggal harus persis sesuai pola (contoh: yyyy-MM-dd atau dd-MM-yyyy).",
      "Daftar Pilihan: Nilai sel harus salah satu dari daftar kata yang telah ditentukan di template.",
      "Teks: Panjang karakter teks harus berada dalam batas minimum dan maksimum yang ditentukan.",
    ],
  },
  {
    id: "penanganan-kendala",
    title: "4. Mengatasi Kendala Pemeriksaan",
    summary: "Langkah yang perlu dilakukan jika berkas ditolak atau menampilkan pesan masalah.",
    content: [
      "Jika ditemukan kesalahan validasi, peramban akan menampilkan tabel daftar kendala lengkap dengan nomor baris, nama kolom, nilai yang bermasalah, dan penjelasannya.",
      "Anda dapat mengunduh daftar masalah tersebut dalam bentuk berkas .csv dengan menekan tombol 'Unduh daftar masalah (.csv)'.",
      "Buka berkas data asli Anda, perbaiki baris dan sel yang disebutkan pada laporan kendala, simpan kembali berkas, lalu seret ulang berkas tersebut ke halaman Unggah.",
      "Jika muncul pesan bahwa aplikasi belum terhubung ke penyimpanan data atau akun koneksi belum memiliki izin, hubungi admin untuk memeriksa konfigurasi koneksi.",
    ],
  },
  {
    id: "mengelola-template",
    title: "5. Membuat dan Mengubah Template",
    summary: "Bagaimana cara membuat template baru dan bagaimana folder penyimpanan disiapkan.",
    content: [
      "Semua rekan kerja dapat membuka menu 'Template' untuk melihat daftar template yang ada, membuat template baru, atau mengubah aturan yang sudah terdaftar.",
      "Pembuatan template baru menyediakan dua cara: 'Dari file contoh' (membaca struktur kolom dan menebak aturan secara otomatis) atau 'Isi sendiri'.",
      "Saat template disimpan dan disiapkan, sistem secara otomatis membuat folder induk (schema) sesuai nama folder template dan folder penyimpanan (volume) di Databricks beserta subfolder csv dan parquet.",
      "Setiap pembaruan struktur kolom otomatis dicatat pada riwayat versi template.",
      "Penghapusan template secara permanen memerlukan konfirmasi pengetikan nama template demi keamanan penyimpanan data.",
    ],
  },
];
