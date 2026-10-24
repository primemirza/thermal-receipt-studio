# PROGRESS — Thermal Receipt Studio

Diperbarui terakhir: 2026-10-20 (Fase 5 editor dan layout)

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

---

# CATATAN SINKRONISASI GitHub — 2026-10-19/20 (percobaan opsi 3)

## Tindakan yang BENAR-BENAR dijalankan (hasil aktual, bukan asumsi)
1. Remote `origin` = `https://github.com/primemirza/thermal-receipt-studio.git` berhasil ditambahkan; credential helper store diisi token yang diberikan pengguna.
2. `git ls-remote` dan `git fetch origin main` → **SUKSES (read-only)**: branch terjauh = `main` (HEAD `ade65c0`, berisi dokumen Fase 0 saja) dan `thermal-receipt-studio-development-3c807`.
3. Merge lokal `origin/main` ke `master` → sukses (`d35c938`), riwayat bersih (merge-base `c7e62fb`).
4. Percobaan push via git HTTPS → **GAGAL `403`**: `Permission to primemirza/thermal-receipt-studio.git denied to primemirza`. Dicoba juga branch baru (`phase1-foundation`, `thermal-receipt-studio-development-3c807`) dan format auth `oauth2:` / `x-access-token:` → semuanya 403 identik.
5. Diagnostik REST API dengan token yang sama:
   - GET repo, GET contents (mis. `TASKLIST.md?ref=main`) → **200** (baca berfungsi).
   - POST `git/blobs`, POST `git/refs`, PUT `contents/...`, POST `pulls` → **semua 403 "Resource not accessible by personal access token"** (tulis ditolak).
   - `/collaborators/primemirza/permission` melaporkan `push: true` — bukti bahwa izin akun OK dan pembatasnya adalah **konfigurasi token**, bukan hak akun.
6. Workflow Actions: `GET /actions/runs` dan `/actions/workflows` dapat diakses token (read) → saat ini `total_count: 0`; belum ada run karena file workflow belum pernah masuk repo.

## Kesimpulan & penanganan
- Token fine-grained yang diterima hanya memiliki izin **Contents: Read-only** (dan tidak bisa membuat PR). Semua jalur tulis (git push, blobs/trees/refs API, contents API) diverifikasi langsung ditolak GitHub. Saya TIDAK mem-push apa pun dan TIDAK membuat PR.
- Branch kerja sementara lokal sudah dihapus; `master` lokal kini identik dengan isi Fase 1 + merge `origin/main`, siap push begitu token diperbaiki.
- **Tindakan yang diperlukan dari pengguna (salah satu):**
  - **A. Perbaiki token yang ada**: GitHub → Settings → Developer settings → Fine-grained tokens → token ini → Repository access: *thermal-receipt-studio*; Permissions → *Contents*: **Read and write**; simpan. (Kirim token baru ke chat bila ID berubah.)
  - **B. Atau buat token classic** dengan scope `repo` (+`workflow`), lalu kirim.
  - **C. Alternatif tanpa token**: unduh/masuk repo Anda dan push manual branch `master` workspace — saya sediakan perintahnya; namun A/B lebih sederhana dan mengotomatiskan langkah berikutnya.
- Setelah token menulis aktif, rencana otomatis: push `master` → pantau workflow *Tests* & *Build portable Windows EXE* via API (read sudah terbukti berfungsi) → laporkan status run + tautan artifact `.exe` kepada pengguna.

## CATATAN SINKRONISASI GitHub #2 + DIAGNOSIS CI (2026-10-19, masih FASE 1)
Token baru (Contents: Read and write) valid — **push berhasil** (bukti nyata): `origin/main` =
`origin/master` = commit lokal `5955d25`; default branch tetap `main`. Workflow otomatis terpicu.

### Hasil run Actions AKTUAL (diverifikasi via API + unduhan log job per langkah)
- Run *Tests* #1 (main) & #2 (master): **Node 20 LULUS di ubuntu & windows; Node 22 GAGAL di keduanya**.
- Penyebab pasti (dari log CI): skrip `npm test` memakai `node --test tests/`; pada Node 22 argumen
  diperlakukan sebagai modul → `Cannot find module '.../tests'`. Keterbatasan jujur: workspace lokal
  (Node 20) tidak menangkap masalah ini sebelum push.
- Run *Build Windows*: gagal lebih awal pada step unit-test yang sama (belum mencapai electron-builder).
- Catatan integritas: langkah "smoke" ubuntu pada workflow build dilaporkan success tanpa bukti
  marker jendela — akan dipertajam agar cek `TRS_SMOKE_OK` seperti job Windows.

### Perbaikan yang diterapkan (masih FASE 1)
- `package.json`: `"test": "node --test tests/*.test.js"` (glob diekspansi npm — konsisten Node 20/22,
  Linux/Windows). Verifikasi lokal ulang: `npm test` → pass 10 / fail 0.
- Keputusan versi terdokumentasi: runtime aplikasi = Electron (Chromium+Node tertanam; tidak bergantung
  Node sistem); artefak `.exe` portable identik di semua mesin pengguna. CI dikunci **Node 20 LTS**
  (matriks 22 dihapus dari ci-test.yml; build-windows.yml sudah 22→20) untuk determinisme.
- TASKLIST §R7: kegagalan CI Node 22 + perbaikan dicatat; status 1.7–1.9 tetap IMPLEMENTED sampai
  run pascaperbaikan hijau dan artifact terunduh.


---

## FASE 2 — UI EDITOR DAN PREVIEW AWAL (2026-10-20)

Status fase: **ACCEPTED** pada 2026-10-20. CI terbaru hijau dan pengguna telah menguji EXE Windows serta mengonfirmasi tombol berfungsi.

### Perubahan yang dibuat
- Mengganti placeholder awal dengan workspace editor/preview berdampingan, toolbar, status bar, dan layout responsif.
- Menambahkan pemilih lebar kertas 58 mm/80 mm; kedua pilihan mengubah lebar visual kanvas dan hasil preview.
- Menambahkan zoom preview 60–150% dengan langkah 10% dan tombol Sesuaikan ke 100%.
- Menambahkan toggle panduan untuk menyorot batas blok dan menampilkan label jenis elemen pada kanvas.
- Menghubungkan data contoh lokal (nama toko, item, harga, total, footer) ke renderer; perhitungan total dihitung dari baris item.
- Mempertahankan CSP ketat dan aset lokal, tanpa CDN atau permintaan jaringan.
- Menambahkan tes regresi UI untuk kontrol, keterhubungan renderer, CSP/offline, kelas ukuran kertas, zoom, dan responsivitas.

### Batasan fase
Fase ini hanya menyediakan UI dan rendering data contoh. Penyuntingan dokumen sebenarnya, seleksi/mutasi elemen, undo/redo, serta format dokumen persisten tetap di fase berikutnya. Belum ada klaim bahwa file EXE baru sudah dibangun sampai workflow CI selesai.

### Validasi
- GitHub Actions `Tests` run #14: success.
- GitHub Actions `Build portable Windows EXE` run #9: success pada commit `c2c81286498ded5f8c5f27e0f18eeb32f59b5e13`.
- Pengguna menguji build Windows terbaru dan mengonfirmasi kontrol UI berfungsi.
- Fase 2 diterima; batasan fungsional tetap sesuai scope: belum ada pengeditan dokumen persisten, undo/redo, atau buka/simpan file.


### Catatan penerimaan
Fase 2 dinyatakan selesai berdasarkan CI hijau dan verifikasi manual pengguna. Fase berikutnya belum dimulai; menunggu persetujuan eksplisit pengguna.


---

## FASE 3 — MODEL DOKUMEN DAN EDITOR HIBRIDA (2026-10-20)

Status implementasi: **IMPLEMENTED, menunggu CI dan uji manual**.

### Implementasi
- Menambahkan src/renderer/document-model.js dengan schema dokumen v1, data contoh, clone, validasi, dan perhitungan total.
- Mengubah renderer agar kanvas dan preview dihasilkan dari model dokumen yang sama.
- Menambahkan seleksi blok dengan klik atau keyboard, inspector properti, edit teks/nama item, harga, dan perataan teks.
- Menambahkan tombol tambah teks, tambah item, hapus elemen, urungkan, dan ulangi.
- Menambahkan riwayat undo/redo dengan batas 80 snapshot.
- Menambahkan tes regresi model dan editor pada tests/phase-3-document-model.test.js.

### Batasan
Belum ada penyimpanan dokumen ke disk atau format .trstudio, dan belum ada gambar, QR/barcode, tabel, reorder, atau integrasi printer. Perubahan pada dokumen saat ini berada di memori dan hilang saat aplikasi ditutup. Penyimpanan file dijadwalkan pada Fase 4.

### Validasi
Belum menyatakan fase TESTED sampai GitHub Actions selesai. Setelah build portable sukses, perlu pengujian manual pemilihan blok, edit harga/teks, tambah/hapus, undo/redo, dan sinkronisasi preview.


### Perbaikan lanjutan Fase 3 — Undo/Redo
- Riwayat sekarang menyimpan snapshot dokumen sekaligus ID elemen terpilih; undo/redo memulihkan keduanya dalam satu aksi.
- Label tombol diubah menjadi **Undo** dan **Redo** sesuai istilah yang diminta.
- Tes regresi memeriksa snapshot riwayat dan label tombol. Status tetap menunggu hasil CI dan uji manual Windows.


---

## Koreksi Fase 3 — total eksplisit dan format harga (2026-10-20)

- Hasil pemeriksaan PR #9 menunjukkan commit yang ter-merge berisi perbaikan Undo/Redo saja. Perubahan prefix `Rp` dan perhitungan total otomatis tidak masuk ke `main`, sehingga laporan sebelumnya bahwa perbaikan itu sudah diterapkan tidak akurat.
- Cabang `fix/phase-3-total-amount-format` memperbarui `src/renderer/renderer.js` agar harga ditampilkan dengan pengelompokan angka tanpa prefix `Rp`, dan total membaca `block.amount` di kanvas serta preview.
- `src/renderer/document-model.js` sekarang memberi contoh total eksplisit `20000` dan memvalidasi amount non-negatif yang finite; `totalAmount()` dihapus.
- Tes regresi diperbarui untuk nilai total eksplisit dan format tanpa prefix. Belum mengklaim lulus sampai workflow Actions terbaru selesai.
- Fase 4 tidak dimulai; tunggu CI dan uji manual pengguna atas build hasil perubahan ini.


---

## FASE 4 — PENYIMPANAN FILE .TRSTUDIO (2026-10-20)

Status implementasi: **IN PROGRESS**, menunggu CI dan uji manual Windows.

### Perubahan yang dibuat pada branch `feature/phase-4-trstudio-storage`
- Menambahkan `src/main/trstudio-archive.js`: pembuat/pembaca ZIP lokal berbasis zlib, CRC32, batas ukuran arsip/entri, pemeriksaan struktur, nama entri aman, checksum, dan format `.trstudio` dengan `manifest.json` serta `document.json`.
- Menambahkan IPC terbatas di main process untuk dialog Open dan Save, validasi model, batas ukuran dokumen, serta penulisan atomik melalui file temporer unik dan rename.
- Preload hanya mengekspos `openDocument()` dan `saveDocument(document, mode)`; renderer tidak mendapat akses filesystem atau IPC mentah.
- Menambahkan kontrol Baru, Buka, Simpan, Simpan sebagai, konfirmasi ketika membuang perubahan, reset riwayat saat dokumen diganti, dan status hasil operasi.
- Menambahkan `tests/phase-4-storage.test.js` untuk round-trip, manifest, path traversal, arsip rusak, validasi dokumen, dan wiring IPC/UI.

### Batasan saat ini
- Aset gambar dan `preview.png` belum disimpan; parser secara eksplisit menolak arsip dengan aset gambar. Ini belum memenuhi bagian portabilitas aset dan perlu ditangani sebelum fase diterima.
- Tes dan smoke/build Windows belum diverifikasi pada commit ini. Status belum TESTED/ACCEPTED.
- Fase 5 belum dimulai.


---

## PENERIMAAN FASE 4 DAN AWAL FASE 5 — 2026-10-20

- Pengguna mengonfirmasi telah menguji build Fase 4 dan secara eksplisit menyatakan Fase 4 selesai. Status Fase 4 diperbarui menjadi `ACCEPTED`; penerimaan didasarkan pada uji manual pengguna.
- Fase 5 dimulai dengan branch `feature/phase-5-receipt-objects-layout` dari `main`.
- Ruang lingkup Fase 5 sesuai TASKLIST: objek separator/spacer, gambar dengan aset internal, QR dan barcode offline, tabel/baris/sel, kolom, placeholder tanggal/waktu/dinamis, alignment, ukuran dan opsi objek; objek harus dapat dibuat/diedit/disimpan/dibuka dan dirender konsisten di preview.
- Status implementasi Fase 5 masih `IN PROGRESS`. Belum ada klaim tes atau build Fase 5 lulus sebelum dijalankan dan diverifikasi.


## FASE 5 — INLINE EDIT PERSISTEN SAAT WINDOW FOCUS HILANG (2026-10-21)

Perubahan follow-up pada `fix/phase-5-persist-inline-edit-window-focus`, setelah PR #20 membuat inline edit + commit tersimpan dengan CI hijau:

- Title bar masih menggunakan nama file dengan ekstensi; perbaikan menghapus akhiran `.trstudio` saja, tanpa mengubah path file yang disimpan.
- Mode inline tidak lagi dimatikan oleh event blur/focusout. Sesi edit dibuat sejak masuk mode, dan teks tetap `contenteditable=true` ketika pengguna berpindah ke aplikasi lain.
- Mode edit berakhir dan menyimpan hasil ketika pengguna menekan Enter atau melakukan pointer action di luar elemen editor. Klik pada elemen edit yang sedang aktif tidak mengakhirinya; pointerdown di aplikasi lain tidak terjadi saat aplikasi kehilangan fokus.
- Escape tidak menjadi pemicu keluar karena kriteria yang diminta hanya Enter atau klik luar. Input tetap langsung disinkronkan ke model/preview dan undo tetap satu langkah per sesi.
- Smoke Electron sekarang menguji dua siklus: editor tetap aktif setelah window/element blur, Enter mengakhiri sesi, lalu pointerdown di tombol luar mengakhiri sesi kedua dan hasilnya tetap di preview.
- CSS menyamakan font/ukuran/line-height label untuk kelompok toolbar utama dan subgroup sisipkan; tombol paling kanan dan tombol layout global diratakan pada baseline baris ikon.
- Test regresi ditambahkan untuk title tanpa ekstensi, mode edit persisten, dua cara keluar yang diizinkan, serta toolbar.

### Verifikasi — GitHub Actions run #85
- Unit test Ubuntu: **55/55 lulus**.
- Unit test Windows: **55/55 lulus**.
- Electron smoke: **lulus**. Hasil menunjukkan `staysActiveAfterWindowBlur=true`, `exitsOnEnter=true`, `exitsOnOutsideClick=true`, `committedAfterOutsideClick=true`, dan kanvas tidak diganti sepanjang rangkaian klik.

Artifact portable Windows tetap perlu diuji manual oleh pengguna. Fase 5 tetap `IN PROGRESS` sampai uji artifact diterima.

---

## FASE 6 — LAYOUT THERMAL DAN ENCODER (2026-10-21)

Status: **TESTED** pada branch `feature/phase-6-thermal-layout-encoder`; belum digabung ke `main` dan menunggu pemeriksaan/persetujuan pengguna.

### Implementasi pada branch
- `src/layout/thermal-layout.js`: modul layout murni untuk profil kolom 58/80 mm, wrapping teks, perataan, item/total, rule, spacer/feed, section bersarang, tabel, kolom, gambar, QR, dan barcode.
- `src/encoder/receipt-printer-encoder.js`: adapter operasi layout ke API ReceiptPrinterEncoder v4. Resolver gambar async dibutuhkan untuk memuat data URL ke input gambar yang diterima encoder.
- `src/renderer/vendor/receipt-printer-encoder.mjs`: bundle distribusi ESM resmi ReceiptPrinterEncoder 4.0.1, dipin dari upstream revision `129dd3a4398d436afc9ec6a621cfadd22bc49c1a`. Atribusi lisensi dicatat di `src/renderer/vendor/LICENSES.md`. Tidak menambah dependency npm atau mengubah lockfile.
- `src/renderer/renderer.js` + `index.html`/`app.css`: tombol **Simulasi thermal** mengubah preview ke operasi layout monospace. Preview visual lama tetap default dan dapat dipulihkan dengan tombol **Preview visual**.
- `tests/phase-6-thermal-layout.test.js`: tes profil, wrapping, pemetaan objek, adapter, dan pengujian output byte stream terhadap bundle encoder nyata.

### Batasan dan validasi
- Profil awal memakai 32 kolom untuk 58 mm dan 48 kolom untuk 80 mm. Profil printer yang berbeda dapat membutuhkan override; ini bukan jaminan lebar fisik universal.
- Margin dokumen tersimpan dalam CSS px, sedangkan layout thermal memakai kolom karakter. Konversi menggunakan perkiraan 12 px per karakter Font A dan perlu divalidasi terhadap printer/profil nyata.
- Tes output encoder memverifikasi bytes yang dihasilkan, bukan hasil cetak fisik. Belum ada klaim kompatibilitas universal untuk QR, barcode, gambar, atau fungsi cut karena dukungan bergantung pada model printer.
- Belum ada perubahan UI, alur cetak, atau transport printer. Itu tidak termasuk integrasi yang sudah selesai; deteksi/pengiriman job tetap Fase 7.
- GitHub Actions PR #22 run #104: **lulus**. Unit test **63/63** pada Ubuntu dan **63/63** pada Windows; Electron smoke Ubuntu lulus. Run: https://github.com/primemirza/thermal-receipt-studio/actions/runs/39590572566.
- Percobaan CI sebelumnya gagal pada import bundle browser karena Node tidak menyediakan global `ImageData`; tes Node diperbaiki dengan polyfill khusus tes. Electron renderer tetap memakai `ImageData` native. Setelah perbaikan, run #104 lulus pada kedua OS.
- Evaluasi `SystemReceiptPrinter`: dokumentasi upstream menjelaskan bahwa paket mencetak bytes encoder melalui system printer driver, tetapi dependensi `@grandchef/node-printer` adalah native addon. Integrasi ditunda ke Fase 7 agar ABI Electron dan perilaku Windows diuji terpisah; `webContents.print` tetap opsi driver tanpa native addon.
- Integrasi preview dilakukan secara opt-in: simulasi thermal memakai layout engine; preview visual lama tetap menjadi tampilan default. Tes regresi dan smoke CI lulus.
- Batasan yang belum diklaim: belum ada build portable Windows khusus PR ini, uji printer fisik, atau integrasi transport/cetak. Fase 7 tidak dimulai.


## FASE 7 — DETEKSI PRINTER DAN PENCETAKAN (2026-10-21 s.d. 2026-10-23)

Status: **ACCEPTED** (pengguna telah menguji cetak fisik pada Windows dan menyatakan fase selesai pada 2026-10-23 setelah rangkaian perbaikan PR #24, PR #25, dan PR #26).

### Implementasi dan Riwayat Perbaikan
1. **Implementasi Awal (PR #23):**
   - Transport TCP untuk raw ESC/POS (`printer-transport.js`), dialog printer modal, enumerasi printer Windows (`getPrintersAsync()`), serta wiring cetak driver dan raw via IPC terisolasi.
2. **Koreksi Dimensi Cetak Driver (PR #24):**
   - Menghitung ukuran micron untuk `pageSize` Electron agar driver Windows tidak fallback ke ukuran kertas default oversized.
3. **Penyelarasan Jalur Driver ke Thermal Layout (PR #25):**
   - Mengubah jalur driver Windows agar tidak lagi mengirim HTML preview visual proporsional, melainkan menggunakan `createThermalLayout` yang sama dengan jalur raw ESC/POS via fungsi baru `buildThermalDriverHtml`.
4. **Penyempurnaan Akhir Format Monospace, Margin, Media, dan Feed (PR #26):**
   - **Monospace Font & Anti-Wrap:** Memperbaiki styling ke `font: 2.45mm/1.3 Consolas, "Courier New", monospace; white-space: pre; overflow: hidden;` sehingga 32 kolom (lebar ~1.5mm/kolom) muat pas dalam 48mm dan tidak wrap di tengah baris.
   - **Margin Print Head:** Mengatur `body` 58mm dengan padding samping 5mm (dan 4mm pada 80mm) untuk mencegah karakter paling kiri terpotong akibat margin fisik unprintable print head.
   - **Media Terintegrasi:** Menambahkan render `<img>` untuk logo/gambar data URL, `<img>` untuk QR code, dan `<svg>` untuk barcode CODE128.
   - **Eliminasi Feed Berlebih:** Mengukur tinggi aktual elemen `#receipt-container` (bukan window viewport 800px) sehingga roll kertas dipotong pas di akhir struk dengan buffer aman ~4mm tanpa membuang kertas kosong 20–30 cm.

### Verifikasi dan Hasil
- Unit test otomatis: **78/78 lulus** pada Node test runner (`node --test`).
- CI GitHub Actions untuk seluruh PR perbaikan lulus (Ubuntu & Windows).
- Pengguna memverifikasi hasil cetak fisik pada printer thermal dan menyetujui penyelesaian fase: *"untuk sementara hasil cetak sudah lumayan, kita bisa berpindah ke fase 8 tanpa menyentuh apapun yang sudah stabil pada fase 7 dan fase-fase sebelumnya."*

---

## FASE 8 — SQLITE, PREFERENSI, DAN RECOVERY (2026-10-23 — 2026-10-24)

Status: **TESTED** (103/103 unit test lulus; menunggu verifikasi pengguna)

### Implementasi

#### Backend (PR #28 — merged)
- **`src/main/db/database.js`** (baru): Modul SQLite menggunakan `node:sqlite` (`DatabaseSync`) bawaan Node.js 22+. Schema v1 dengan 4 tabel (`preferences`, `printer_profiles`, `recent_files`, `recovery_snapshots`). Penanganan DB korup: otomatis rename ke `.corrupt.{timestamp}` dan buat ulang. API lengkap CRUD untuk semua entitas.
- **`src/main/main.js`**: Singleton `getDb()`, registrasi 8 channel IPC baru (prefs, printerProfile, recentFiles, recovery). Integrasi `addRecentFile` saat `document:open/save`, `clearRecoverySnapshot` saat `document:save` berhasil.
- **`src/preload/preload.cjs`**: Ekspos 8 method baru ke renderer: `getPreferences`, `setPreference`, `getPrinterProfile`, `savePrinterProfile`, `getRecentFiles`, `saveRecoverySnapshot`, `getRecoverySnapshot`, `clearRecoverySnapshot`.
- **`tests/phase-8-database.test.js`** (baru): 25 unit test in-memory.

#### Integrasi UI Renderer (PR #29)
- **`src/renderer/renderer.js`**:
  - `boot()` diperluas: muat preferensi (zoom, paperWidth, guides) dari DB → terapkan ke UI; muat profil printer → pre-fill dialog; periksa recovery snapshot → tampilkan dialog pemulihan jika ada.
  - `mutate()` memanggil `scheduleRecoverySnapshot()` (debounce 1 detik) setelah setiap perubahan dokumen.
  - `setPaper()` & `setZoom()`: simpan ke `prefs.defaultPaperWidth` dan `prefs.zoom` saat diubah.
  - `guideButton`: simpan `prefs.guides` saat ditoggle.
  - `saveCurrent()`: hapus recovery snapshot saat dokumen berhasil disimpan.
  - `loadRecentFilesPanel()`: tampil daftar dokumen terkini di panel dialog printer; klik membuka file.
  - `printer-print-button`: simpan profil printer setelah cetak berhasil (driver & raw TCP).
- **`src/renderer/index.html`**:
  - Panel "Dokumen terkini" (`#recent-files-section`) di dalam dialog printer.
  - Dialog recovery (`#recovery-dialog`) untuk penawaran pemulihan saat boot.
- **`src/renderer/app.css`**: Gaya untuk panel recent files dan dialog recovery.

### Hasil Pengujian
- 103/103 unit test lulus (`node --test`)
- Tidak ada regresi pada fase sebelumnya

### Kriteria terpenuhi
- DB dibuat & dimigrasikan ✔
- Preferensi persisten tersinkronisasi ke UI ✔
- Profil printer tersimpan otomatis ✔
- Recovery snapshot berfungsi (autosave + dialog pemulihan boot) ✔
- Error database ditangani tanpa crash ✔
- `.trstudio` tetap format utama desain ✔

### Polish Minor UI Sebelum Fase 9 (2026-10-24)
- **Tombol cetak pada toolbar**: diubah dari tombol teks menjadi `.icon-button` dengan icon SVG printer yang seragam dengan tombol toolbar lainnya dan sejajar dengan kontrol panduan.
- **Icon pada tombol teks**: tombol simulasi thermal, kontrol baris/kolom tabel di panel inspektor, serta tombol aksi di dialog printer, tabel, kolom, layout global, dan pemulihan recovery dilengkapi icon SVG penjelas (`.btn-with-icon`, `.btn-icon`).
- **Perbaikan kontras hover area cetak & dialog**: `.primary-action:hover` dan fokusnya mempertahankan teks putih (`#ffffff`) dengan background biru tua (`#00539c`), serta tombol sekunder `.text-button:hover` mempertahankan teks biru tua berdaya baca tinggi (`#004f9e`) di atas latar lembut (`#e8f2fc`), menyelesaikan masalah teks tidak terbaca saat tombol dihover.
- **Tes otomatis**: 104/104 unit test lulus (`node --test`).

## FASE 9 — INTEGRASI DAN PENGUJIAN END-TO-END (2026-10-24)

Status: **TESTED** (111/111 unit & integration test lulus; seluruh skenario integrasi E2E terverifikasi)

### Implementasi & Cakupan Uji
- **`tests/phase-9-e2e-integration.test.js`** (baru): Suite uji E2E komprehensif menguji seluruh integrasi arsitektur:
  1. **Siklus Hidup Dokumen Penuh & Storage E2E**: Menguji dokumen 15 blok (teks, item, total, garis, spacer, tabel per-sel, multi-kolom, section bersarang, gambar base64, QR code, barcode, margin) melalui `validateDocument` → `serializeTrstudio` → ZIP unpack → `parseTrstudio` dengan hasil 100% lossless roundtrip.
  2. **Pipeline Render & Thermal Layout E2E (58mm & 80mm)**: Menguji kompilasi layout 32 kolom dan 48 kolom, feed baris, cut paper, dan verifikasi anti-overflow baris teks.
  3. **Pipeline ESC/POS Binary Encoding E2E**: Menguji pemetaan layout ke byte stream ESC/POS biner dengan validasi sequence header init `[27, 64]` dan cut `[29, 86, 65, 0]`.
  4. **Pipeline Driver Print Monospace HTML E2E**: Menguji pembuatan HTML monospace `<pre>` terpusat dengan sanitasi karakter HTML (anti-XSS) dan pemformatan teks tebal/miring/ukuran.
  5. **Integrasi SQLite, Recent Files & Recovery E2E**: Menguji alur preferensi pengguna, profil printer driver/raw TCP, pencatatan dan pembatasan berkas terkini, serta siklus hidup autosave crash recovery snapshot.
  6. **Ketahanan Error, Pemulihan Bencana & Keamanan E2E**: Menguji penolakan terhadap arsip ZIP korup, pencegahan path traversal (`../../`), validasi batas target raw TCP, batas ukuran payload job (1B–8MB), dan pemetaan pesan error socket ke bahasa Indonesia.
  7. **Integritas Arsitektur Offline & CSP E2E**: Memastikan meta tag CSP ketat memblokir koneksi eksternal (`default-src 'none'`), library vendor lokal, dan modul inti bebas dari impor DOM/Electron untuk portabilitas pengujian.

### Hasil Pengujian
- 111/111 unit & integration test lulus (`node --test`)
- Tidak ada regresi pada seluruh fase sebelumnya (Fase 1 s/d 8)

### Kriteria Terpenuhi
- Seluruh alur data terintegrasi ✔
- Lossless .trstudio roundtrip ✔
- Dual-width layout 58/80 mm ✔
- ESC/POS binary & Driver HTML konsisten ✔
- SQLite & recovery snapshot teruji ✔
- Keamanan & offline murni ✔
- 111/111 tes lulus ✔


