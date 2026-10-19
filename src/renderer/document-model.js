export const DOCUMENT_SCHEMA_VERSION = 1;

export function createSampleDocument() {
  return {
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    title: 'Struk baru',
    paperWidthMm: 58,
    currency: 'IDR',
    blocks: [
      { id: 'b-store', type: 'text', text: 'WARUNG CONTOH', align: 'center', bold: true },
      { id: 'b-rule-1', type: 'rule' },
      { id: 'b-item-1', type: 'item', name: 'Teh hangat', price: 5000 },
      { id: 'b-item-2', type: 'item', name: 'Nasi goreng', price: 15000 },
      { id: 'b-rule-2', type: 'rule' },
      { id: 'b-total', type: 'total', label: 'Total', amount: 20000, bold: true },
      { id: 'b-footer', type: 'text', text: 'Terima kasih!', align: 'center', bold: false }
    ]
  };
}

export function validateDocument(doc) {
  if (!doc || typeof doc !== 'object' || doc.schemaVersion !== DOCUMENT_SCHEMA_VERSION) {
    throw new TypeError('Versi dokumen tidak didukung.');
  }
  if (![58, 80].includes(doc.paperWidthMm)) throw new TypeError('Lebar kertas harus 58 atau 80 mm.');
  if (!Array.isArray(doc.blocks) || doc.blocks.length > 500) throw new TypeError('Daftar elemen tidak valid.');
  const ids = new Set();
  for (const block of doc.blocks) {
    if (!block || typeof block.id !== 'string' || ids.has(block.id)) throw new TypeError('ID elemen tidak valid atau duplikat.');
    ids.add(block.id);
    if (!['text', 'rule', 'item', 'total'].includes(block.type)) throw new TypeError('Jenis elemen tidak didukung.');
    if (block.type === 'text' && typeof block.text !== 'string') throw new TypeError('Teks elemen tidak valid.');
    if (block.type === 'item' && (typeof block.name !== 'string' || !Number.isFinite(block.price) || block.price < 0)) {
      throw new TypeError('Data item tidak valid.');
    }
    if (block.type === 'total' && (typeof block.label !== 'string' || !Number.isFinite(block.amount) || block.amount < 0)) throw new TypeError('Data total tidak valid.');
  }
  return true;
}

export function cloneDocument(doc) {
  return structuredClone(doc);
}
