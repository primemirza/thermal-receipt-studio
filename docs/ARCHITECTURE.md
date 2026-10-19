# ARCHITECTURE — Thermal Receipt Studio (Draf Fase 0)

Status: draf awal untuk persetujuan pengguna. Akan disempurnakan pada fase-fase berikutnya.

## 1. Ringkasan

Aplikasi desktop Windows **portable** (satu `.exe`, tanpa installer) untuk merancang, menyimpan, mempratinjau, dan mencetak struk thermal 58 mm / 80 mm. Berjalan sepenuhnya offline setelah build.

Stack tetap (sesuai master prompt): Electron · HTML · CSS · JavaScript ES modules · `better-sqlite3` · ZIP lokal · QR/barcode offline · `electron-builder` target `portable` · GitHub Actions (test + build Windows). Dilarang: React, Vite, CDN runtime, cloud backend wajib.

## 2. Komponen dan struktur direktori rencana

```
/ (repo root)
├─ package.json              # skrip: start, test, dist:win, start:test
├─ electron-builder.yml      # konfigurasi target portable win x64
├─ TASKLIST.md / PROGRESS.md / README.md
├─ docs/ARCHITECTURE.md      # file ini
├─ .github/workflows/
│  ├─ test.yml               # ubuntu: node --test (+ smoke Linux bila memungkinkan)
│  └─ build-windows.yml      # windows-latest: test + start:test + dist:win + artifact
├─ src/
│  ├─ main/                  # Main process: window, IPC handler (fs, dialog, print, db), menu
│  │  ├─ index.mjs           # bootstrap BrowserWindow dengan keamanan ketat
│  │  ├─ ipc/                # handler per-domain, semua argumen tervalidasi
│  │  └─ db/                 # better-sqlite3: migrasi, preferensi, recovery
│  ├─ preload/
│  │  └─ index.mjs           # contextBridge API sempit (trstudio.open/save, printer.*, prefs.*)
│  ├─ renderer/              # UI murni ES modules, tanpa akses Node
│  │  ├─ index.html / styles/ / modules/
│  ├─ document/              # MODEL DOKUMEN (murni JS, teruji unit, dipakai renderer & tools)
│  │  ├─ schema.mjs          # definisi node + validasi JSON
│  │  ├─ operations.mjs      # insert/edit/move/delete/undo-redo (transformasi model)
│  ├─ editor/                # JEMBATAN DOM↔MODEL (ProseMirror atau contentEditable — ADR-005)
│  ├─ layout/                # LAYOUT THERMAL MURNI: model → baris kolom (58/80mm, wrap, align, tabel)
│  ├─ encoder/               # PEMETAAN layout → ReceiptPrinterEncoder (API nyata saja)
│  ├─ printer/               # adapter jalur cetak (driver Windows / raw ESC/POS network) — Fase 7
│  ├─ storage/               # mesin .trstudio: zip pack/unpack, validasi, atomic write — Fase 4
│  └─ assets/                # ikon/aset bawaan aplikasi (dibundel)
└─ tests/                    # node --test: unit + integrasi (document, layout, storage, encoder-mapping, ipc-validation)
```

Prinsip: modul `document`, `layout`, `encoder`, `storage` **tidak boleh mengimpor Electron/DOM** agar dapat diuji dengan `node --test` di semua platform (termasuk workspace Linux saat ini).

## 3. Alur data

```
Editor (UI) ⇄ DocumentModel (JSON, single source of truth)
        │
        ├─→ Validator skema (setiap mutasi)
        ├─→ PreviewRenderer (DOM, lebar = kolom × profil)   ← engine tampilan berbasis grid monospace
        ├─→ LayoutEngine (model → PrintLayout: baris/kolom/feed/cut)
        │        └─→ EncoderAdapter (PrintLayout → bytes ESC/POS via ReceiptPrinterEncoder)
        └─→ StorageEngine (.trstudio ZIP ⇄ model + aset)
SQLite: hanya preferensi/profil/recovery/metadata — BUKAN sumber desain.
```

Satu model layout bersama dipakai preview dan cetak (Fase 6) — preview mensimulasikan grid karakter monospace seperti printer; hasil cetak adalah ground-truth yang diverifikasi pengguna secara manual.

## 4. Model dokumen (ringkas)

Node: `document { paperWidth: 58|80, columns?, children[] }`, `paragraph`, `text {marks: bold|italic|underline|invert|size|font}`, `image {assetId, width, mode}`, `qrCode {content, size, ecLevel}`, `barcode {value, symbology, options}`, `separator {style, char}`, `spacer {lines}`, `table {columns[], rows[]}` → `tableRow` → `tableCell {align, content[]}`, `columnLayout {weights[], children[]}`, `dynamicField {type: date|time|datetime|custom, format}`.

Setiap node punya `id` stabil (untuk seleksi/reorder/undo) dan divalidasi skema sebelum masuk state.

## 5. Keamanan (Electron)

- `contextIsolation: true`, `nodeIntegration: false`; preload hanya `contextBridge.exposeInMainWorld('trstudio', …)` dengan fungsi bertipe tetap.
- IPC: whitelist channel eksplisit; setiap payload divalidasi di main process (tipe, panjang, path harus dalam direktori yang dipilih user lewat dialog — tidak ada path bebas dari renderer).
- File dibuka diperlakukan sebagai input musuh: batas ukuran arsip (mis. 25 MB), tolak entri ZIP absolut/`..`/symlink, dekompresi terbatas, validasi JSON skema, gambar hanya dari daftar aset manifest.
- CSP `default-src 'self'`; tanpa remote module; `webSecurity` aktif; navigasi & window.open diblokir.
- Tidak ada data sensitif di log; log hanya ke userData.

## 6. Format `.trstudio`

```
manifest.json  { app:"thermal-receipt-studio", formatVersion:1, createdAt, modifiedAt,
                 document:"document.json", assets:[{id,path,mime,width,height}], preview:"preview.png"|null }
document.json  { schemaVersion:1, document:{...} }
assets/images/<id>.<ext>
preview.png    (opsional)
```
Aturan: nama entri relatif & ternormalisasi; id aset = hash konten; save atomik (`file.tmp` → rename); buka gagal → pesan spesifik + tawaran pemulihan dari recovery autosave.

## 7. Printer — dua jalur (Fase 7)

1. **Driver Windows**: `webContents.print()` (HTML→printer driver; paling aman & universal) dan/atau `@point-of-sale/system-receipt-printer` (raw passthrough melalui driver; butuh native rebuild; kualitas tergantung driver).
2. **Raw ESC/POS**: `network-receipt-printer` (TCP 9100, murni Node — prioritas) dan opsi USB/WebSerial bila feasible. Hanya untuk printer yang benar-benar mendukung ESC/POS; ditegaskan lewat profil printer + peringatan UI.

Keputusan akhir tiap jalur didokumentasikan dengan hasil tes; uji fisik dilakukan pengguna.

## 8. Strategi pengujian otomatis

- **Lapis 1 (semua platform, `npm test`)**: `node --test tests/**/*.test.mjs` — skema dokumen, operasi+undo/redo, layout 58/80 (fixture golden text), round-trip `.trstudio`, fuzzing arsip rusak/path traversal, pemetaan encoder (assert terhadap byte stream dari paket terpasang), validasi payload IPC, util DB (logika non-native diuji di Linux; tes penuh DB berjalan di job Windows).
- **Lapis 2 (CI Windows)**: `npm run start:test` — menjalankan Electron asli dengan flag smoke: buka jendela, verifikasi `document.title` & status render lewat IPC echo, exit 0; lalu `npm run dist:win` menghasilkan portable `.exe` x64 yang diunggah sebagai artifact.
- Klaim kelulusan selalu disertai run workflow aktual yang diperiksa; kegagalan dicatat di TASKLIST/PROGRESS.

## 9. Build portable

`electron-builder.yml`: `win.target: portable` (x64), `portable.artifactName` terstandar, `files` membatasi src+deps, `asar: true`, `npmRebuild` untuk native deps. Tidak ada NSIS/MSI. Rebuild reproducible dari clone bersih: `npm ci && npm test && npm run dist:win`.

## 10. Keputusan terbuka (butuh masukan/persetujuan pengguna)

| ID | Pertanyaan | Rekomendasi sementara |
|----|-----------|----------------------|
| O1 | ProseMirror vs contentEditable kustom untuk editor hibrida | ProseMirror (modular, MIT, tanpa React); fallback documented di Fase 3 |
| O2 | Jalur raw USB (WebUSB) disertakan? | Tunda; mulai dari driver + network raw |
| O3 | Versi Electron mayor | Pin pada 44.x saat Fase 1 |
| O4 | Menit CI Windows dapat diterima? | Perlu konfirmasi pengguna |
