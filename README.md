# Portal Data & Data Uploader

Aplikasi web untuk memvalidasi berkas CSV atau Parquet dari tim kerja, kemudian meneruskannya tanpa modifikasi ke penyimpanan Databricks Unity Catalog Volume.

Validasi dilakukan langsung di peramban (browser) Anda sebelum pengunggahan. Seluruh byte berkas diteruskan persis sesuai aslinya tanpa perubahan pengodean maupun konten.

---

## Kebutuhan Sistem

- **Runtime**: Bun 1.1+ (disarankan) atau Node.js 20+
- **Database**: Akun Neon Postgres (serverless)
- **Penyimpanan**: Workspace Databricks dengan Unity Catalog

---

## Variabel Lingkungan (Environment Variables)

Semua pengaturan aplikasi dan koneksi penyimpanan dikonfigurasi melalui variabel lingkungan:

| Variabel | Keterangan | Nilai Bawaan | Wajib / Opsional |
| :--- | :--- | :--- | :--- |
| `DATABRICKS_HOST` | Alamat workspace Databricks (otomatis dinormalisasi dengan https) | - | Wajib |
| `DATABRICKS_TOKEN` | Token akses pribadi (PAT) Databricks untuk operasi penyimpanan | - | Wajib |
| `DATABRICKS_CATALOG` | Nama Unity Catalog tujuan penyimpanan berkas | - | Wajib |
| `DATABRICKS_VOLUME_NAME` | Nama folder penyimpanan (volume). Jika kosong, menggunakan nama folder template | `file_storage` | Opsional |
| `DATABASE_URL` | URL koneksi pool Neon Postgres untuk runtime aplikasi | - | Wajib |
| `DIRECT_DATABASE_URL` | URL koneksi langsung Neon Postgres (digunakan saat migrasi) | - | Wajib (migrasi) |
| `ADMIN_PASSWORD` | Kata sandi admin untuk otorisasi penghapusan template permanen | - | Wajib |
| `SESSION_SECRET` | Kunci rahasia minimal 32 karakter untuk tanda tangan sesi admin | - | Wajib |
| `MAX_UPLOAD_MB` | Batas maksimum ukuran berkas unggahan dalam megabyte | `100` | Opsional |
| `MAX_TEMPLATES` | Batas maksimum jumlah template aktif | `50` | Opsional |
| `DEPLOY_TARGET` | Target lingkungan deployment (`node` atau `cloudflare`) | `node` | Opsional |

---

## Menjalankan di Komputer Lokal

1. Salin berkas lingkungan contoh:
   ```bash
   cp .env.example .env.local
   ```
2. Isi nilai variabel lingkungan pada `.env.local`.
3. Pasang dependensi dan jalankan server pengembangan:
   ```bash
   bun install
   bun run dev
   ```
4. Buka peramban di `http://localhost:3000`.

---

## Penyiapan Database Neon Postgres

1. Buat proyek baru di [Neon Console](https://console.neon.tech).
2. Salin **Pooled connection string** dan tetapkan ke `DATABASE_URL`.
3. Salin **Direct connection string** dan tetapkan ke `DIRECT_DATABASE_URL`.
4. Hasilkan dan jalankan migrasi tabel aplikasi:
   ```bash
   bun run db:generate
   bun run db:migrate
   ```

---

## Penyiapan Databricks Unity Catalog

1. Pastikan akun layanan atau pengguna memiliki izin berikut pada katalog yang ditentukan:
   - `USE CATALOG`
   - `CREATE SCHEMA`
2. Buat Personal Access Token (PAT) dari profil akun Databricks Anda (**User Settings > Developer > Access Tokens**).
3. Simpan token pada variabel `DATABRICKS_TOKEN`.
4. Uji koneksi secara aman tanpa menulis data dengan perintah:
   ```bash
   bun run check:connection
   ```
   Perintah ini akan mencetak status koneksi ke database dan Databricks dalam bahasa Indonesia yang mudah dipahami.

---

## Menjalankan Pengujian

```bash
bun test
bun run build
```

---

## Penerapan (Deployment)

### 1. Menjalankan dengan Docker

Gunakan berkas `docker-compose.yml` yang membaca variabel dari lingkungan:

```bash
docker compose up -d --build
```

Aplikasi akan berjalan pada port `3000`.

### 2. Penerapan ke Cloudflare Workers / OpenNext

1. Pastikan rahasia tersimpan pada Cloudflare menggunakan Wrangler:
   ```bash
   bunx wrangler secret put DATABRICKS_HOST
   bunx wrangler secret put DATABRICKS_TOKEN
   bunx wrangler secret put DATABRICKS_CATALOG
   bunx wrangler secret put DATABASE_URL
   bunx wrangler secret put ADMIN_PASSWORD
   bunx wrangler secret put SESSION_SECRET
   ```
2. Bangun dan terapkan aplikasi:
   ```bash
   bun run cf:build
   bun run cf:deploy
   ```
