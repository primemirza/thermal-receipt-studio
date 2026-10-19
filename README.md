# Thermal Receipt Studio

Aplikasi desktop offline untuk membuat, mengedit, preview, dan mencetak desain struk printer thermal (58 mm / 80 mm). Target distribusi: **portable Windows `.exe`** (tanpa installer).

## Status proyek
Proyek dikembangkan bertahap dengan persetujuan per fase. Lihat **`TASKLIST.md`** (status tugas) dan **`PROGRESS.md`** (progres & keputusan). Fase aktif saat ini: **FASE 1 — Fondasi Electron** (IMPLEMENTED, menunggu persetujuan). Fitur editor/penyimpanan/cetak menyusul di Fase 2–10; dokumentasi fitur hanya mencerminkan yang benar-benar tersedia.

## Teknologi
Electron + HTML/CSS/JavaScript (ES modules), tanpa React/Vite/CDN. Build: `electron-builder` (target `portable`). Tes: Node.js test runner (`node --test`).

## Menjalankan pengembangan
```bash
npm ci
npm start          # jalankan aplikasi (butuh lingkungan desktop)
npm test           # tes unit fondasi (berjalan di mana saja, tanpa GUI)
```
Di Linux headless: `DISPLAY=:99 TRS_SMOKE=1 npx electron . --no-sandbox` untuk smoke test.

## Membangun portable EXE
```bash
npm run dist:win   # menghasilkan dist/ThermalReceiptStudio-<versi>-portable-x64.exe
```
Build resmi dilakukan oleh GitHub Actions **Build portable Windows EXE** (`windows-latest`): menjalankan tes unit → smoke test Electron → build → mengunggah artifact `ThermalReceiptStudio-portable-win-x64`. Unduh `.exe` dari halaman **Actions → run terpilih → Artifacts**.

## Lokasi data pengguna
Aplikasi portable tidak menulis ke folder aplikasinya sendiri. Data (preferensi/recovery/database — aktif mulai Fase 8) disimpan di `%APPDATA%\ThermalReceiptStudio`.

## Keamanan
`contextIsolation: true`, `nodeIntegration: false`, preload dengan API terbatas (dua fungsi IPC yang divalidasi whitelist di main process), CSP ketat, blokir navigasi/window baru, tidak ada koneksi jaringan runtime.

## Batasan yang diketahui
- Pengujian printer fisik belum dapat dilakukan (butuh perangkat keras pengguna).
- Smoke test CI membuktikan jendela berhasil dibuat, bukan pengujian visual menyeluruh.
