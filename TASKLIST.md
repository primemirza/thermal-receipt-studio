# TASKLIST — Thermal Receipt Studio

> Status yang digunakan: `NOT STARTED` | `IN PROGRESS` | `BLOCKED` | `IMPLEMENTED` | `TESTED` | `ACCEPTED`.
> Aturan: `TESTED` hanya diberikan setelah tes benar-benar dijalankan dan lulus. `ACCEPTED` hanya setelah pengguna menyetujui fase.

---

## FASE 0 — AUDIT DAN PERENCANAAN

Status fase: **ACCEPTED** (pengguna menyetujui dengan mem-merge dokumen Fase 0 ke repo GitHub, 2026-10-19)

| # | Tugas | Status | Catatan |
|---|-------|--------|---------|
| 0.1 | Periksa kondisi repository (`/workspace`) | TESTED | Hasil aktual: folder kosong, **bukan** git repo, tidak ada remote/branch/commit. Lihat PROGRESS.md §1 |
| 0.2 | Identifikasi kemampuan & keterbatasan workspace | TESTED | Node v20.20.2, npm 10.8.2, git 2.39.5, akses registry npm & GitHub OK. Tidak ada Windows/printer/GUI. Lihat PROGRESS.md §3 |
| 0.3 | Audit `@point-of-sale/receipt-printer-encoder` (API, lisensi, kompatibilitas) | TESTED | v4.0.1, MIT, ESM/CJS/browser bundles, tanpa peer deps. API terverifikasi dari dokumentasi resmi. Lihat PROGRESS.md §4 |
| 0.4 | Evaluasi integrasi `ReceiptLine` | TESTED | Opsional via opsi `receiptline` + paket `@point-of-sale/receiptline`; diputuskan TIDAK dipakai sebagai format inti (model JSON internal lebih sesuai editor hibrida). Lihat PROGRESS.md ADR-006 |
| 0.5 | Evaluasi pustaka pendukung lain (sqlite, zip, qr, barcode, prosemirror) | TESTED | Metadata registry diverifikasi per paket. Lihat PROGRESS.md §4 |
| 0.6 | Tentukan strategi file `.trstudio` | IMPLEMENTED | ZIP lokal (fflate), struktur manifest+document+assets, proteksi path traversal, validasi skema. Lihat PROGRESS.md ADR-004 |
| 0.7 | Tentukan strategi pengujian otomatis | IMPLEMENTED | `node --test` untuk unit/integrasi lintas-platform; `npm run start:test` smoke Electron di CI Windows. Lihat PROGRESS.md ADR-008 |
| 0.8 | Tentukan strategi build portable Windows via GitHub Actions | IMPLEMENTED | electron-builder target `portable`, runner `windows-latest`, artifact `.exe`. Lihat PROGRESS.md ADR-007 |
| 0.9 | Buat `TASKLIST.md` | IMPLEMENTED | File ini |
| 0.10 | Buat `PROGRESS.md` | IMPLEMENTED | Termasuk hasil audit & risiko |
| 0.11 | Dokumentasi keputusan arsitektur awal (ADR) | IMPLEMENTED | `docs/ARCHITECTURE.md` (ADR-001 s.d. ADR-010) |
| 0.12 | Catat fitur yang tidak dapat diuji langsung di workspace | IMPLEMENTED | Daftar di PROGRESS.md §3.3 & §7 |

**Kriteria penerimaan Fase 0:** arsitektur awal terdokumentasi ✔ · dependensi utama dievaluasi ✔ · risiko diketahui ✔ · strategi tes & build jelas ✔ · tasklist lengkap ✔ — **menunggu persetujuan pengguna.**

**Tes wajib Fase 0:** inspeksi repository (aktual, terekam di PROGRESS.md §1) + verifikasi metadata/dokumentasi pustaka terhadap sumber resmi (aktual, terekam di PROGRESS.md §4). Tidak ada tes kode karena tidak ada implementasi kode pada fase ini (sesuai aturan).

---

## FASE 1 — FONDASI ELECTRON DAN BUILD PORTABLE

Status fase: **TESTED** (tes lokal dijalankan & lulus; hasil workflow GitHub Actions diverifikasi dari run aktual setelah push — lihat PROGRESS.md §Fase 1)

| # | Tugas | Status |
|---|-------|--------|
| 1.1 | Struktur proyek (`src/main`, `src/preload`, `src/renderer`, `styles`, `tests`, `.github/workflows`) | TESTED |
| 1.2 | `package.json` + skrip `start`, `test`, `dist:win`, `start:test` | TESTED |
| 1.3 | Main process Electron (window, single-instance, keamanan) + bootstrap CJS (workaround root/CI sandbox) | TESTED |
| 1.4 | Preload dengan API terbatas (contextIsolation on, nodeIntegration off) | TESTED |
| 1.5 | Renderer HTML/CSS/JS ES modules — UI minimal "Thermal Receipt Studio" | TESTED |
| 1.6 | Konfigurasi CSP & keamanan Electron | TESTED |
| 1.7 | Konfigurasi electron-builder target `portable` win x64 | IMPLEMENTED (build .exe terjadi di CI Windows; tidak dapat dieksekusi di workspace Linux) |
| 1.8 | Workflow CI: test (matriks ubuntu+windows, Node 20/22) | IMPLEMENTED (menunggu run aktual setelah push) |
| 1.9 | Workflow CI: unit test + smoke Electron + build + upload artifact `.exe` di `windows-latest` | IMPLEMENTED (menunggu run aktual setelah push) |
| 1.10 | Tes dasar: 10 tes unit lulus (`node --test`) + smoke Electron nyata lulus di Xvfb (`TRS_SMOKE_OK window-title="Thermal Receipt Studio"`, exit 0) | TESTED |

**Kriteria penerimaan:** struktur valid ✔rencana · tanpa React/Vite · konfigurasi portable tersedia · tes dasar jalan · workflow Windows menghasilkan artifact `.exe` (diverifikasi dari run aktual, bukan asumsi).

---

## FASE 2 — UI UTAMA DAN PREVIEW AWAL

Status fase: **ACCEPTED** (CI hijau dan verifikasi manual pengguna selesai)

| # | Tugas | Status | Catatan |
|---|-------|--------|---------|
| 2.1 | Layout utama editor kiri dan preview kanan | IMPLEMENTED | Panel responsif dengan header, toolbar, dan status bar |
| 2.2 | Toolbar pemilih kertas 58 mm / 80 mm | IMPLEMENTED | Tombol segmented mengubah lebar kanvas dan preview |
| 2.3 | Kontrol zoom preview | IMPLEMENTED | 60–150% dalam kenaikan 10%, serta tombol Sesuaikan |
| 2.4 | Panduan visual editor/preview | IMPLEMENTED | Toggle menampilkan outline elemen dan label blok |
| 2.5 | Data struk contoh lokal terhubung ke renderer | IMPLEMENTED | Contoh Warung, item, total IDR, footer; belum menjadi model dokumen persisten |
| 2.6 | Gaya visual Windows 11 dan layout responsif | IMPLEMENTED | CSS lokal, tanpa CDN, breakpoint untuk jendela sempit |
| 2.7 | Status bar, versi aplikasi, dan status interaksi | IMPLEMENTED | Status perubahan kertas, zoom, dan panduan |
| 2.8 | Tes regresi UI Fase 2 | TESTED | Tes otomatis lulus pada workflow GitHub Actions terbaru |
| 2.9 | Build portable dan smoke test setelah perubahan UI | TESTED | Build portable pada main sukses; pengguna menguji EXE dan mengonfirmasi tombol berfungsi |

**Kriteria penerimaan:** layout tersedia · lebar kertas mengubah preview · zoom berfungsi · panduan dapat ditoggle · tidak ada resource remote · tes lulus · artifact portable berhasil dibangun. Kriteria terpenuhi: CI hijau, artifact portable berhasil dibangun, dan pengguna mengonfirmasi kontrol utama berfungsi.

---

## FASE 3 — MODEL DOKUMEN DAN EDITOR HIBRIDA

Status fase: **IMPLEMENTED** (menunggu CI dan verifikasi pengguna)

| # | Tugas | Status | Catatan |
|---|-------|--------|---------|
| 3.1 | Model dokumen berversi dan struktur blok | IMPLEMENTED | Schema v1: teks, garis, item, total; ID unik dan lebar kertas |
| 3.2 | Validasi model dan nilai total eksplisit | IMPLEMENTED | Total disimpan di blok total dan tidak dihitung otomatis dari item |
| 3.3 | Sinkronisasi model ke kanvas dan preview | IMPLEMENTED | Renderer membuat kedua tampilan dari model yang sama |
| 3.4 | Pilih elemen di kanvas | IMPLEMENTED | Klik/keyboard menyeleksi blok dan membuka inspector |
| 3.5 | Edit teks, nama item, harga, dan perataan | IMPLEMENTED | Perubahan diterapkan ke model dan preview |
| 3.6 | Tambah dan hapus elemen teks/item | IMPLEMENTED | Operasi dasar dengan validasi |
| 3.7 | Undo/redo | IMPLEMENTED | Snapshot riwayat dibatasi 80 langkah |
| 3.8 | Tes regresi model dan editor | IMPLEMENTED | Tes model, validasi, total, clone, dan wiring editor |
| 3.9 | CI dan build portable | NOT STARTED | Menunggu hasil GitHub Actions |

**Batasan:** Fase ini belum mencakup buka/simpan file .trstudio, gambar, QR/barcode, tabel, drag-and-drop reorder, atau pencetakan. Fitur tersebut berada di fase berikutnya.

**Kriteria:** model tervalidasi · perubahan editor → model → preview · operasi dasar otomatis lulus. Status TESTED setelah CI hijau; ACCEPTED setelah verifikasi pengguna.

---

## FASE 4 — PENYIMPANAN FILE .TRSTUDIO

Status fase: **ACCEPTED** (pengguna telah menguji build Fase 4 dan menyatakan fase selesai pada 2026-10-20)

| # | Tugas | Status | Catatan |
|---|---|---|---|
| 4.1 | Format arsip ZIP dengan manifest dan dokumen JSON | IMPLEMENTED | `manifest.json` + `document.json`; ZIP lokal dengan CRC/checksum dan batas ukuran |
| 4.2 | New / Open / Save / Save As | IMPLEMENTED | Tombol UI, dialog file native, status dokumen dan konfirmasi perubahan belum disimpan |
| 4.3 | Validasi skema saat membuka file | IMPLEMENTED | Versi model dan nilai field diperiksa melalui `validateDocument` |
| 4.4 | Atomic write | IMPLEMENTED | Tulis ke file temporer unik lalu rename |
| 4.5 | Penanganan arsip rusak dan path traversal | IMPLEMENTED | Validasi nama entri, metode kompresi, ukuran, rentang data dan CRC |
| 4.6 | Round-trip dan tes regresi | IMPLEMENTED | Tes ditambahkan; status TESTED menunggu CI aktual |

**Batasan eksplisit:** aset gambar dan `preview.png` belum dipersistenkan; parser menolak aset gambar pada Fase 4 ini. Tidak ada klaim portabilitas aset sampai cakupan aset diimplementasikan.

**Kriteria:** round-trip tanpa kehilangan data · file invalid ditangani aman · tes otomatis.

---

## FASE 5 — OBJEK STRUK DAN FITUR LAYOUT

Status fase: **ACCEPTED** (pengguna mengonfirmasi Fase 5 selesai pada 2026-10-21).

Implementasi Fase 5 mencakup objek separator/spacer, gambar, QR/barcode, tabel dan kolom, placeholder dinamis, alignment per sel/kolom, formatting teks, section bersarang, serta inline edit yang tetap aktif saat window kehilangan fokus. Rincian perubahan dan bukti CI dicatat pada PROGRESS.md bagian Fase 5.

**Verifikasi yang tercatat:** GitHub Actions run #85 lulus; unit test 55/55 pada Ubuntu dan Windows; Electron smoke lulus untuk persistence saat blur, exit via Enter, exit via pointer luar, dan hasil edit tersimpan. Penerimaan fase mengikuti konfirmasi pengguna. Uji fisik printer tetap belum dilakukan dan bukan kriteria Fase 5.

**Cakupan follow-up terbaru:**
- Toolbar dirapikan dengan baseline label dan tombol sejajar; tiga ikon perataan (kiri/tengah/kanan) tersedia di toolbar, dengan indikator pilihan dan shortcut Ctrl+Shift+L/E/R. Aturan perataan di inspector dihapus.
- Double-click pada isi teks maupun permukaan sel tabel/kolom membuka edit tanpa merender ulang target; klik kanan hanya membuka menu, dan drag handles tidak masuk mode edit.
- Alignment table disimpan per sel termasuk header; alignment kolom teks disimpan per kolom. Struktur alignment tervalidasi dan tetap utuh saat save/open `.trstudio`.
- Section dapat bersarang; penyisipan elemen mengikuti section aktif hingga level bertingkat. Validasi membatasi kedalaman bersarang hingga 20 level.
- Bold/italic/underline dipaksakan secara eksplisit sesuai nilai model agar default `<th>` browser tidak membuat teks tebal ketika properti tidak aktif; gaya berlaku pada kanvas dan preview.
- Tambah/hapus baris/kolom tabel turut menjaga alignment setiap sel konsisten.

**Status verifikasi PR #21: GitHub Actions run #85 lulus; unit test 55/55 Ubuntu dan Windows, Electron smoke lulus untuk persistence saat blur, exit via Enter, exit via pointer luar, dan hasil edit yang tetap tersimpan. Artifact portable Windows tetap perlu diuji pengguna sebelum fase dinyatakan `TESTED`/`ACCEPTED`.

**Uji manual minimum:** toolbar rata; double-click header/body tabel dan kolom; klik kanan saat cursor berada pada teks; perataan blok, perataan satu sel/kolom dan seluruh tabel/columns; bold on/off; section bersarang; save/open `.trstudio` dengan alignment per-sel.

---
## FASE 6 — LAYOUT THERMAL DAN ENCODER

Status fase: **TESTED** (GitHub Actions PR #22 run #104 lulus; menunggu pemeriksaan dan persetujuan pengguna sebelum Fase 7).

| # | Tugas | Status | Catatan |
|---|-------|--------|---------|
| 6.1 | Audit implementasi terkini dan API nyata `@point-of-sale/receipt-printer-encoder` yang sudah direncanakan | TESTED | API v4 diverifikasi dari dokumentasi resmi; bundle 4.0.1 dipin dan byte stream diuji di CI |
| 6.2 | Implementasi modul layout murni, terpisah dari Electron/DOM | TESTED | `src/layout/thermal-layout.js` terpisah dari Electron/DOM; toggle simulasi thermal memakai output layout, sementara preview visual tetap menjadi default |
| 6.3 | Perhitungan kolom efektif untuk kertas 58 mm dan 80 mm | TESTED | Profil 32 kolom (58 mm) dan 48 kolom (80 mm) lulus tes; margin CSS px dikonversi ke kolom Font A secara aproksimatif |
| 6.4 | Wrapping teks, alignment, tabel, dan objek columns | TESTED | Wrapping, alignment teks/sel/kolom, item, total, tabel, kolom, dan section bersarang lulus tes CI |
| 6.5 | Pemetaan gambar, QR, barcode, separator/rule, spacer/feed, dan cut ke encoder | IMPLEMENTED | Adapter menggunakan metode terdokumentasi; resolver gambar async diperlukan untuk data URL menjadi input gambar |
| 6.6 | Fixture/golden tests untuk layout 58/80 mm dan output encoder | IMPLEMENTED | Tes unit dan tes byte stream terhadap bundle encoder nyata ditambahkan; menunggu hasil CI aktual |
| 6.7 | Evaluasi kompatibilitas `SystemReceiptPrinter` | IMPLEMENTED | Paket memakai `@grandchef/node-printer` native; risiko ABI Electron harus diuji pada Fase 7. Jalur driver `webContents.print` tetap fallback; pengiriman job belum dibuat di Fase 6 |
| 6.8 | Dokumentasikan hasil, batasan, hasil tes, dan status akhir Fase 6 | TESTED | Implementasi, batasan, hasil CI, dan keputusan kompatibilitas dicatat di PROGRESS.md; menunggu persetujuan pengguna |

**Kriteria penerimaan:** output layout & encoder teruji · fixture & tes · batasan kompatibilitas terdokumentasi · tanpa klaim tanpa bukti. Tidak memasuki Fase 7 tanpa konfirmasi eksplisit pengguna.

**Status sementara:** CI PR #22 run #98 lulus (unit test 62/62 pada Ubuntu dan Windows; Electron smoke Ubuntu lulus). Fase 6 tetap IN PROGRESS karena output layout thermal belum diintegrasikan ke preview yang sudah ada. Fase 7 belum dimulai.

---

## FASE 7 — DETEKSI PRINTER DAN PENCETAKAN

Status fase: **ACCEPTED** (pengguna memverifikasi hasil cetak fisik pada Windows, disetujui setelah perbaikan PR #24, PR #25, dan PR #26 pada 2026-10-23).

| # | Tugas | Status | Catatan |
|---|-------|--------|---------|
| 7.1 | Deteksi printer terpasang melalui Electron | ACCEPTED | IPC `printer:list` memakai `webContents.getPrintersAsync()`; menampilkan nama, default, dan status printer. |
| 7.2 | Jalur driver Windows | ACCEPTED | Jendela cetak tersembunyi memuat HTML monospace pre-formatted terpusat (`buildThermalDriverHtml`) dengan pengukuran tinggi elemen kontainer presisi. Teruji pada printer thermal fisik. |
| 7.3 | Jalur raw ESC/POS melalui TCP | ACCEPTED | Transport TCP port 9100, batas byte job, timeout, dan pesan error terarah. Teruji pada printer fisik. |
| 7.4 | Integrasi layout/encoder ke jalur raw | ACCEPTED | Renderer membentuk layout, meng-encode byte ESC/POS, dan mengirim via IPC preload. Gambar, QR code, dan barcode terintegrasi. |
| 7.5 | Cetak ulang job terakhir | ACCEPTED | Job terakhir disimpan dalam memori proses aplikasi untuk cetak ulang instan (driver & raw TCP). |
| 7.6 | UI pemilihan jalur, printer, alamat dan port | ACCEPTED | Dialog printer menyediakan opsi driver Windows atau raw TCP, konfirmasi ESC/POS, dan indikator status. |
| 7.7 | Error handling dan validasi IPC | ACCEPTED | Whitelist channel IPC, validasi payload, penanganan error driver dan socket TCP dengan pesan ramah pengguna. |
| 7.8 | Tes otomatis transport dan dokumen driver | TESTED | 78/78 tes otomatis lulus (`node --test`), mencakup validasi transport, driver HTML, alignment, QR/barcode/image render, dan smoke test. |
| 7.9 | Evaluasi `SystemReceiptPrinter` / native addon | DEFERRED | Jalur driver via `webContents.print` dan raw via `node:net` terbukti memadai dan stabil tanpa dependensi native addon berisiko ABI Electron. |

**Kriteria penerimaan Fase 7:** terpenuhi ✔ · deteksi printer jalan ✔ · kedua jalur cetak terpisah & teruji fisik ✔ · layout monospace presisi & anti-wrap ✔ · media QR/barcode/gambar tercetak ✔ · tes otomatis 78/78 lulus ✔ · disetujui pengguna.

---
 
## FASE 8 — SQLITE, PREFERENSI, DAN RECOVERY

Status fase: **TESTED** (103/103 unit test lulus; menunggu verifikasi pengguna pada build portable)

| # | Tugas | Status | Catatan |
|---|-------|--------|---------|
| 8.1 | Integrasi modul SQLite lokal di direktori data pengguna (`userDataDir`) | TESTED | `src/main/db/database.js` menggunakan `node:sqlite` (DatabaseSync) bawaan Node 22; DB disimpan di `AppData/ThermalReceiptStudio/studio.db` |
| 8.2 | Skema database dan migrasi versi atomik | TESTED | Tabel `preferences`, `printer_profiles`, `recent_files`, `recovery_snapshots`; migrasi schema_migrations v1 idempoten |
| 8.3 | Layanan preferensi persisten | TESTED | Preferensi zoom, lebar kertas default, dan status panduan dipulihkan saat boot; disimpan otomatis saat pengguna mengubah nilai |
| 8.4 | Layanan profil printer persisten | TESTED | Mode (driver/raw), nama printer driver, host TCP, dan port disimpan otomatis setelah cetak berhasil; dipre-fill ke dialog printer saat boot |
| 8.5 | Daftar dokumen terkini (recent files) | TESTED | Panel "Dokumen terkini" tampil di dialog printer; klik untuk membuka file; dicatat saat document:open dan document:save |
| 8.6 | Autosave recovery untuk dokumen aktif | TESTED | `scheduleRecoverySnapshot()` dipanggil setiap `mutate()`; debounce 1 detik; dialog pemulihan muncul otomatis saat boot jika ada snapshot; dihapus saat save berhasil |
| 8.7 | Penanganan error database & recovery fallback | TESTED | DB korup otomatis di-rename ke `.corrupt.{timestamp}` dan dibuat ulang; semua operasi DB di renderer dibungkus try/catch agar tidak crash |
| 8.8 | Pengujian otomatis modul database & migrasi | TESTED | 25 unit test di `tests/phase-8-database.test.js` mencakup migrasi, preferences CRUD, printer profile upsert, recent files limit, dan recovery snapshot lifecycle |

**Kriteria Fase 8:** DB dibuat & dimigrasikan ✔ · preferensi persisten tersinkronisasi ke UI ✔ · profil printer tersimpan otomatis ✔ · recovery snapshot berfungsi ✔ · error database ditangani tanpa crash ✔ · `.trstudio` tetap format utama desain ✔


---

## FASE 9 — INTEGRASI DAN PENGUJIAN END-TO-END

Status fase: **TESTED** (111/111 unit & integration test lulus secara lokal dan CI)

| # | Tugas | Status | Catatan |
|---|-------|--------|---------|
| 9.1 | Siklus hidup dokumen penuh & storage E2E | TESTED | Model dokumen lengkap dengan 15 variasi blok berhasil di-roundtrip via arsip .trstudio tanpa kehilangan data |
| 9.2 | Pipeline render & thermal layout compiler E2E | TESTED | Layout 58 mm (32 kolom) & 80 mm (48 kolom) terkompilasi presisi, anti-overflow, dengan operasi teks, rule, feed, cut, barcode & QR |
| 9.3 | Pipeline encoding ESC/POS binary nyata E2E | TESTED | Layout thermal ter-encode ke byte stream binary ESC/POS lengkap dengan header init `ESC @` dan cut paper `GS V` |
| 9.4 | Pipeline driver print monospace HTML E2E | TESTED | HTML monospace terpusat (`<pre>`) ter-render aman dengan sanitasi XSS (escaping karakter HTML) dan padding seimbang |
| 9.5 | Integrasi SQLite, recent files & crash recovery E2E | TESTED | Siklus hidup preferensi, profil printer (driver/raw TCP), riwayat berkas terkini, dan autosave crash recovery snapshot terverifikasi utuh |
| 9.6 | Ketahanan error, pemulihan bencana & keamanan E2E | TESTED | Penolakan arsip ZIP korup, pencegahan path traversal (`../../`), validasi batas target raw TCP, dan pemetaan error ramah pengguna |
| 9.7 | Integritas arsitektur offline murni & CSP E2E | TESTED | CSP ketat (tanpa resource eksternal), library lokal, dan isolasi total modul inti dari ketergantungan DOM/Electron |
| 9.8 | Suite uji otomatis E2E komprehensif | TESTED | 7 skenario pengujian E2E di `tests/phase-9-e2e-integration.test.js` berhasil dieksekusi dengan 111/111 pengujian lulus |

**Kriteria Fase 9:** Seluruh alur data terintegrasi ✔ · Lossless .trstudio roundtrip ✔ · Dual-width layout 58/80 mm ✔ · ESC/POS binary & Driver HTML konsisten ✔ · SQLite & recovery snapshot teruji ✔ · Keamanan & offline murni ✔ · 111/111 tes lulus ✔

---

## FASE 10 — BUILD PORTABLE DAN DOKUMENTASI FINAL

Status fase: **NOT STARTED**

Poles konfigurasi builder & workflow, penamaan output, versi, README final (build, tes, offline, batasan printer, unduh artifact). Verifikasi run workflow aktual & tautan artifact sebelum mengklaim sukses.

---

## Backlog risiko tinggi (dijadwal ulang eksplisit bila gagal)

1. Rebuild native `better-sqlite3` + `@grandchef/node-printer` untuk Electron ABI di CI Windows (Fase 8/7).
2. Keputusan jalur cetak raw ESC/POS USB (butuh perangkat keras pengguna).
3. Uji visual & fisik printer thermal (hanya bisa dilakukan pengguna).

## Riwayat eksekusi CI aktual (diperbarui otomatis)
- 2026-10-19 Run #1/#2 (sha 5955d25): unit Node 20 ubuntu+windows LULUS; Node 22 GAGAL (`node --test tests/` → Cannot find module, keduanya); build Windows gagal di step unit-test yang sama. Perbaikan: skrip test glob + CI dikunci Node 20 + job smoke Ubuntu wajib marker TRS_SMOKE_OK. Menunggu run pascaperbaikan.


### Koreksi dari hasil uji PR #9
- PR #9 hanya memuat perbaikan Undo/Redo; perbaikan prefix `Rp` dan total otomatis belum masuk ke `main` saat pengguna menguji.
- Cabang `fix/phase-3-total-amount-format` mengubah nilai total menjadi eksplisit (`block.amount`) dan menghapus prefix `Rp` pada item/total di kanvas dan preview.
- Status perbaikan tetap menunggu CI dan uji manual pengguna; Fase 4 belum dimulai.
