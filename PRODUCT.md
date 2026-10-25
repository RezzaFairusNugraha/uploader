# Ringkasan Produk

Aplikasi web internal bagi staf kantor non-teknis (Sales, Marketing, Operasional) untuk mengunduh template CSV, mengisi data, memeriksa keabsahan data secara mandiri di peramban, dan mengirimkannya langsung ke penyimpanan data perusahaan (Databricks Unity Catalog Volume). Staf juga dapat membuat serta mengubah struktur template sesuai kebutuhan kerja. Halaman admin khusus disediakan untuk mengelola koneksi Databricks.

## Platform & Teknologi
- **Platform**: Web (Desktop-first, responsif untuk peramban modern)
- **Framework**: Next.js 16 (App Router, React Server Components)
- **Gaya Tampilan**: Tailwind CSS
- **Penyimpanan Metadata**: Neon Postgres melalui Drizzle ORM
- **Tujuan Data**: Databricks Unity Catalog (REST API / Volume Storage)
- **Manipulasi Urutan Kolom**: @dnd-kit

## Sasaran Pengguna
- Staf kantor non-teknis di Indonesia (Sales, Marketing, Admin Operasional).
- Karakter: Tenang, berhati-hati, dan cemas berbuat kesalahan atau merusak data perusahaan.
- Kebutuhan: Petunjuk yang jelas, pesan kesalahan yang memandu langkah perbaikan, serta bebas istilah teknis rumit.

## Alur Kerja Utama
1. **Unduh & Isi Template**: Pengguna memilih jenis data, mengunduh berkas template CSV dengan petunjuk kolom yang rapi, lalu mengisinya.
2. **Pemeriksaan Mandiri**: Pengguna mengunggah berkas CSV untuk diperiksa langsung di peramban. Jika ada data keliru, sistem menunjukkan baris dan kolom yang perlu diperbaiki dengan petunjuk jelas.
3. **Kirim Data**: Berkas yang lolos pemeriksaan dikirim langsung ke folder penyimpanan perusahaan.
4. **Kelola Template**: Siapa saja dapat menyusun template baru atau mengubah template lama melalui panduan langkah demi langkah (wizard) dan menyusun ulang urutan kolom dengan mudah.
5. **Koneksi Databricks (Admin)**: Pengaturan kredensial koneksi Databricks yang tersimpan aman di database dengan token terenkripsi.

## Prinsip Suara & Komunikasi (Voice & Tone)
- **Bahasa**: Bahasa Indonesia yang santun, hangat, ringkas, dan jelas.
- **Sapaan**: Selalu menyapa pengguna dengan **"Anda"**.
- **Tanpa Istilah Teknis**: Hindari kata seperti *volume*, *schema*, *catalog*, *slug*, *token*, *API*, *HTTP*, atau *JSON* di area pengguna umum.
- **Pesan Kesalahan Terbimbing**: Setiap pesan masalah menjelaskan apa yang terjadi dan apa yang harus dilakukan pengguna dalam 1–2 kalimat pendek.

## Glosarium Baku
- **Volume** &rarr; Folder penyimpanan
- **Slug** &rarr; Nama folder
- **Delimiter** &rarr; Pemisah kolom
- **Validasi** &rarr; Pemeriksaan
- **Rule** &rarr; Aturan pengisian
- **Required** &rarr; Wajib diisi
- **Status Sedang dibuat** &rarr; Sedang disiapkan
- **Status Aktif** &rarr; Siap dipakai
- **Status Gagal** &rarr; Gagal disiapkan
- **Status Diarsipkan** &rarr; Nonaktif
- **Status Draf** &rarr; Draf
- **Halaman Pengaturan Databricks** &rarr; Koneksi Databricks
