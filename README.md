# Thermal Receipt Studio

Aplikasi desktop offline untuk merancang, mengedit, memvisualisasikan, dan mencetak struk thermal berstandar POS (*Point of Sale*) pada kertas ukuran **58 mm** (32 kolom) dan **80 mm** (48 kolom).

Tersedia dalam dua opsi distribusi Windows x64:
1. **Portable EXE** (`ThermalReceiptStudio-1.0.0-portable-x64.exe`) — Langsung dijalankan tanpa instalasi.
2. **Installer Setup EXE** (`ThermalReceiptStudio-1.0.0-setup-x64.exe`) — Pemasang mandiri berbasis NSIS dengan shortcut Start Menu dan Desktop.

---

## Fitur Utama

- **Editor Visual Kanvas & Layout Thermal Monospace:**
  - Desain interaktif kanvas dengan tata letak proporsional kertas struk thermal.
  - Preview monospace karakter-demi-karakter (*thermal layout simulation*) yang merefleksikan hasil cetak printer thermal fisik secara presisi.
  - Pilihan cepat lebar kertas 58 mm (32 kolom Font A) dan 80 mm (48 kolom Font A) dengan komputasi lebar otomatis.
  - Kontrol zoom area kerja (60% hingga 150%) dan toggle panduan batas elemen (*guides*).

- **Katalog Blok Elemen Lengkap:**
  - **Teks**: Label teks tunggal dengan format ukuran (*small, normal, large, double*), tebal, miring, garis bawah, dan perataan (*left, center, right*).
  - **Paragraf**: Blok teks multi-baris yang mendukung tombol `Enter` untuk pindah baris secara leluasa saat pengeditan di kanvas.
  - **Item & Total**: Format item nama dan harga dengan nominal eksplisit serta perataan rapi tanpa pemaksaan prefix mata uang kaku.
  - **Garis Pemisah (Rule)**: Garis pemisah dengan gaya solid, dashed (putus-putus), double, atau kustom karakter (`-`, `=`, `*`, dsb) dengan margin kiri/kanan yang terhitung presisi ke kolom printer.
  - **Spacer**: Jarak kosong vertikal yang diterjemahkan menjadi baris *feed* thermal.
  - **Tabel**: Tabel data multi-kolom dan multi-baris dengan drag-to-resize lebar kolom, opsi border (*all, horizontal, vertical, none*), dan perataan per-sel.
  - **Kolom Teks**: Layout multi-kolom berdampingan dengan pembagi garis.
  - **Gambar**: Penyisipan logo/gambar hitam-putih mandiri yang dienkapsulasi aman sebagai base64 data URL.
  - **Barcode & QR Code**: Pembuat barcode 1D (CODE128) dan kode 2D (QR Code) berbasis pustaka lokal tanpa ketergantungan API eksternal.
  - **Section**: Pengelompokan elemen bersarang (hingga 20 level) yang mendukung pengaturan margin dan padding individual pada keempat sisi (*top, right, bottom, left*).

- **Format Berkas `.trstudio` Mandiri:**
  - Berkas desain disimpan dalam format arsip ZIP `.trstudio` yang terenkapsulasi mandiri.
  - Dilengkapi validasi skema ketat dan proteksi pencegahan *path traversal*.
  - Riwayat berkas terkini (*Recent Files*) yang terintegrasi di database lokal.

- **Pencetakan Thermal Fleksibel:**
  - **Cetak Driver Windows**: Pencetakan HTML monospace pekat dengan kontras optimal dan print color adjust untuk semua driver thermal Windows (USB, Virtual, Bluetooth, dsb).
  - **Cetak Raw ESC/POS Binary**: Kompiler binary byte stream ESC/POS murni (inisialisasi `ESC @`, format font, feed, barcode, QR, dan pemotong kertas otomatis `GS V`).
  - Dropdown deteksi printer otomatis di toolbar.

- **Penyimpanan Lokal & Crash Recovery:**
  - Basis data SQLite lokal disimpan di `%APPDATA%\ThermalReceiptStudio\trs.db` (tidak mengotori folder portabel).
  - Fitur *autosave recovery snapshot* untuk memulihkan dokumen yang belum sempat disimpan jika komputer atau aplikasi tertutup tiba-tiba.

- **Keamanan & Kepatuhan Offline Murni:**
  - 100% offline — tidak ada pemanggilan jaringan, CDN, pelacakan, atau analitik jarak jauh.
  - *Content Security Policy* (CSP) ketat (`default-src 'none'`).
  - Arsitektur Electron aman (`contextIsolation: true`, `nodeIntegration: false`, dan komunikasi IPC melalui kanal *whitelist* terisolasi).

---

## Persyaratan Sistem

- **Sistem Operasi:** Windows 10 / Windows 11 (64-bit).
- **Arsitektur:** x64.
- **Printer yang Didukung:** Semua printer struk thermal POS 58 mm dan 80 mm (Epson ESC/POS, Xprinter, Panda, Iware, Janz, dsb) baik melalui driver Windows maupun koneksi Raw.

---

## Menjalankan dan Mengembangkan (Developer)

### Prasyarat
- Node.js versi 20 atau 22 LTS.
- npm versi 10+.

### Langkah Pengembangan
```bash
# Pasang dependensi
npm ci

# Jalankan aplikasi dalam mode pengembangan
npm start

# Jalankan seluruh rangkaian pengujian unit dan integrasi otomatis
npm test
```

### Smoke Test
```bash
# Uji boot Electron smoke test
npm run start:test
```

---

## Membangun Aplikasi (Build Windows EXE)

Untuk mengompilasi aplikasi menjadi berkas binary Windows:

```bash
npm run dist:win
```

Perintah di atas akan menghasilkan dua berkas di direktori `dist/`:
1. `dist/ThermalReceiptStudio-1.0.0-portable-x64.exe` (Versi Portabel)
2. `dist/ThermalReceiptStudio-1.0.0-setup-x64.exe` (Versi Installer NSIS)

Build otomatis juga tersedia pada GitHub Actions runner `windows-latest`. Setiap perubahan yang di-push ke branch utama akan menjalankan pengujian unit, smoke test Electron, dan menghasilkan artifact siap unduh di tab **Actions**.

---

## Lisensi

Didistribusikan di bawah lisensi MIT. Komponen pustaka pihak ketiga lokal (ReceiptPrinterEncoder, JsBarcode, QRCode) berlisensi MIT dan tercatat di [LICENSES.md](src/renderer/vendor/LICENSES.md).
