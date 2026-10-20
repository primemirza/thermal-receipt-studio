export const DOCUMENT_SCHEMA_VERSION = 1;
const BLOCK_TYPES = ['text', 'rule', 'spacer', 'item', 'total', 'table', 'columns', 'image', 'qrcode', 'barcode'];
const ALIGNMENTS = ['left', 'center', 'right'];

export function createSampleDocument() {
  return {
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    title: 'Struk baru',
    paperWidthMm: 58,
    currency: 'IDR',
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
export function validateDocument(doc) {
  if (!doc || typeof doc !== 'object' || doc.schemaVersion !== DOCUMENT_SCHEMA_VERSION) {
    throw new TypeError('Versi dokumen tidak didukung.');
  }
  if (![58, 80].includes(doc.paperWidthMm)) throw new TypeError('Lebar kertas harus 58 atau 80 mm.');
  if (!Array.isArray(doc.blocks) || doc.blocks.length > 500) throw new TypeError('Daftar elemen tidak valid.');
  const ids = new Set();
  for (const block of doc.blocks) {
    if (!block || typeof block.id !== 'string' || !block.id || ids.has(block.id)) throw new TypeError('ID elemen tidak valid atau duplikat.');
    ids.add(block.id);
    if (!BLOCK_TYPES.includes(block.type) && block.type !== 'dynamic') throw new TypeError('Jenis elemen tidak didukung.');
    if (block.align !== undefined && !ALIGNMENTS.includes(block.align)) throw new TypeError('Perataan elemen tidak valid.');
    if (block.type === 'text') assertString(block.text, 'Teks elemen');
    if (block.type === 'dynamic') { if (block.field !== undefined && !['date', 'time', 'datetime', 'receiptNumber'].includes(block.field)) throw new TypeError('Placeholder lama tidak valid.'); if (block.text !== undefined) assertString(block.text, 'Teks placeholder lama'); }
    if (block.size !== undefined && !['small', 'normal', 'large', 'double'].includes(block.size)) throw new TypeError('Ukuran teks tidak valid.');
    for (const key of ['bold', 'italic', 'underline']) if (block[key] !== undefined && typeof block[key] !== 'boolean') throw new TypeError('Opsi format teks tidak valid.');
    if (block.type === 'rule' && block.style !== undefined && !['solid', 'dashed', 'double'].includes(block.style)) throw new TypeError('Gaya separator tidak valid.');
    if (block.type === 'spacer' && (!Number.isInteger(block.height) || block.height < 1 || block.height > 20)) throw new TypeError('Tinggi spacer harus 1–20 baris.');
    if (block.type === 'item' && (typeof block.name !== 'string' || block.name.length > 200 || !Number.isFinite(block.price) || block.price < 0)) throw new TypeError('Data item tidak valid.');
    if (block.type === 'total' && (typeof block.label !== 'string' || !Number.isFinite(block.amount) || block.amount < 0)) throw new TypeError('Data total tidak valid.');
    if (block.type === 'table') {
      if (!Array.isArray(block.headers) || block.headers.length < 1 || block.headers.length > 6 || block.headers.some(cell => typeof cell !== 'string' || cell.length > 200) || !Array.isArray(block.rows) || block.rows.length > 100) throw new TypeError('Struktur tabel tidak valid.');
      for (const row of block.rows) if (!Array.isArray(row) || row.length !== block.headers.length || row.some(cell => typeof cell !== 'string' || cell.length > 200)) throw new TypeError('Sel tabel tidak valid.');
      if (block.border !== undefined && !['all', 'horizontal', 'none'].includes(block.border)) throw new TypeError('Border tabel tidak valid.');
      if (block.columnWidths !== undefined && (!Array.isArray(block.columnWidths) || block.columnWidths.length !== block.headers.length || block.columnWidths.some(width => !Number.isFinite(width) || (block.headers.length === 1 ? width !== 100 : width < 8 || width > 92)) || Math.abs(block.columnWidths.reduce((sum, width) => sum + width, 0) - 100) > 1)) throw new TypeError('Lebar kolom tabel tidak valid.');
      if (block.size !== undefined && !['small', 'normal', 'large', 'double'].includes(block.size)) throw new TypeError('Ukuran teks tabel tidak valid.');
    }
    if (block.type === 'columns' && (!Array.isArray(block.columns) || block.columns.length < 2 || block.columns.length > 4 || block.columns.some(v => typeof v !== 'string' || v.length > 200))) throw new TypeError('Kolom tidak valid.');
    if (block.type === 'image') {
      assertString(block.dataUrl, 'Data gambar', 8_000_000);
      if (!/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(block.dataUrl)) throw new TypeError('Format gambar harus data URL base64 PNG/JPEG/WebP/GIF.');
      if (!Number.isInteger(block.width) || block.width < 1 || block.width > 512) throw new TypeError('Lebar gambar harus 1–512 px.');
      if (block.alt !== undefined) assertString(block.alt, 'Deskripsi gambar');
    }
    if (block.type === 'qrcode') { assertString(block.value, 'Isi QR', 2000); if (!block.value) throw new TypeError('Isi QR tidak boleh kosong.'); if (block.width !== undefined && (!Number.isInteger(block.width) || block.width < 32 || block.width > 512)) throw new TypeError('Lebar QR harus 32–512 px.'); }
    if (block.type === 'barcode') { assertString(block.value, 'Isi barcode', 128); if (!/^[\x20-\x7E]+$/.test(block.value)) throw new TypeError('Isi barcode harus berisi karakter ASCII yang dapat dicetak.'); if (block.width !== undefined && (!Number.isInteger(block.width) || block.width < 64 || block.width > 512)) throw new TypeError('Lebar barcode harus 64–512 px.'); }
  }
  return true;
}
export function cloneDocument(doc) { return structuredClone(doc); }

export function migrateLegacyDocument(doc) {
  const migrated = cloneDocument(doc);
  const manualLabels = { date: 'Tanggal: ', time: 'Waktu: ', datetime: 'Tanggal/waktu: ', receiptNumber: 'No. struk: ' };
  for (const block of migrated.blocks) {
    if (block.type !== 'dynamic') continue;
    block.text = typeof block.text === 'string' ? block.text : (manualLabels[block.field] || '');
    block.type = 'text';
    delete block.field;
    if (block.size === undefined) block.size = 'normal';
  }
  return migrated;
}
