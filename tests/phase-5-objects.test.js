import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSampleDocument, validateDocument, cloneDocument } from '../src/renderer/document-model.js';
import { serializeTrstudio, parseTrstudio } from '../src/main/trstudio-archive.js';

test('Phase 5 block types validate and survive .trstudio round-trip', () => {
  const doc = createSampleDocument();
  doc.blocks.push(
    { id: 'spacer-1', type: 'spacer', height: 3 },
    { id: 'dynamic-1', type: 'dynamic', field: 'datetime', align: 'center' },
    { id: 'table-1', type: 'table', headers: ['Item', 'Qty'], rows: [['Teh', '2']] },
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
  for (const type of ['spacer', 'dynamic', 'table', 'columns', 'qrcode', 'barcode', 'image']) assert.ok(js.includes("type: '" + type + "'") || js.includes("block.type === '" + type + "'"), type);
  for (const id of ['add-rule-button', 'add-spacer-button', 'add-dynamic-button', 'add-table-button', 'add-columns-button', 'add-qr-button', 'add-barcode-button', 'add-image-button']) assert.ok(html.includes(id), id);
});
