import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSampleDocument, validateDocument, cloneDocument } from '../src/renderer/document-model.js';
import { serializeTrstudio, parseTrstudio } from '../src/main/trstudio-archive.js';

test('Phase 5 block types validate and survive .trstudio round-trip', () => {
  const doc = createSampleDocument();
  doc.blocks.push(
    { id: 'spacer-1', type: 'spacer', height: 3 },
    { id: 'table-1', type: 'table', headers: ['Item', 'Qty'], rows: [['Teh', '2']], border: 'all', columnWidths: [60, 40], align: 'left', size: 'normal' },
    { id: 'columns-1', type: 'columns', columns: ['Kiri', 'Kanan'] },
    { id: 'qr-1', type: 'qrcode', value: 'https://example.invalid' },
    { id: 'barcode-1', type: 'barcode', value: '1234567890' }
  );
  assert.equal(validateDocument(doc), true);
  const loaded = parseTrstudio(serializeTrstudio(doc), validateDocument);
  assert.deepEqual(loaded.document, doc);
});

test('image blocks validate as self-contained base64 data URLs', () => {
  const doc = createSampleDocument();
  doc.blocks.push({ id: 'image-1', type: 'image', dataUrl: 'data:image/png;base64,iVBORw0KGgo=', width: 120, align: 'center', alt: 'logo' });
  assert.equal(validateDocument(doc), true);
  const clone = cloneDocument(doc);
  assert.equal(clone.blocks.at(-1).dataUrl, doc.blocks.at(-1).dataUrl);
  clone.blocks.at(-1).width = 90;
  assert.equal(doc.blocks.at(-1).width, 120);
});

test('validator rejects malformed Phase 5 blocks', () => {
  const doc = createSampleDocument();
  doc.blocks.push({ id: 'bad-spacer', type: 'spacer', height: 0 });
  assert.throws(() => validateDocument(doc), /Tinggi spacer/);
  const table = createSampleDocument();
  table.blocks.push({ id: 'bad-table', type: 'table', headers: ['A', 'B'], rows: [['only one']] });
  assert.throws(() => validateDocument(table), /Sel tabel/);
  const image = createSampleDocument();
  image.blocks.push({ id: 'bad-image', type: 'image', dataUrl: 'https://example.com/x.png', width: 100 });
  assert.throws(() => validateDocument(image), /data URL base64/);
});

test('renderer and toolbar expose object creation and preview branches', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const js = fs.readFileSync(path.join(root, 'src/renderer/renderer.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
  for (const type of ['spacer', 'table', 'columns', 'qrcode', 'barcode', 'image']) assert.ok(js.includes("type: '" + type + "'") || js.includes("block.type === '" + type + "'"), type);
  for (const id of ['add-rule-button', 'add-spacer-button', 'add-table-button', 'add-columns-button', 'add-qr-button', 'add-barcode-button', 'add-image-button', 'table-dialog-form', 'table-columns-count', 'table-rows-count', 'block-size-input', 'block-bold-input', 'block-spacer-height', 'block-image-width', 'block-table-border']) assert.ok(html.includes(id), id);
});


test('table layout rejects bad column widths, malformed headers, and invalid borders', () => {
  const widths = createSampleDocument();
  widths.blocks.push({ id: 't-width', type: 'table', headers: ['A', 'B'], rows: [['1', '2']], columnWidths: [80, 30] });
  assert.throws(() => validateDocument(widths), /Lebar kolom/);
  const header = createSampleDocument();
  header.blocks.push({ id: 't-header', type: 'table', headers: ['A', 3], rows: [] });
  assert.throws(() => validateDocument(header), /Struktur tabel/);
  const border = createSampleDocument();
  border.blocks.push({ id: 't-border', type: 'table', headers: ['A'], rows: [], border: 'invisible' });
  assert.throws(() => validateDocument(border), /Border tabel/);
});

test('editor exposes common-document editing interactions', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const js = fs.readFileSync(path.join(root, 'src/renderer/renderer.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
  assert.ok(js.includes('data-inline-edit'));
  assert.ok(js.includes('data-col-resize'));
  assert.ok(js.includes('dragstart'));
  assert.ok(js.includes("event.key !== 'Delete'"));
  assert.ok(js.includes('createPreviewTable(block)'));
  assert.ok(html.includes('title="Sisipkan tabel"') || html.includes('title="Sisipkan tabel"') || html.includes('id="add-table-button" title="Sisipkan tabel"'));
  assert.ok(!html.includes('add-dynamic-button'));
  assert.ok(!html.includes('delete-block-button'));
});
