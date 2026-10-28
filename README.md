# Data Uploader

Aplikasi web untuk memvalidasi berkas CSV atau Parquet dari tim Sales dan Marketing, kemudian meneruskannya tanpa modifikasi ke Databricks Unity Catalog Volume menggunakan Databricks Files API.

Aplikasi tidak mengubah isi, membersihkan, atau mengubah pengodean berkas. Seluruh byte diteruskan persis seperti yang diunggah.

## Menjalankan Aplikasi

### Kebutuhan Sistem
- Bun 1.1 ke atas

### Instalasi dan Menjalankan Server
```bash
bun install
bun run dev
```
Aplikasi berjalan pada `http://localhost:3000`.

### Pengujian dan Pemeriksaan Kode
```bash
bun test
bun run lint
bun run build
```

## Menjalankan dengan Docker
```bash
docker compose up -d --build
```
Aplikasi berjalan pada `http://127.0.0.1:3000`. Pengaturan disimpan di database Postgres (Neon) dengan token terenkripsi.

## Izin Akses Databricks

Setiap template memiliki satu skema (folder induk) dan satu volume (folder penyimpanan) di dalam katalog yang ditentukan. Disarankan untuk menggunakan **katalog khusus (dedicated catalog)** untuk aplikasi ini.

1. **Akun Koneksi Aplikasi (Data Uploader)**:
   - Memerlukan izin `USE CATALOG` dan `CREATE SCHEMA` pada katalog tujuan.
   - Karena akun ini membuat skema dan volume untuk setiap template baru, akun tersebut otomatis menjadi pemilik (owner) atas objek yang dibuatnya dan dapat mengelola isi volume tersebut.
2. **Akun Pipeline Data (Downstream)**:
   - Berikan izin `USE CATALOG`, `USE SCHEMA`, dan `READ VOLUME` di tingkat katalog (catalog level) agar setiap folder template baru yang dibuat aplikasi langsung tercakup secara otomatis tanpa perlu pengaturan izin manual per template.

## Menambahkan Template Baru

Template dapat dibuat langsung melalui antarmuka web:
1. Buka halaman **Template** (`/template`).
2. Klik tombol **Buat template** (`/template/baru`).
3. Isi informasi dasar (nama template, pemisah kolom), konfigurasi kolom dan aturan pengisian, serta folder penyimpanan.
4. Simpan template. Template yang siap dipakai dapat langsung digunakan untuk validasi dan pengunggahan berkas.

## Konfigurasi Nginx

Jika menggunakan reverse proxy Nginx, matikan request buffering dan sesuaikan ukuran berkas:

```nginx
server {
    listen 80;
    server_name uploader.domain.com;

    client_max_body_size 100M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;

        proxy_request_buffering off;
    }
}
```

## Penerapan ke Cloudflare Workers

Anda dapat menjalankan aplikasi ini pada layanan Cloudflare Workers. Berikut langkah-langkah penyiapannya:

### 1. Menyiapkan Akun dan Kunci Akses Cloudflare
1. Buat akun di Cloudflare jika Anda belum memilikinya.
2. Buat token API Cloudflare melalui menu profil dengan memilih template **Edit Cloudflare Workers**.
3. Simpan **Account ID** dan token API yang baru saja dibuat.

### 2. Menambahkan Rahasia pada GitHub
Tambahkan dua rahasia (secrets) pada repositori GitHub Anda di menu **Settings > Secrets and variables > Actions**:
- `CLOUDFLARE_API_TOKEN`: Token API yang telah Anda buat.
- `CLOUDFLARE_ACCOUNT_ID`: ID akun Cloudflare Anda.

### 3. Menjalankan Migrasi Database dari Komputer Anda
Jalankan migrasi struktur database dari laptop/komputer Anda terlebih dahulu menggunakan perintah:
```bash
bun run db:migrate
```

### 4. Menyimpan Kunci Rahasia Runtime ke Cloudflare
Simpan dua variabel rahasia aplikasi ke Cloudflare Workers menggunakan Wrangler (cukup dilakukan sekali):
```bash
bunx wrangler secret put DATABASE_URL
bunx wrangler secret put ENCRYPTION_KEY
```
Masukkan URL database Neon dan kunci enkripsi 32-byte Anda saat diminta.

### 5. Menjalankan Alur Kerja Penerapan
1. Buka menu **Actions** di repositori GitHub Anda.
2. Pilih alur kerja **Deploy to Cloudflare Workers**.
3. Klik tombol **Run workflow** untuk memulai proses pengiriman ke Cloudflare.

### 6. Membuka Aplikasi dan Mengisi Koneksi
1. Setelah alur kerja selesai, buka alamat URL Cloudflare Workers yang diberikan.
2. Masuk ke menu **Koneksi Databricks** dan lengkapi alamat workspace serta token Databricks Anda.

### Batasan Paket Gratis Cloudflare Workers
Pada paket gratis (Free plan), terdapat beberapa batasan sistem yang perlu Anda ketahui:
- Waktu kerja prosesor (CPU) maksimal 10 ms per permintaan.
- Ukuran kode aplikasi terkompresi maksimal 3 MiB.
- Maksimal 50 permintaan keluar (subrequests) per permintaan HTTP.
- Pemeriksaan di sisi server berjalan dalam mode ringan (pemeriksaan berkas secara menyeluruh tetap dilakukan di peramban Anda).
