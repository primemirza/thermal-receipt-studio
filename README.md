# Thermal Receipt Studio

> **Aplikasi desktop offline** untuk mendesain, mempratinjau, dan mencetak struk termal (58mm / 80mm) tanpa koneksi internet.

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

## 📦 Build Assets & Unduh

### Versi 1.0.0

| File | Tipe | Deskripsi |
|------|------|-----------|
| `ThermalReceiptStudio-1.0.0-portable-x64.exe` | Portable | Langsung jalankan tanpa instalasi |
| `ThermalReceiptStudio-1.0.0-setup-x64.exe` | Installer (NSIS) | Installer dengan shortcut desktop & Start Menu |

> **Unduh:** Kunjungi halaman [**Releases**](https://github.com/primemirza/thermal-receipt-studio/releases/tag/v1.0.0) untuk mengunduh file build versi 1.0.0.
>
> Jika belum tersedia di Releases, file dapat diunduh sementara dari tab [**Actions**](https://github.com/primemirza/thermal-receipt-studio/actions) → pilih workflow run terbaru → bagian **Artifacts**.

### Catatan Build

- Build menggunakan `electron-builder 26.15.3` dengan target `portable` + `nsis` untuk Windows x64
- CI otomatis berjalan melalui GitHub Actions (`build-windows.yml`) setiap push ke branch `main`
- Unit test: 109 test case dijalankan dengan `node --test` sebelum setiap build

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
# Output: dist/ThermalReceiptStudio-1.0.0-portable-x64.exe
#         dist/ThermalReceiptStudio-1.0.0-setup-x64.exe
```

---

## 📄 Lisensi

MIT © Thermal Receipt Studio
