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

Token akses memerlukan izin berikut pada Unity Catalog:
- `USE CATALOG` pada katalog tujuan.
- `USE SCHEMA` pada skema tujuan.
- `READ VOLUME` pada volume tujuan (untuk memeriksa ketersediaan folder).
- `WRITE VOLUME` pada volume tujuan (untuk mengunggah berkas).

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
