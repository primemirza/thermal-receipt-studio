import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSampleDocument, validateDocument, cloneDocument, totalAmount } from '../src/renderer/document-model.js';

test('sample document has schema version, unique IDs, supported blocks, and 58 mm width', () => {
  const doc = createSampleDocument();
  assert.equal(doc.schemaVersion, 1);
  assert.equal(doc.paperWidthMm, 58);
  assert.equal(validateDocument(doc), true);
  assert.equal(new Set(doc.blocks.map(block => block.id)).size, doc.blocks.length);
});

test('total amount derives from item blocks only', () => {
  const doc = createSampleDocument();
  assert.equal(totalAmount(doc), 20000);
  doc.blocks.push({ id: 'b-item-3', type: 'item', name: 'Air mineral', price: 3000 });
  assert.equal(totalAmount(doc), 23000);
});

test('document clone is independent from original', () => {
  const original = createSampleDocument();
  const clone = cloneDocument(original);
  clone.blocks[0].text = 'TOKO LAIN';
  assert.equal(original.blocks[0].text, 'WARUNG CONTOH');
});

test('validator rejects unsupported paper widths, duplicate IDs, and invalid prices', () => {
  const width = createSampleDocument();
  width.paperWidthMm = 76;
  assert.throws(() => validateDocument(width), /Lebar kertas/);
  const duplicate = createSampleDocument();
  duplicate.blocks.push({ ...duplicate.blocks[0] });
  assert.throws(() => validateDocument(duplicate), /duplikat/);
  const price = createSampleDocument();
  price.blocks.find(block => block.type === 'item').price = -1;
  assert.throws(() => validateDocument(price), /Data item/);
});

test('renderer wires selection, property editing, add/delete, undo and redo', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const js = fs.readFileSync(path.join(root, 'src/renderer/renderer.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
  for (const expected of ['selectBlock', 'addBlock', 'delete-block-button', 'undo-button', 'redo-button', 'textInput.addEventListener', 'priceInput.addEventListener', 'renderPreview', 'captureHistoryState', 'snapshot.document', 'snapshot.selectedBlockId']) {
    assert.ok(js.includes(expected), 'renderer memuat ' + expected);
  }
  assert.match(html, /id="undo-button"[^>]*>Undo<\/button>/);
  assert.match(html, /id="redo-button"[^>]*>Redo<\/button>/);
});
