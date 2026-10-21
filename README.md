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
Aplikasi berjalan pada `http://127.0.0.1:3000`. Kredensial dan kunci enkripsi disimpan di volume bernama `uploader_data` yang terpasang pada `/app/data`.

## Izin Akses Databricks

Token akses memerlukan izin berikut pada Unity Catalog:
- `USE CATALOG` pada katalog tujuan.
- `USE SCHEMA` pada skema tujuan.
- `READ VOLUME` pada volume tujuan (untuk memeriksa ketersediaan folder).
- `WRITE VOLUME` pada volume tujuan (untuk mengunggah berkas).

## Menambahkan Template Baru

Aturan validasi disimpan terpusat per template:

1. Buat berkas baru di `src/lib/templates/<id-template>.ts`:
```typescript
import { rules, type TemplateConfig } from "./types";

export const templateBaru: TemplateConfig = {
  id: "template-baru",
  name: "Template Baru",
  description: "Keterangan data.",
  kind: "csv",
  delimiter: ";",
  fileNamePrefix: "template_baru",
  columns: [
    {
      name: "kode",
      label: "Kode",
      required: true,
      rule: rules.digits(5),
    },
  ],
  exampleRows: [["12345"]],
};
```

2. Daftarkan template di `src/lib/templates/index.ts`:
```typescript
import { templateBaru } from "./<id-template>";

export const templates: TemplateConfig[] = [
  targetBrandDistributionTemplate,
  hariBesarTemplate,
  dataResearchTemplate,
  templateBaru,
];
```

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
