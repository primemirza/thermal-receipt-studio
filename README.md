# Thermal Receipt Studio

> **Aplikasi desktop offline** untuk mendesain, mempratinjau, dan mencetak struk termal (58mm / 80mm) tanpa koneksi internet.

[![Release](https://img.shields.io/github/v/release/primemirza/thermal-receipt-studio?label=Versi%20Terbaru&color=blue)](https://github.com/primemirza/thermal-receipt-studio/releases/latest)
[![License](https://img.shields.io/badge/Lisensi-MIT-green)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%2010%2F11%20x64-informational)](https://github.com/primemirza/thermal-receipt-studio/releases/latest)

---

## 📋 System Requirements

| Komponen | Spesifikasi |
|----------|-------------|
| **OS** | Windows 10 / Windows 11 (64-bit, x64) |
| **Arsitektur** | x64 (AMD64) |
| **RAM** | Minimum 256 MB |
| **Storage** | Minimum 300 MB ruang kosong |
| **Runtime** | ✅ Tidak diperlukan — runtime sudah terbundel di dalam aplikasi (Electron) |
| **Printer** | Printer termal ESC/POS, lebar kertas 58mm atau 80mm |
| **Koneksi** | Tidak diperlukan (fully offline) |

---

## 🛠️ Tentang Aplikasi

### Dibangun Dengan

| Teknologi | Versi | Peran |
|-----------|-------|-------|
| [Electron](https://www.electronjs.org/) | 44.9.0 | Framework desktop cross-platform |
| Vanilla JavaScript / HTML / CSS | — | UI & logika aplikasi (tanpa React/Vue/CDN) |
| [electron-builder](https://www.electron.build/) | 26.15.3 | Packaging & distribusi (portable + installer) |
| Node.js built-in test runner | — | Unit testing (`node --test`) |

### Fungsi Aplikasi

**Thermal Receipt Studio** adalah aplikasi desain struk termal berbasis desktop yang memungkinkan pengguna:

- 🖊️ **Mendesain** struk secara visual dengan sistem blok (drag, drop, reorder)
- 👁️ **Mempratinjau** hasil cetakan secara real-time di layar sebelum dicetak ke printer
- 🖨️ **Mencetak** langsung ke printer termal via driver Windows atau raw ESC/POS
- 💾 **Menyimpan & memuat** desain struk dalam format file `.trstudio`
- 🔁 **Mendukung** dua lebar kertas termal: **58mm** dan **80mm**

---

## ✨ Fitur & Panduan Penggunaan

### Jenis Blok yang Tersedia

| Blok | Deskripsi |
|------|-----------|
| **Teks** | Teks satu baris; inline-edit dengan klik; properti: ukuran font, tebal, miring, garis bawah, alignment |
| **Paragraf** | Teks multi-baris; mendukung baris baru dengan tombol Enter; properti sama dengan Teks |
| **Item** | Baris produk dengan nama, harga satuan, dan total; layout dua kolom |
| **Total** | Baris subtotal/total dengan label dan nilai; support layout rata kanan |
| **Garis (Rule)** | Garis pemisah putus-putus atau solid; support margin atas/bawah |
| **Spacer** | Spasi kosong dengan tinggi yang dapat diatur |
| **Tabel** | Tabel multi-kolom dengan header dan baris data |
| **Kolom** | Layout dua kolom bebas untuk konten campuran |
| **Gambar** | Gambar yang di-embed pada struk |
| **Barcode** | Barcode linear (CODE128, EAN, dll.) |
| **QR Code** | QR code dari teks/URL |
| **Section** | Grup pembungkus blok-blok lain; mendukung margin dan padding |

### Cara Menggunakan

#### 1. Memulai Desain
- Buka aplikasi → klik **Kertas** di toolbar atas untuk memilih ukuran (58mm / 80mm)
- Gunakan toolbar **Teks**, **Paragraf**, **Item**, **Total**, dll. untuk menambahkan blok ke desain

#### 2. Mengedit Blok
- **Klik** blok di kanvas untuk memilih dan melihat propertinya di panel kiri
- **Double-klik** langsung di kanvas untuk mengedit konten inline
- **Drag** blok untuk mengubah urutan
- **Delete** / **Backspace** untuk menghapus blok yang dipilih

#### 3. Mengatur Properti
- Panel **Properti Elemen** di kiri menampilkan semua properti blok yang dipilih
- Tersedia: ukuran font, tebal/miring/garis bawah, alignment (kiri/tengah/kanan), margin, padding, border, dll.

#### 4. Pratinjau Real-time
- Panel **Preview** di kanan menampilkan hasil render seperti yang akan tercetak di kertas termal
- Preview otomatis diperbarui setiap kali desain diubah

#### 5. Mencetak
- Klik tombol **Cetak** di kanan atas
- Pilih mode: **Driver (Windows Print Dialog)** atau **ESC/POS Raw** untuk printer termal langsung
- Pilih printer termal yang terhubung, lalu cetak

#### 6. Menyimpan & Memuat File
- **Simpan** (Ctrl+S): menyimpan desain ke file `.trstudio`
- **Buka** (Ctrl+O): memuat file `.trstudio` yang sebelumnya disimpan
- **Baru** (Ctrl+N): membuat desain baru

#### 7. Zoom & Tampilan
- Gunakan kontrol **Zoom** di toolbar untuk memperbesar/memperkecil tampilan kanvas

---

## 🧪 Development

### Menjalankan Aplikasi (Dev Mode)

```bash
# Install dependencies
npm install

# Jalankan aplikasi
npm start
```

### Menjalankan Unit Test

```bash
npm test
# Ekspektasi: seluruh 109 test pass
```

### Build Distribusi

```bash
npm run dist:win
# Output: dist/ThermalReceiptStudio-x.x.x-portable-x64.exe
#         dist/ThermalReceiptStudio-x.x.x-setup-x64.exe
```

---

## 📦 Releases & Download

Semua file rilis tersedia di halaman [**GitHub Releases**](https://github.com/primemirza/thermal-receipt-studio/releases).

---

### 🔖 v1.0.0 — Rilis Pertama

> 📅 **16 November 2026** · [Lihat Rilis](https://github.com/primemirza/thermal-receipt-studio/releases/tag/v1.0.0)

**Aset Build:**

| File | Ukuran | Unduh |
|------|--------|-------|
| `ThermalReceiptStudio-1.0.0-portable-x64.exe` | ~97 MB | [⬇ Unduh Portable](https://github.com/primemirza/thermal-receipt-studio/releases/download/v1.0.0/ThermalReceiptStudio-1.0.0-portable-x64.exe) |
| `ThermalReceiptStudio-1.0.0-setup-x64.exe` | ~97 MB | [⬇ Unduh Installer](https://github.com/primemirza/thermal-receipt-studio/releases/download/v1.0.0/ThermalReceiptStudio-1.0.0-setup-x64.exe) |

> **Portable** — Jalankan langsung tanpa instalasi. Cocok untuk penggunaan dari USB drive.  
> **Installer** — NSIS installer yang membuat shortcut di Desktop & Start Menu, dan mendukung uninstall dari Windows.

---

## 📝 Changelog

Semua perubahan penting akan didokumentasikan di sini mengikuti format [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) dan versi mengikuti [Semantic Versioning](https://semver.org/).

---

### [1.0.0] — 16 November 2026 · [Rilis Pertama](https://github.com/primemirza/thermal-receipt-studio/releases/tag/v1.0.0)

#### ✨ Fitur Baru
- **Editor visual struk termal** dengan sistem blok (drag, drop, reorder)
- **12 jenis blok** tersedia: Teks, Paragraf, Item, Total, Garis, Spacer, Tabel, Kolom, Gambar, Barcode, QR Code, Section
- **Blok Paragraf** dengan dukungan multi-baris menggunakan tombol Enter
- **Pratinjau real-time** yang menampilkan simulasi hasil cetak kertas termal
- **Dukungan dua ukuran kertas**: 58mm (32 kolom) dan 80mm (48 kolom)
- **Margin & padding** per-blok dengan kontrol independen untuk semua sisi
- **Section/group block** sebagai pembungkus dengan margin dan padding tersendiri
- **Inline editing** langsung di kanvas dengan double-klik
- **Inspector panel** di sisi kiri untuk mengatur semua properti blok
- **Alignment toolbar**: kiri, tengah, kanan untuk semua jenis blok
- **Mode cetak Driver** via Windows Print Dialog (ESC/POS monospace)
- **Mode cetak ESC/POS Raw** langsung ke port printer
- **Format file `.trstudio`** (ZIP + JSON) untuk menyimpan dan memuat desain
- **SQLite database** untuk menyimpan preferensi, profil printer, dan auto-recovery
- **Zoom** tampilan kanvas dan preview
- **Build distribusi**: Portable EXE + NSIS Installer untuk Windows x64

#### 🔧 Teknis
- Dibangun dengan Electron 44.9.0 + Vanilla JS (tanpa React/Vue/CDN)
- 109 unit test dengan Node.js built-in test runner
- Build CI/CD via GitHub Actions
- Fully offline — tidak ada koneksi internet yang diperlukan

---

<!-- CHANGELOG_ENTRY_POINT
  Panduan untuk menambah entri changelog pada rilis berikutnya:

  Salin template berikut dan tempel DI ATAS baris [1.0.0]:

  ### [X.Y.Z] — DD Bulan YYYY · [Lihat Rilis](https://github.com/primemirza/thermal-receipt-studio/releases/tag/vX.Y.Z)

  #### ✨ Fitur Baru
  - ...

  #### 🐛 Perbaikan Bug
  - ...

  #### 🔧 Perubahan Internal
  - ...

  Lalu tambahkan juga entri aset di bagian "Releases & Download" dengan format:

  ### 🔖 vX.Y.Z — Judul Rilis
  > 📅 **DD Bulan YYYY** · [Lihat Rilis](https://github.com/primemirza/thermal-receipt-studio/releases/tag/vX.Y.Z)
  | File | Ukuran | Unduh |
  |------|--------|-------|
  | `ThermalReceiptStudio-X.Y.Z-portable-x64.exe` | ~XX MB | [⬇ Unduh Portable](...) |
  | `ThermalReceiptStudio-X.Y.Z-setup-x64.exe`    | ~XX MB | [⬇ Unduh Installer](...) |
-->

---

## 📄 Lisensi

MIT © Thermal Receipt Studio
