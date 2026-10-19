# PROGRESS — Thermal Receipt Studio

Diperbarui terakhir: 2026-10-19 (Fase 0)

---

## 1. Kondisi repository yang terverifikasi (hasil aktual, bukan asumsi)

Perintah dijalankan di `/workspace`: `ls -la`, `git status`, `git log`, `git branch -a`, `git remote -v`.

Hasil aktual:
- `/workspace` **kosong** (tidak ada file tersembunyi selain direktori itu sendiri).
- `git status` → `fatal: not a git repository`. **Folder kerja saat ini bukan repository git**, tidak ada branch, commit, maupun remote yang terkonfigurasi di workspace ini.
- Konsekuensi jujur: saya TIDAK dapat mem-push ke GitHub dari langkah ini dan TIDAK mengaku melakukannya. Rencana: pada Fase 1 saya akan `git init` + commit awal di `/workspace`; push ke repo GitHub pengguna memerlukan kredensial/URL remote dari pengguna (instruksi detail di §8).

## 2. Fase aktif

**FASE 0 — Audit dan Perencanaan.** Status: dokumen selesai (`IMPLEMENTED`), menunggu persetujuan pengguna. Fase 1 **belum** dikerjakan sesuai aturan §2 master prompt.

## 3. Kemampuan & keterbatasan workspace (terverifikasi)

### 3.1 Yang tersedia dan teruji hari ini
- Node.js **v20.20.2**, npm **10.8.2**, git **2.39.5**, Python 3.12.10.
- Akses jaringan keluar: `https://registry.npmjs.org` (HTTP 200) dan `raw.githubusercontent.com` berhasil diakses untuk audit dokumentasi resmi.
- Dapat menulis file, menjalankan `npm install`, dan menjalankan tes berbasis Node (`node --test`).

### 3.2 Yang TIDAK tersedia
- Sistem operasi Windows (tidak mungkin menjalankan/membangun `.exe` lokal; build portable harus lewat GitHub Actions runner `windows-latest`).
- GUI/display server → Electron tidak dapat dibuka secara interaktif di workspace. (Catatan: smoke-test headless dengan `xvfb-run` *mungkin* dapat dilakukan di Linux, tetapi belum diverifikasi; strategi utama smoke test adalah CI Windows — lihat ADR-008.)
- Printer fisik / driver printer Windows.
- Repository git terinisialisasi dengan remote GitHub (lihat §1).
- Akses untuk membaca hasil workflow GitHub Actions milik pengguna tanpa kredensial/token.

### 3.3 Fitur yang tidak dapat diuji langsung di workspace (harus via CI atau manual oleh pengguna)
1. Eksekusi aplikasi Electron sungguhan di Windows (smoke test) → CI `windows-latest`.
2. Build & eksekusi `electron-builder` target `portable` → CI Windows.
3. Deteksi printer Windows, pencetakan via driver, pencetakan raw ESC/POS → uji manual pengguna dengan perangkat.
4. Rebuild modul native (`better-sqlite3`) terhadap ABI Electron → CI Windows.
5. Verifikasi visual UI (font, spacing, gaya Win11) → penilaian pengguna.
6. Operasi offline penuh pada `.exe` hasil build → verifikasi pengguna.

## 4. Hasil audit pustaka (semua diverifikasi hari ini via registry npm + dokumentasi resmi GitHub)

### 4.1 `@point-of-sale/receipt-printer-encoder` — DIPILIH sebagai encoder
- Versi terbaru **4.0.1**, lisensi **MIT**, `type: module` dengan exports CJS/ESM/browser (`umd`/`esm`), **tanpa peerDependencies**.
- Dependensi runtime: `canvas-dither`, `canvas-flatten`, `resize-image-data`, `@canvas/image-data`, `@point-of-sale/codepage-encoder` — semuanya murni JS (tanpa binding native) → aman dibundel & berjalan offline. Catatan: butuh input gambar berupa ImageData; di renderer Electron tersedia Canvas asli, jadi tidak perlu polyfill.
- API yang terverifikasi dari dokumentasi resmi (usage.md, commands.md, configuration.md):
  - Konstruktor opsi: `{ printer, language, columns, feedBeforeCut, feedAfterBlock, newline, imageMode, receiptline }`.
  - Metode rantai: `initialize()`, `encode()`, `line(text)`, `newline()`, `bold()`, `italic()`, `underline()`, `invert()`, `align('left'|'center'|'right')`, `size()/width()/height()`, `font()`, `lineSpacing()`, `table(columns, data|callback)`, `rule(style, character)`, `barcode(value, type, options)`, `qrcode(content, options)`, `pdf417()`, `image(...)`, `imageBuffer()` (via dist), `cut()`, `pulse()`, `raw()`, `markdown()`, `receiptline(document)` (opsional).
  - Lebar kertas = `columns` (Font A 12px/karakter): 58 mm ≈ 32–35 kolom; 80 mm ≈ 42–48 kolom. **Bukan** lebar piksel bebas — layout internal kami bekerja dalam satuan kolom.
  - Bahasa: ESC/POS, StarLine, StarPRNT.
- ⚠️ Penemuan penting: v3 memiliki properti `characterWidths`; dokumentasi v4 **tidak lagi mencantumkannya**. Implementasi Fase 6 wajib memakai API v4 apa adanya dan menuliskan tes terhadap paket terpasang nyata (bukan dari ingatan). Tidak akan mengarang method.
- Playground referensi `point-of-sale.dev/receipt-printer/playground/` menggunakan library yang sama (UMD di browser) — pola integrasi kami di renderer kompatibel.

### 4.2 Transport printer (sister packages point-of-sale)
- `@point-of-sale/system-receipt-printer` v2.0.1 (MIT) — cetak ke printer terpasang di sistem via `@grandchef/node-printer` (**native**, berisiko ABI Electron; dievaluasi serius di Fase 7, fallback: `webContents.print` untuk jalur driver).
- `@point-of-sale/network-receipt-printer` v2.0.1 (MIT) — socket TCP murni Node, tanpa dependensi → kandidat kuat jalur raw ESC/POS untuk printer network.
- `WebUSB/WebSerial/WebBluetoothReceiptPrinter` — hanya relevan di browser dengan API tersebut; di Electron renderer Chromium API ini tersedia namun memerlukan kebijakan USB di main process. Dievaluasi Fase 7; bukan jalur utama.

### 4.3 `ReceiptLine` (`@point-of-sale/receiptline`)
- Integrasi encoder dimungkinkan lewat opsi `receiptline` + perintah `receiptline(document)`. Formatnya markup teks + aset terpisah, bukan model objek terstruktur dengan metadata editor.
- **Keputusan:** TIDAK dipakai sebagai format dokumen internal. Model JSON internal (dokumen→node) lebih sesuai kebutuhan edit/undo/validasi. Layout baris-kolom kami petakan langsung ke `encoder.table(...)`/`rule(...)`. (ADR-006)

### 4.4 Pustaka pendukung lain
| Paket | Versi | Lisensi | Catatan verifikasi |
|---|---|---|---|
| `electron` | 44.9.0 (2026-10-17) | MIT | Dipakai pada mayor yang dipinjam di Fase 1 |
| `electron-builder` | 26.15.3 | MIT | Mendukung target `portable` win x64 + artifact |
| `better-sqlite3` | 13.0.3 (2026-08) | MIT | Native addon (`node-addon-api`); butuh rebuild Electron (`electron-rebuild` bawaan electron-builder) — risiko CI dicatat |
| `fflate` | 0.8.3 (2026-05) | MIT | ZIP murni JS 8 kB, zero-dep → mesin `.trstudio` |
| `qrcode` | 1.5.4 | MIT | Menghasilkan canvas/dataURL/SVG di browser & Node → QR offline |
| `jsbarcode` | 3.12.3 (2026-01) | MIT | Zero-dep, render ke SVG/canvas DOM → barcode offline |
| `prosemirror-state/-model` | 1.4.4 / 1.25.12 | MIT | Framework-agnostic (tanpa React); kandidat engine editor (ADR-005) |

## 5. Keputusan arsitektur ringkas (detail lengkap: `docs/ARCHITECTURE.md`)

- **ADR-001** Stack: Electron + HTML/CSS + JavaScript ES modules murni. Dilarang React/Vite/CDN/cloud-runtime.
- **ADR-002** Proses: renderer sandbox-facing dengan `contextIsolation:true`, `nodeIntegration:false`, preload API sempit bertipe IPC tervalidasi (whitelist channel + skema argumen).
- **ADR-003** Alur data satu arah: DocumentModel (JSON) → validator → layout engine (kolom) → dua konsumen: preview DOM & encoder ESC/POS. Encoder/UI/dokumen terpisah modul.
- **ADR-004** `.trstudio` = ZIP (fflate) berisi `manifest.json`, `document.json`, `assets/images/*`, `preview.png` opsional; proteksi path-traversal, batas ukuran, validasi manifest/skema, atomic write (tmp+rename), versioning skema.
- **ADR-005** Editor hibrida: ProseMirror (modular, tanpa React) untuk blok teks vs contentEditable kustom. Rekomendasi sementara: **ProseMirror** untuk paragraf inline; node atomik (image/qr/barcode/separator/table/columnLayout/spacer/dynamicField) sebagai node atom dengan panel properti. Keputusan final ditulis setelah prototipe kecil di Fase 3; alternatif contentEditable didokumentasikan bila kompleksitas PM tidak sepadan.
- **ADR-006** ReceiptLine tidak menjadi format inti (alasan §4.3).
- **ADR-007** Distribusi: `electron-builder` target **`portable`** win x64 saja; output `.exe` tunggal; artifact GitHub Actions; TANPA NSIS/MSI.
- **ADR-008** Tes: lapis-1 `node --test` (lintas platform, cepat, tanpa display) untuk model/layout/storage/encoder-mapping/util; lapis-2 workflow `windows-latest` menjalankan `npm test` + `npm run start:test` (smoke Electron: jendela muncul, judul benar, lalu auto-exit dengan kode sukses) + `dist:win` + upload artifact. Klaim "lulus" hanya dari run aktual yang tercatat.
- **ADR-009** Data pengguna portable: `%APPDATA%\ThermalReceiptStudio` (Electron `app.getPath('userData')`) untuk SQLite/preferensi/recovery/log non-sensitif; folder aplikasi diperlakukan read-only.
- **ADR-010** Offline-first: seluruh dependensi & aset dibundel; tanpa fetch eksternal saat runtime; CSP ketat `default-src 'self'`.

## 6. File yang dibuat/diubah pada fase ini

- `TASKLIST.md` (baru)
- `PROGRESS.md` (baru, file ini)
- `docs/ARCHITECTURE.md` (baru — ADR lengkap + struktur direktori rencana)

Tidak ada file kode aplikasi yang dibuat (dilarang pada Fase 0).

## 7. Risiko teknis yang diketahui

| # | Risiko | Dampak | Mitigasi |
|---|--------|--------|----------|
| R1 | Rebuild native (`better-sqlite3`, `node-printer`) gagal di CI Windows | Fase 8/7 terhambat | Pin versi; gunakan dukungan rebuild electron-builder; fallback jalur driver via `webContents.print`; DB rusak ditangani graceful |
| R2 | `SystemReceiptPrinter` mengirim raw bytes ke printer non-ESC/POS melalui driver | Output sampah di beberapa printer | Dokumentasi jelas per-jalur; uji manual pengguna; profil printer |
| R3 | Perbedaan kolom efektif antar printer (32/35/42/44/48) | Layout bergeser | Profil printer dengan kolom configurable; preview mengikuti nilai profil |
| R4 | Perubahan API v3→v4 encoder (`characterWidths` hilang) | Kode usang | Tulis tes terhadap paket terinstal; audit ulang API saat instalasi Fase 6 |
| R5 | Workspace tidak bisa menjalankan Electron | Umpan balik lambat | Smoke test di CI; modular code testable tanpa Electron |
| R6 | Push/pull GitHub bergantung akses pengguna | Repo tidak tersinkron | Prosedur §8; commit lokal selalu siap di-remote-kan |

## 7.1 Sinkronisasi GitHub (keputusan pengguna, sesi berjalan — opsi 3 dipilih)

- Pengguna memilih agar sinkronisasi repo dibantu dari workspace.
- Kesiapan terverifikasi: `credential.helper=store` aktif; koneksi keluar ke github.com OK; git 2.39.5.
- Prosedur: pengguna membuat **fine-grained token** (akses: repo target, izin *Contents: Read and write*), lalu mengirim **URL repo + token** di chat workspace ini. Kredensial disimpan hanya di credential store workspace (`~/.git-credentials`), tidak pernah ditulis ke file repo/commit/dokumentasi.
- Setelah terhubung: setiap commit fase di-push oleh agent; workflow dipicu otomatis; hasil dapat diverifikasi via API publik (`api.github.com`, endpoint status check & artifacts memerlukan token untuk privat).
- Catatan keamanan: chat adalah jalur transmisi kredensial — setelah seluruh proyek selesai, pengguna disarankan me-revoke token dari GitHub. Alternatif lebih aman tetap tersedia: push manual per fase seperti yang sudah berhasil dilakukan pengguna.

## 8. Menunggu persetujuan pengguna

1. **Persetujuan hasil Fase 0** (arsitektur, pemilihan pustaka, strategi tes/build) untuk memulai Fase 1.
2. **Akses repository GitHub**: karena `/workspace` bukan git repo (§1), saat Fase 1 saya akan inisialisasi git lokal. Untuk push, saya membutuhkan URL repo (mis. `https://github.com/<user>/<repo>.git`) dan metode autentikasi yang tersedia di lingkungan ini (token/credential helper). Alternatif sederhana jika push tidak tersedia dari workspace: pengguna membuat repo kosong di GitHub, lalu saya siapkan seluruh commit dan pengguna push sendiri dengan instruksi yang saya berikan, atau gunakan GitHub Web UI untuk mengunggah file.
3. Konfirmasi bahwa workflow Windows di GitHub Actions (menggunakan menit CI Windows pengguna) dapat diterima sebagai mekanisme build/test.


---

# CATATAN FASE 1 — FONDASI ELECTRON DAN BUILD PORTABLE (2026-10-19)

## Status
Fase 0 dinyatakan **ACCEPTED** oleh pengguna (dokumen di-merge ke repo GitHub). Fase 1 dikerjakan dan kini berstatus **TESTED** (menunggu persetujuan pengguna → belum ACCEPTED).

## Perubahan yang dilakukan (file dibuat/diubah)
- `package.json` — type module, skrip start/test/start:test/dist:win/rebuild:native, konfigurasi electron-builder target **portable win x64** (bukan NSIS/MSI), artifactName `ThermalReceiptStudio-${version}-portable-x64.exe`. DevDeps: electron 44.9.0, electron-builder 26.15.3, cross-env. Tidak ada dependency runtime React/Vite.
- `src/main/bootstrap.cjs` — entry point; menyuntik `--no-sandbox` ke argv HANYA bila uid==0 (kasus runner/container Linux) sebelum Electron init.
- `src/main/main.js` — BrowserWindow judul "Thermal Receipt Studio", contextIsolation true, nodeIntegration false, preload tunggal `trs:invoke` dengan whitelist channel (`app:getVersion`, `app:getUserDataDir`) + validasi payload ketat, single-instance lock, blokir will-navigate non-file: dan window baru, pemisahan data pengguna (`%APPDATA%/ThermalReceiptStudio`), mode smoke `TRS_SMOKE=1`.
- `src/preload/preload.cjs` — contextBridge `window.trs` (hanya 2 fungsi).
- `src/renderer/index.html|renderer.js|app.css` + `styles/app.css` — UI minimal dua panel (editor placeholder + preview contoh), statusbar, CSP ketat `default-src 'none'; script-src 'self'; style-src 'self'`, tanpa resource jarak jauh.
- `tests/config.test.js` (8 tes) + `tests/smoke-harness.test.js` (2 tes).
- `.github/workflows/ci-test.yml` — matriks ubuntu+windows × Node 20/22, `npm ci && npm test`.
- `.github/workflows/build-windows.yml` — windows-latest: unit test → smoke Electron (verifikasi `TRS_SMOKE_OK`) → `npm run dist:win` → upload artifact `dist/*.exe` (`if-no-files-found: error`).
- `.gitignore`, `README.md` diperbarui sesuai implementasi aktual.

## Keputusan arsitektur fase ini
1. **Bootstrap CJS** diperlukan karena Chromium memeriksa root/no-sandbox SEBELUM kode ESM user berjalan (dibuktikan oleh kegagalan smoke pertama di workspace: `FATAL electron_main_delegate.cc ... Running as root without --no-sandbox`). Pada Windows produksi tidak berdampak.
2. Smoke CI memakai `--no-sandbox` eksplisit agar deterministik di runner; aplikasi final dijalankan pengguna tanpa flag itu (belum diverifikasi pada mesin pengguna — dinyatakan sebagai tes manual).
3. CSS disalin ke `src/renderer/app.css` agar seluruh aset renderer berada dalam satu folder yang dibundel (asar) — sumber kanonik tetap `styles/app.css` sampai Fase 2 merapikan pipeline.

## Hasil pengujian AKTUAL (dijalankan di workspace Linux)
- `npm install` → sukses (electron 44.9.0 terpasang).
- `npm test` → **10/10 pass, 0 fail** (dua kali: sebelum & sesudah perubahan bootstrap).
- Smoke Electron NYATA dengan Xvfb: `DISPLAY=:99 TRS_SMOKE=1 npx electron . --no-sandbox` → **exit 0**, stdout: `TRS_SMOKE_OK window-title="Thermal Receipt Studio"` (jendela benar-benar dibuat, preload+CSP tidak memblokir renderer).
- Kegagalan yang ditemukan & diperbaiki selama fase: (a) libgtk-3 hilang di container → dipasang dependensi sistem; (b) root sandbox FATAL → solusi bootstrap + flag CI (direkam di atas).

## Keterbatasan lingkungan (tidak diklaim)
- Workspace Linux TIDAK dapat menjalankan `electron-builder --win portable` (butuh runner Windows) → build `.exe` diserahkan ke workflow `build-windows.yml`.
- `/workspace/.git` tidak memiliki remote; push tidak dapat dilakukan dari sini. Pengguna perlu menambahkan remote/credential atau menyalin file ke repo.
- Workflow Actions BELUM diverifikasi lulus — baru dibuat. Jangan dianggap berhasil sampai run aktual hijau.

## Menunggu persetujuan pengguna
- Verifikasi hasil run workflow setelah push (langkah di laporan fase).
- Persetujuan Fase 1 sebelum memulai Fase 2.
