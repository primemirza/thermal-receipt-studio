/**
 * FASE 9 — INTEGRASI DAN PENGUJIAN END-TO-END (E2E)
 * 
 * Pengujian komprehensif siklus penuh (end-to-end):
 * 1. Siklus hidup dokumen & serialisasi .trstudio (lossless roundtrip)
 * 2. Pipeline render & thermal layout compiler (58mm dan 80mm)
 * 3. Pipeline encoding ESC/POS binary nyata
 * 4. Pipeline driver print monospace HTML
 * 5. Persistensi preferensi, profil printer, recent files & recovery
 * 6. Ketahanan error, pemulihan bencana & keamanan arsip/database
 * 7. Integritas arsitektur offline & CSP
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createSampleDocument,
  validateDocument,
  cloneDocument
} from '../src/renderer/document-model.js';
import {
  createThermalProfile,
  createThermalLayout,
  wrapText
} from '../src/layout/thermal-layout.js';
import { encodeThermalLayout } from '../src/encoder/receipt-printer-encoder.js';
import {
  createZip,
  readZip,
  serializeTrstudio,
  parseTrstudio
} from '../src/main/trstudio-archive.js';
import {
  buildDriverPrintHtml,
  buildThermalDriverHtml
} from '../src/printer/driver-print.js';
import {
  validateRawPrinterTarget,
  normalizeRawJob,
  printerErrorMessage
} from '../src/printer/printer-transport.js';
import { openDatabase } from '../src/main/db/database.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

// Mock image resolver untuk pengujian encoding grafik ESC/POS
function mockImageResolver(dataUrl) {
  return Promise.resolve({
    width: 16,
    height: 16,
    data: new Uint8Array(16 * 16 * 4).fill(255)
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. SIKLUS HIDUP DOKUMEN & STORAGE E2E
// ─────────────────────────────────────────────────────────────────────────────

test('E2E: model dokumen lengkap dengan seluruh variasi blok bertahan dalam roundtrip .trstudio tanpa kehilangan data', () => {
  const doc = {
    schemaVersion: 1,
    title: 'Struk Lengkap E2E',
    paperWidthMm: 58,
    layout: {
      margins: { top: 2, right: 4, bottom: 2, left: 4 }
    },
    blocks: [
      { id: 'b-header', type: 'text', text: 'KAFE NUSANTARA', size: 'large', bold: true, align: 'center' },
      { id: 'b-sub', type: 'text', text: 'Jl. Merdeka No. 45, Jakarta', size: 'small', align: 'center' },
      { id: 'b-rule-1', type: 'rule', style: 'double', character: '=' },
      { id: 'b-item-1', type: 'item', name: 'Kopi Tubruk Panas', price: 15000, bold: false },
      { id: 'b-item-2', type: 'item', name: 'Pisang Goreng Keju', price: 20000, bold: false },
      { id: 'b-rule-2', type: 'rule', style: 'dashed', character: '-' },
      { id: 'b-total', type: 'total', label: 'TOTAL TAGIHAN', amount: 35000, bold: true, size: 'normal' },
      { id: 'b-spacer-1', type: 'spacer', height: 1 },
      {
        id: 'b-table-1',
        type: 'table',
        headers: ['Item', 'Qty', 'Subtotal'],
        rows: [
          ['Kopi', '1', '15000']
        ],
        columnWidths: [40, 30, 30],
        border: 'all',
        cellAlignments: [
          ['left', 'center', 'right'],
          ['left', 'center', 'right']
        ]
      },
      {
        id: 'b-cols-1',
        type: 'columns',
        columns: ['Kasir: Budi', 'Shift: 1'],
        columnWidths: [50, 50],
        columnAlignments: ['left', 'right']
      },
      {
        id: 'b-sec-1',
        type: 'section',
        box: { border: true, padding: 2 },
        children: [
          { id: 'b-sec-txt', type: 'text', text: 'Promo Member: Diskon 10% berikutnya', align: 'center' }
        ]
      },
      { id: 'b-qr', type: 'qrcode', value: 'https://kafenusantara.id/struk/12345', size: 'normal', align: 'center' },
      { id: 'b-barcode', type: 'barcode', value: 'TRX987654321', size: 'normal', align: 'center' },
      { id: 'b-img', type: 'image', dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', width: 64, align: 'center' },
      { id: 'b-footer', type: 'text', text: 'Terima kasih atas kunjungan Anda!', align: 'center', size: 'small' }
    ]
  };

  // Validasi dokumen sebelum disimpan
  assert.equal(validateDocument(doc), true);
  assert.equal(doc.paperWidthMm, 58);
  assert.equal(doc.blocks.length, 15);

  // Serialisasi ke arsip .trstudio (ZIP binary)
  const timestamp = new Date('2026-10-24T12:00:00.000Z');
  const zipBytes = serializeTrstudio(doc, timestamp);
  assert.ok(zipBytes instanceof Uint8Array);
  assert.ok(zipBytes.length > 200, 'Arsip ZIP memiliki ukuran yang valid');

  // Baca dan verifikasi entri ZIP
  const zipEntries = readZip(zipBytes);
  assert.ok(zipEntries['manifest.json'], 'Terdapat manifest.json');
  assert.ok(zipEntries['document.json'], 'Terdapat document.json');

  // Parse kembali arsip .trstudio
  const restored = parseTrstudio(zipBytes, validateDocument);
  assert.equal(restored.manifest.app, 'thermal-receipt-studio');
  assert.equal(restored.manifest.formatVersion, 1);
  assert.deepEqual(restored.document, doc, 'Dokumen hasil restorasi identik dengan aslinya (lossless)');
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. PIPELINE RENDER & THERMAL LAYOUT E2E (58mm dan 80mm)
// ─────────────────────────────────────────────────────────────────────────────

test('E2E: thermal layout compiler menghasilkan operasi presisi untuk kertas 58 mm dan 80 mm', () => {
  const doc = createSampleDocument();
  doc.blocks.push(
    { id: 'table-test', type: 'table', headers: ['Barang', 'Harga'], rows: [['Kopi', '10.000']], columnWidths: [60, 40] },
    { id: 'qr-test', type: 'qrcode', value: 'INV-001', align: 'center' },
    { id: 'bc-test', type: 'barcode', value: 'BC123456', align: 'center' }
  );

  // 58 mm (32 kolom)
  const layout58 = createThermalLayout({ ...doc, paperWidthMm: 58 }, { feedBeforeCut: 3, cut: true });
  assert.equal(layout58.profile.columns, 32);
  assert.ok(layout58.operations.length > 0);
  
  // Pastikan ada operasi cut dan feed
  const cutOp58 = layout58.operations.find(op => op.type === 'cut');
  assert.ok(cutOp58, 'Operasi pemotongan kertas (cut) ada di 58 mm');
  const feedOp58 = layout58.operations.find(op => op.type === 'feed');
  assert.ok(feedOp58, 'Operasi feed ada di 58 mm');

  // 80 mm (48 kolom)
  const layout80 = createThermalLayout({ ...doc, paperWidthMm: 80 }, { feedBeforeCut: 3, cut: true });
  assert.equal(layout80.profile.columns, 48);
  assert.ok(layout80.operations.length > 0);

  // Semua baris teks tidak melebihi kolom profil
  for (const op of layout58.operations) {
    if (op.type === 'text' && op.text) {
      assert.ok(op.text.length <= 32, `Teks "${op.text}" tidak melebihi 32 kolom`);
    }
  }
  for (const op of layout80.operations) {
    if (op.type === 'text' && op.text) {
      assert.ok(op.text.length <= 48, `Teks "${op.text}" tidak melebihi 48 kolom`);
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. PIPELINE ENCODING ESC/POS BINARY E2E
// ─────────────────────────────────────────────────────────────────────────────

test('E2E: layout thermal ter-encode ke byte stream binary ESC/POS lengkap', async () => {
  const doc = createSampleDocument();
  const layout = createThermalLayout(doc, { feedBeforeCut: 2, cut: true });

  class MockEncoderAdapter {
    constructor() { this.buffer = []; }
    initialize() { this.buffer.push(27, 64); return this; }
    bold(v) { this.buffer.push(27, 69, v ? 1 : 0); return this; }
    italic(v) { this.buffer.push(27, 52, v ? 1 : 0); return this; }
    underline(v) { this.buffer.push(27, 45, v ? 1 : 0); return this; }
    size(s) { this.buffer.push(29, 33, s === 'large' ? 17 : 0); return this; }
    align(a) { this.buffer.push(27, 97, a === 'center' ? 1 : a === 'right' ? 2 : 0); return this; }
    line(text) {
      for (let i = 0; i < text.length; i++) this.buffer.push(text.charCodeAt(i));
      this.buffer.push(10);
      return this;
    }
    newline() { this.buffer.push(10); return this; }
    qrcode(val) { this.buffer.push(29, 40, 107); return this; }
    barcode(val, type) { this.buffer.push(29, 107, 73); return this; }
    image(img) { this.buffer.push(29, 118, 48); return this; }
    cut() { this.buffer.push(29, 86, 65, 0); return this; }
    encode() { return new Uint8Array(this.buffer); }
  }

  const bytes = await encodeThermalLayout(layout, MockEncoderAdapter, { resolveImage: mockImageResolver });
  assert.ok(bytes instanceof Uint8Array);
  assert.ok(bytes.length > 20, 'Byte stream ESC/POS terbentuk');
  
  // Pastikan terdapat init code [27, 64]
  assert.equal(bytes[0], 27);
  assert.equal(bytes[1], 64);

  // Pastikan terdapat cut code [29, 86, 65, 0] di akhir
  const last4 = Array.from(bytes.slice(-4));
  assert.deepEqual(last4, [29, 86, 65, 0]);
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. PIPELINE DRIVER PRINT MONOSPACE HTML E2E
// ─────────────────────────────────────────────────────────────────────────────

test('E2E: generator driver HTML menghasilkan dokumen monospace yang aman dan presisi', () => {
  const doc = createSampleDocument();
  const layout = createThermalLayout(doc);
  const html58 = buildThermalDriverHtml(layout, 58);
  const html80 = buildThermalDriverHtml(layout, 80);

  // Verifikasi struktur dokumen driver
  assert.ok(html58.toLowerCase().includes('<!doctype html>'));
  assert.ok(html58.includes('id="receipt-container"'));
  assert.ok(html58.includes('width: 57mm'), 'body width 58mm dikurangi untuk kompatibilitas driver');
  assert.ok(html80.includes('width: 79mm'), 'body width 80mm dikurangi untuk kompatibilitas driver');

  // Verifikasi karakter HTML di-escape untuk mencegah XSS
  const maliciousLayout = {
    profile: { effectiveColumns: 32 },
    operations: [
      { type: 'text', text: '<script>alert("xss")</script>', align: 'left' },
      { type: 'text', text: 'Normal text & details', align: 'left' }
    ]
  };
  const safeHtml = buildThermalDriverHtml(maliciousLayout, 58);
  assert.ok(!safeHtml.includes('<script>alert'), 'Tag script tidak dirender mentah');
  assert.ok(safeHtml.includes('&lt;script&gt;alert("xss")&lt;/script&gt;'), 'Karakter script di-escape');
  assert.ok(safeHtml.includes('Normal text &amp; details'), 'Karakter & di-escape');
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. INTEGRASI PERSISTENSI DATABASE, RECENT FILES & RECOVERY E2E
// ─────────────────────────────────────────────────────────────────────────────

test('E2E: alur hidup SQLite lengkap (preferensi, profil printer, recent files, dan snapshot recovery)', () => {
  const db = openDatabase(':memory:');

  // 1. Preferensi aplikasi
  db.setPreference('zoom', 120);
  db.setPreference('paperWidth', 80);
  db.setPreference('guides', true);
  const allPrefs = db.getAllPreferences();
  assert.equal(allPrefs.zoom, 120);
  assert.equal(allPrefs.paperWidth, 80);
  assert.equal(allPrefs.guides, true);

  // 2. Profil printer driver & raw TCP
  db.savePrinterProfile({ id: 'default', mode: 'driver', driverName: 'POS-58 Series' });
  let profile = db.getPrinterProfile('default');
  assert.equal(profile.mode, 'driver');
  assert.equal(profile.driverName, 'POS-58 Series');

  db.savePrinterProfile({ id: 'default', mode: 'raw', rawHost: '192.168.1.150', rawPort: 9100 });
  profile = db.getPrinterProfile('default');
  assert.equal(profile.mode, 'raw');
  assert.equal(profile.rawHost, '192.168.1.150');
  assert.equal(profile.rawPort, 9100);

  // 3. Riwayat dokumen terkini (Recent Files)
  db.addRecentFile('D:\\struk-1.trstudio', 'Struk Kopi', 58);
  db.addRecentFile('D:\\struk-2.trstudio', 'Struk Resto', 80);
  let recents = db.getRecentFiles(5);
  assert.equal(recents.length, 2);
  const paths = recents.map(r => r.path);
  assert.ok(paths.includes('D:\\struk-1.trstudio'));
  assert.ok(paths.includes('D:\\struk-2.trstudio'));

  // 4. Autosave Crash Recovery Lifecycle
  const sampleDoc = createSampleDocument();
  sampleDoc.title = 'Dokumen Belum Disimpan';
  db.saveRecoverySnapshot(sampleDoc, 'D:\\struk-1.trstudio');

  const recovery = db.getRecoverySnapshot();
  assert.ok(recovery, 'Recovery snapshot berhasil disimpan');
  assert.equal(recovery.filePath, 'D:\\struk-1.trstudio');
  assert.equal(recovery.document.title, 'Dokumen Belum Disimpan');

  // Simulasikan penyimpanan dokumen sukses -> hapus snapshot
  db.clearRecoverySnapshot();
  assert.equal(db.getRecoverySnapshot(), null, 'Recovery snapshot bersih setelah save sukses');

  // Preferensi dan profil tetap utuh setelah recovery dibersihkan
  assert.equal(db.getPreference('zoom'), 120);
  assert.equal(db.getPrinterProfile('default').rawHost, '192.168.1.150');

  db.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. KETAHANAN ERROR, PEMULIHAN BENCANA & KEAMANAN E2E
// ─────────────────────────────────────────────────────────────────────────────

test('E2E: ketahanan terhadap arsip zip korup, path traversal, dan input jaringan tidak valid', () => {
  // Path traversal dilarang
  assert.throws(() => createZip({ '../../passwords.txt': 'hacked' }), /tidak aman/);
  assert.throws(() => createZip({ '/etc/passwd': 'hacked' }), /tidak aman/);

  // Arsip zip yang korup ditolak secara anggun
  assert.throws(() => readZip(Buffer.from([0, 1, 2, 3])), /Ukuran arsip tidak valid|Header lokal ZIP rusak/);

  // Target printer raw divalidasi ketat
  assert.throws(() => validateRawPrinterTarget(''), /Alamat printer/);
  assert.throws(() => validateRawPrinterTarget('bad host with spaces'), /Alamat printer/);
  assert.throws(() => validateRawPrinterTarget('192.168.1.1', 99999), /Port printer/);

  // Job raw dibatasi 1 byte s/d 8 MB
  assert.throws(() => normalizeRawJob([]), /Ukuran job/);
  assert.throws(() => normalizeRawJob([999]), /Byte cetak/);

  // Error socket TCP dipetakan ke pesan ramah bahasa Indonesia
  assert.match(printerErrorMessage({ code: 'ECONNREFUSED' }), /menolak koneksi/);
  assert.match(printerErrorMessage({ code: 'ETIMEDOUT' }), /habis/);
  assert.match(printerErrorMessage({ code: 'EHOSTUNREACH' }), /tidak dapat dijangkau/);
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. INTEGRITAS ARSITEKTUR OFFLINE & CSP E2E
// ─────────────────────────────────────────────────────────────────────────────

test('E2E: kepatuhan offline murni, CSP ketat, dan modul inti terisolasi dari DOM/Electron', () => {
  const indexHtml = read('src/renderer/index.html');
  const packageJson = JSON.parse(read('package.json'));

  // CSP ketat
  assert.match(indexHtml, /<meta http-equiv="Content-Security-Policy"/);
  assert.match(indexHtml, /default-src 'none'/);
  assert.match(indexHtml, /script-src 'self'/);
  assert.match(indexHtml, /style-src 'self'/);
  assert.ok(!indexHtml.includes('http://') && !indexHtml.includes('https://'), 'Tidak ada dependensi eksternal di index.html');

  // Vendor library lokal
  assert.ok(fs.existsSync(path.join(root, 'src/renderer/vendor/qrcode.js')));
  assert.ok(fs.existsSync(path.join(root, 'src/renderer/vendor/JsBarcode.all.min.js')));

  // Modul inti (layout, encoder, storage, document-model) bebas dari require('electron')
  const coreFiles = [
    'src/renderer/document-model.js',
    'src/layout/thermal-layout.js',
    'src/encoder/receipt-printer-encoder.js',
    'src/main/trstudio-archive.js',
    'src/printer/printer-transport.js'
  ];
  for (const file of coreFiles) {
    const code = read(file);
    assert.doesNotMatch(code, /require\(['"]electron['"]\)/, `${file} tidak boleh memuat Electron`);
    assert.doesNotMatch(code, /import\s+.*from\s+['"]electron['"]/, `${file} tidak boleh mengimpor Electron`);
  }
});
