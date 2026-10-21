# Data Uploader

Aplikasi web modern dan minimalis berbasis Next.js 15, TypeScript, dan Tailwind CSS yang dijalankan dengan Bun. Aplikasi ini memfasilitasi tim Sales dan Marketing untuk mengunduh template CSV acuan, memvalidasi format data secara otomatis, dan meneruskan berkas persis byte aslinya ke Databricks Unity Catalog Volume menggunakan Databricks Files API.

Aplikasi tidak mengubah, mengonversi, atau membersihkan isi berkas. Seluruh byte berkas diteruskan apa adanya untuk diproses lebih lanjut oleh pipeline data di dalam Databricks.

---

## Fitur Utama

- **Validasi Cepat & Aman**: Pemeriksaan ekstensi, UTF-8, pemisah, kelengkapan kolom, dan aturan tipe data per sel (angka, rentang integer, desimal koma/titik, dsb.) secara otomatis di peramban dan server.
- **Koneksi Databricks Terisolasi**: Konfigurasi kredensial (URL workspace, Personal Access Token, katalog, skema, volume) diatur langsung dari antarmuka aplikasi. Token disimpan dengan enkripsi AES-256-GCM dan tidak pernah dikirimkan kembali ke peramban (*write-only*).
- **Uji Koneksi Aman**: Pengecekan status direktori Volume secara bertahap yang murni *read-only* tanpa menulis atau menghapus berkas uji coba.
- **Desain Minimalis**: Antarmuka berbasis satu tema terang yang hening, ramah keyboard, dan fokus pada kejelasan data.

---

## Menjalankan secara Lokal

### Prasyarat
- [Bun](https://bun.sh/) (versi 1.1 ke atas)

### Langkah Pemasangan & Menjalankan
1. Pasang dependensi proyek:
   ```bash
   bun install
   ```

2. Jalankan server pengembangan:
   ```bash
   bun run dev
   ```

3. Buka peramban pada alamat `http://localhost:3000`.

### Menjalankan Pengujian dan Kompilasi
- Menjalankan unit test:
  ```bash
  bun test
  ```
- Menjalankan linting:
  ```bash
  bun run lint
  ```
- Menjalankan build produksi:
  ```bash
  bun run build
  ```

---

## Menjalankan dengan Docker

Proyek menyediakan `Dockerfile` multi-stage dan `docker-compose.yml`. Konfigurasi ini menggunakan named volume `uploader_data` yang terpasang pada `/app/data` agar kredensial tersimpan dan kunci enkripsi tetap bertahan saat kontainer diperbarui.

### Menjalankan Kontainer
```bash
docker compose up -d --build
```

Aplikasi dapat diakses melalui `http://127.0.0.1:3000`.

Untuk menghentikan kontainer:
```bash
docker compose down
```

---

## Hak Akses Databricks yang Dibutuhkan

Personal Access Token (PAT) atau Service Principal yang digunakan pada halaman Pengaturan memerlukan hak akses berikut pada Unity Catalog Databricks:

1. `USE CATALOG` pada katalog target.
2. `USE SCHEMA` pada skema target.
3. `READ VOLUME` pada Volume target (diperlukan untuk membaca daftar direktori saat uji koneksi dan memastikan folder tujuan tersedia).
4. `WRITE VOLUME` pada Volume target (diperlukan untuk mengunggah berkas ke Volume).

*Catatan: Izin tulis baru terbukti saat pengunggahan berkas pertama kali dilakukan.*

---

## Cara Menambahkan Template Baru

Aturan validasi didefinisikan secara terpusat sebagai data konfigurasi. Untuk menambahkan template baru, Anda cukup menambahkan satu konfigurasi:

1. Buat berkas baru di `src/lib/templates/nama-template.ts`, misalnya:
   ```typescript
   import { rules, type TemplateConfig } from "./types";

   export const contohTemplate: TemplateConfig = {
     id: "contoh-data",
     name: "Contoh Data",
     description: "Deskripsi singkat mengenai template data.",
     kind: "csv",
     delimiter: ";",
     fileNamePrefix: "contoh_data",
     columns: [
       {
         name: "id",
         label: "ID Pengguna",
         required: true,
         rule: rules.digits(5),
       },
       {
         name: "nilai",
         label: "Nilai Skor",
         required: true,
         rule: rules.integerRange(1, 100),
       },
     ],
     exampleRows: [
       ["12345", "90"],
     ],
   };
   ```

2. Daftarkan template tersebut di `src/lib/templates/index.ts`:
   ```typescript
   import { contohTemplate } from "./nama-template";

   export const templates: TemplateConfig[] = [
     targetBrandDistributionTemplate,
     hariBesarTemplate,
     dataResearchTemplate,
     contohTemplate,
   ];
   ```

Setelah didaftarkan, template akan otomatis muncul di formulir Unggah, halaman Template, generator berkas CSV, dan mesin validasi.

---

## Catatan Konfigurasi Reverse Proxy (Nginx)

Jika aplikasi ditempatkan di balik reverse proxy Nginx pada lingkungan produksi, pastikan batas ukuran berkas dan pengaturan buffering disesuaikan untuk kelancaran pengunggahan berkas:

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

- `client_max_body_size`: Sesuaikan dengan batas ukuran maksimum berkas yang diizinkan (default 100 MB).
- `proxy_request_buffering off`: Menghindari penulisan buffer berkas ke disk sementara Nginx saat proses streaming unggahan berlangsung.
