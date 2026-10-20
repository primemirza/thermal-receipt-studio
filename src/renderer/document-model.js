export const DOCUMENT_SCHEMA_VERSION = 1;
const BLOCK_TYPES = ['text', 'rule', 'spacer', 'item', 'total', 'table', 'columns', 'image', 'qrcode', 'barcode', 'section'];
const ALIGNMENTS = ['left', 'center', 'right'];

export function createSampleDocument() {
  return {
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    title: 'Struk baru',
    paperWidthMm: 58,
    currency: 'IDR',
    layout: { margins: { top: 0, right: 0, bottom: 0, left: 0 } },
    blocks: [
      { id: 'b-store', type: 'text', text: 'WARUNG CONTOH', align: 'center', bold: true, size: 'normal' },
      { id: 'b-rule-1', type: 'rule', style: 'solid', character: '-' },
      { id: 'b-item-1', type: 'item', name: 'Teh hangat', price: 5000 },
      { id: 'b-item-2', type: 'item', name: 'Nasi goreng', price: 15000 },
      { id: 'b-rule-2', type: 'rule', style: 'solid', character: '-' },
      { id: 'b-total', type: 'total', label: 'Total', amount: 20000, bold: true },
      { id: 'b-footer', type: 'text', text: 'Terima kasih!', align: 'center', bold: false, size: 'normal' }
    ]
  };
}

function assertString(value, label, max = 200) {
  if (typeof value !== 'string' || value.length > max) throw new TypeError(label + ' tidak valid.');
}
function assertBox(box, label, max = 50) {
  if (!box || typeof box !== 'object' || Array.isArray(box)) throw new TypeError(label + ' tidak valid.');
  for (const side of ['top', 'right', 'bottom', 'left']) {
    const value = box[side];
    if (!Number.isFinite(value) || value < 0 || value > max) throw new TypeError(label + ' harus 0–' + max + ' px pada semua sisi.');
  }
}
function assertWidths(widths, count, label) {
  if (!Array.isArray(widths) || widths.length !== count ||
      widths.some(width => !Number.isFinite(width) || width < 10 || width > 90) ||
      Math.abs(widths.reduce((sum, width) => sum + width, 0) - 100) > 1) {
    throw new TypeError(label + ' harus berjumlah 100% dan tiap kolom minimal 10%.');
  }
}
export function validateDocument(doc) {
  if (!doc || typeof doc !== 'object' || doc.schemaVersion !== DOCUMENT_SCHEMA_VERSION) {
    throw new TypeError('Versi dokumen tidak didukung.');
  }
  if (![58, 80].includes(doc.paperWidthMm)) throw new TypeError('Lebar kertas harus 58 atau 80 mm.');
  if (doc.layout !== undefined) {
    if (!doc.layout || typeof doc.layout !== 'object') throw new TypeError('Layout dokumen tidak valid.');
    if (doc.layout.margins !== undefined) assertBox(doc.layout.margins, 'Margin global', 60);
  }
  const ids = new Set();
  let totalBlocks = 0;
  function validateBlocks(blocks) {
    if (!Array.isArray(blocks)) throw new TypeError('Daftar elemen tidak valid.');
    for (const block of blocks) {
      totalBlocks += 1;
      if (totalBlocks > 500) throw new TypeError('Dokumen maksimal 500 elemen.');
      if (!block || typeof block.id !== 'string' || !block.id || ids.has(block.id)) throw new TypeError('ID elemen tidak valid atau duplikat.');
      ids.add(block.id);
      if (!BLOCK_TYPES.includes(block.type) && block.type !== 'dynamic') throw new TypeError('Jenis elemen tidak didukung.');
      if (block.align !== undefined && !ALIGNMENTS.includes(block.align)) throw new TypeError('Perataan elemen tidak valid.');
      if (block.type === 'section') {
        assertString(block.name || 'Section', 'Nama section');
        if (block.margin !== undefined) assertBox(block.margin, 'Margin section', 60);
        if (block.padding !== undefined) assertBox(block.padding, 'Padding section', 60);
        validateBlocks(block.children);
        continue;
      }
      if (block.type === 'text') assertString(block.text, 'Teks elemen');
      if (block.type === 'dynamic') {
        if (block.field !== undefined && !['date', 'time', 'datetime', 'receiptNumber'].includes(block.field)) throw new TypeError('Placeholder lama tidak valid.');
        if (block.text !== undefined) assertString(block.text, 'Teks placeholder lama');
      }
      if (block.size !== undefined && !['small', 'normal', 'large', 'double'].includes(block.size)) throw new TypeError('Ukuran teks tidak valid.');
      for (const key of ['bold', 'italic', 'underline']) if (block[key] !== undefined && typeof block[key] !== 'boolean') throw new TypeError('Opsi format teks tidak valid.');
      if (block.type === 'rule') {
        if (block.style !== undefined && !['solid', 'dashed', 'double'].includes(block.style)) throw new TypeError('Gaya separator tidak valid.');
        if (block.character !== undefined) assertString(block.character, 'Karakter separator', 1);
      }
      if (block.type === 'spacer' && (!Number.isInteger(block.height) || block.height < 1 || block.height > 20)) throw new TypeError('Tinggi spacer harus 1–20 baris.');
      if (block.type === 'item' && (typeof block.name !== 'string' || block.name.length > 200 || !Number.isFinite(block.price) || block.price < 0)) throw new TypeError('Data item tidak valid.');
      if (block.type === 'total' && (typeof block.label !== 'string' || !Number.isFinite(block.amount) || block.amount < 0)) throw new TypeError('Data total tidak valid.');
      if (block.type === 'table') {
        if (!Array.isArray(block.headers) || block.headers.length < 1 || block.headers.length > 6 ||
            block.headers.some(cell => typeof cell !== 'string' || cell.length > 200) ||
            !Array.isArray(block.rows) || block.rows.length > 100) throw new TypeError('Struktur tabel tidak valid.');
        for (const row of block.rows) if (!Array.isArray(row) || row.length !== block.headers.length || row.some(cell => typeof cell !== 'string' || cell.length > 200)) throw new TypeError('Sel tabel tidak valid.');
        if (block.border !== undefined && !['all', 'horizontal', 'none', 'vertical'].includes(block.border)) throw new TypeError('Border tabel tidak valid.');
        if (block.columnWidths !== undefined) assertWidths(block.columnWidths, block.headers.length, 'Lebar kolom tabel');
        if (block.size !== undefined && !['small', 'normal', 'large', 'double'].includes(block.size)) throw new TypeError('Ukuran teks tabel tidak valid.');
        if (block.width !== undefined && (!Number.isFinite(block.width) || block.width < 20 || block.width > 100)) throw new TypeError('Lebar tabel harus 20–100%.');
        if (block.padding !== undefined && (!Number.isFinite(block.padding) || block.padding < 0 || block.padding > 20)) throw new TypeError('Padding sel tabel harus 0–20 px.');
      }
      if (block.type === 'columns') {
        if (!Array.isArray(block.columns) || block.columns.length < 2 || block.columns.length > 4 || block.columns.some(value => typeof value !== 'string' || value.length > 200)) throw new TypeError('Kolom tidak valid.');
        if (block.columnWidths !== undefined) assertWidths(block.columnWidths, block.columns.length, 'Lebar kolom teks');
        if (block.padding !== undefined && (!Number.isFinite(block.padding) || block.padding < 0 || block.padding > 30)) throw new TypeError('Padding kolom harus 0–30 px.');
        if (block.gap !== undefined && (!Number.isFinite(block.gap) || block.gap < 0 || block.gap > 30)) throw new TypeError('Jarak antar kolom harus 0–30 px.');
        if (block.border !== undefined && !['all', 'vertical', 'none'].includes(block.border)) throw new TypeError('Border kolom tidak valid.');
        if (block.width !== undefined && (!Number.isFinite(block.width) || block.width < 20 || block.width > 100)) throw new TypeError('Lebar objek kolom harus 20–100%.');
      }
      if (block.type === 'image') {
        assertString(block.dataUrl, 'Data gambar', 8_000_000);
        if (!/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(block.dataUrl)) throw new TypeError('Format gambar harus data URL base64 PNG/JPEG/WebP/GIF.');
        if (!Number.isInteger(block.width) || block.width < 1 || block.width > 512) throw new TypeError('Lebar gambar harus 1–512 px.');
        if (block.alt !== undefined) assertString(block.alt, 'Deskripsi gambar');
      }
      if (block.type === 'qrcode') {
        assertString(block.value, 'Isi QR', 2000); if (!block.value) throw new TypeError('Isi QR tidak boleh kosong.');
        if (block.width !== undefined && (!Number.isInteger(block.width) || block.width < 32 || block.width > 512)) throw new TypeError('Lebar QR harus 32–512 px.');
      }
      if (block.type === 'barcode') {
        assertString(block.value, 'Isi barcode', 128); if (!/^[\x20-\x7E]+$/.test(block.value)) throw new TypeError('Isi barcode harus berisi karakter ASCII yang dapat dicetak.');
        if (block.width !== undefined && (!Number.isInteger(block.width) || block.width < 64 || block.width > 512)) throw new TypeError('Lebar barcode harus 64–512 px.');
      }
    }
  }
  validateBlocks(doc.blocks);
  return true;
}
export function cloneDocument(doc) { return structuredClone(doc); }

export function migrateLegacyDocument(doc) {
  const migrated = cloneDocument(doc);
  if (!migrated.layout) migrated.layout = { margins: { top: 0, right: 0, bottom: 0, left: 0 } };
  else if (!migrated.layout.margins) migrated.layout.margins = { top: 0, right: 0, bottom: 0, left: 0 };
  const manualLabels = { date: 'Tanggal: ', time: 'Waktu: ', datetime: 'Tanggal/waktu: ', receiptNumber: 'No. struk: ' };
  function migrateBlocks(blocks) {
    for (const block of blocks) {
      if (block.type === 'dynamic') {
        block.text = typeof block.text === 'string' ? block.text : (manualLabels[block.field] || '');
        block.type = 'text';
        delete block.field;
        if (block.size === undefined) block.size = 'normal';
      } else if (block.type === 'section' && Array.isArray(block.children)) {
        migrateBlocks(block.children);
      }
    }
  }
  migrateBlocks(migrated.blocks);
  return migrated;
}
