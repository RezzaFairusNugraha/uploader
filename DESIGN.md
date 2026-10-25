# Pedoman Desain

Panduan identitas visual, tipografi, komponen antarmuka, dan interaksi yang dirancang khusus untuk kenyamanan dan ketenangan pengguna kantor non-teknis.

## Prinsip Desain
- **Ketenangan & Kejelasan**: Tata letak lapang dengan banyak ruang putih (*white space*), menghilangkan kecemasan pengguna saat berinteraksi dengan sistem data.
- **Tipografi Terbaca Nyaman**: Ukuran teks besar dan kontras tinggi untuk memudahkan pembacaan tanpa kelelahan mata.
- **Interaksi Ramah & Pasti**: Target klik luas dan jelas, umpan balik langsung pada setiap tindakan, dan perlindungan dari aksi yang tidak disengaja.
- **Anti-Pola yang Dihindari**: Dilarang menggunakan gradien ungu tipikal SaaS AI, kartu berpendar (*glowing cards*), ubin ikon berlebihan, dasbor yang padat/penuh sesak, dan estetika alat pengembang perangkat lunak.

## Palet Warna
Hanya menggunakan satu warna aksen terpadu (Indigo/Biru) yang dikombinasikan dengan latar belakang netral terang dan bersih.

| Peran Warna | Nilai / Token Tailwind | Penggunaan |
| :--- | :--- | :--- |
| **Latar Belakang Utama** | `#FFFFFF` (`bg-white`) / `#F9FAFB` (`bg-gray-50`) | Latar dasar halaman dan kontainer utama |
| **Permukaan Kartu** | `#FFFFFF` (`bg-white` bordered `#E5E7EB`) | Kartu konten dengan batas tipis yang rapi |
| **Warna Aksen Primer** | `#4F46E5` (`indigo-600`) | Tombol utama, indikator aktif, tautan utama |
| **Aksen Interaksi (Hover)** | `#4338CA` (`indigo-700`) | Status hover dan fokus pada tombol primer |
| **Aksen Lembut** | `#EEF2FF` (`indigo-50`) | Latar penyorot pilihan atau area aktif |
| **Teks Utama** | `#111827` (`text-gray-900`) | Judul dan isi teks utama untuk keterbacaan tinggi |
| **Teks Pendukung** | `#4B5563` (`text-gray-600`) | Teks bantuan, keterangan panduan, dan label sekunder |
| **Garis Batas** | `#E5E7EB` (`border-gray-200`) | Pembatas bagian, tabel, dan tepi masukan formulir |
| **Status Sukses** | `#059669` (`emerald-600`) / `#ECFDF5` (`bg-emerald-50`) | Pemeriksaan berhasil atau status siap dipakai |
| **Status Peringatan / Masalah** | `#DC2626` (`red-600`) / `#FEF2F2` (`bg-red-50`) | Catatan baris keliru atau koneksi terputus |

## Tipografi
Standar ukuran ketat untuk menjaga kemudahan membaca:
- **Teks Tubuh (Body text)**: Minimal **16px** (`text-base` / `1rem`), dilarang lebih kecil.
- **Teks Bantuan / Keterangan (Helper text)**: Minimal **14px** (`text-sm` / `0.875rem`). **Tidak boleh ada teks yang lebih kecil dari 14px di seluruh aplikasi.**
- **Judul Bagian (Section Heading)**: **20px–24px** (`text-xl` / `text-2xl`), bobot medium atau semibold.
- **Judul Utama Halaman (Page Heading)**: **28px–32px** (`text-3xl`), bobot semibold.
- **Jarak Baris (Line-height)**: Longgar dan nyaman dibaca (`leading-relaxed` atau `leading-normal`).

## Komponen & Tata Letak

### Tombol & Area Sentuh
- **Tinggi Tombol**: Minimal **44px** (`min-h-[44px]` atau `h-11`) untuk semua tombol interaktif, menu dropdown, dan pemicu aksi.
- **Tampilan Tombol Utama**: Latar belakang `#4F46E5` dengan teks putih kontras tinggi dan sudut melengkung halus (`rounded-lg`).
- **Tampilan Tombol Sekunder**: Latar belakang putih dengan garis batas tegas (`border border-gray-300`) dan teks `#111827`.

### Formulir & Bidang Masukan
- Tinggi kolom masukan minimal 44px dengan bantalan dalam yang lega (`px-4 py-2.5`).
- Ring fokus jelas (`focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500`).
- Setiap kolom wajib memiliki label berukuran 16px di atasnya dan teks bantuan minimal 14px di bawahnya.

### Pengurutan Kolom (Drag and Drop)
- Pegangan tarik (*drag handle*) berukuran minimal 44x44px dengan ikon pegangan netral.
- Baris yang sedang diangkat diberi bayangan halus tipis (`shadow-md`) dan sedikit terangkat tanpa efek distorsi berlebihan.
- Garis penanda posisi jatuh tipis berwarna aksen (`border-indigo-500`).
- Durasi animasi transisi maksimal 200ms dan dinonaktifkan jika peramban mengaktifkan mode hemat gerak (*prefers-reduced-motion*).
- Tombol alternatif "Naik" dan "Turun" selalu tersedia untuk navigasi keyboard atau layar sentuh.

### Pesan & Notifikasi
- Menggunakan kalimat pendek (1–2 kalimat) yang langsung memaparkan apa yang terjadi dan tindakan selanjutnya bagi pengguna.
- Kotak pesan kesalahan memiliki latar lembut dan batas kiri tegas, bukan popup modal yang mengagetkan.
