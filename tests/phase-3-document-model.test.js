import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSampleDocument, validateDocument, cloneDocument } from '../src/renderer/document-model.js';

test('sample document has schema version, unique IDs, supported blocks, and 58 mm width', () => {
  const doc = createSampleDocument();
  assert.equal(doc.schemaVersion, 1);
  assert.equal(doc.paperWidthMm, 58);
  assert.equal(validateDocument(doc), true);
  assert.equal(new Set(doc.blocks.map(block => block.id)).size, doc.blocks.length);
});

test('total amount is explicit and does not change when item prices change', () => {
  const doc = createSampleDocument();
  const total = doc.blocks.find(block => block.type === 'total');
  assert.equal(total.amount, 20000);
  doc.blocks.find(block => block.type === 'item').price = 8000;
  assert.equal(total.amount, 20000);
});

test('document clone is independent from original', () => {
  const original = createSampleDocument();
  const clone = cloneDocument(original);
  clone.blocks[0].text = 'TOKO LAIN';
  assert.equal(original.blocks[0].text, 'WARUNG CONTOH');
});

test('validator rejects unsupported paper widths, duplicate IDs, invalid prices and invalid totals', () => {
  const width = createSampleDocument();
  width.paperWidthMm = 76;
  assert.throws(() => validateDocument(width), /Lebar kertas/);
  const duplicate = createSampleDocument();
  duplicate.blocks.push({ ...duplicate.blocks[0] });
  assert.throws(() => validateDocument(duplicate), /duplikat/);
  const price = createSampleDocument();
  price.blocks.find(block => block.type === 'item').price = -1;
  assert.throws(() => validateDocument(price), /Data item/);
  const amount = createSampleDocument();
  amount.blocks.find(block => block.type === 'total').amount = -1;
  assert.throws(() => validateDocument(amount), /Data total/);
});

test('renderer uses prefix-free number formatting and explicit total values in both outputs', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const js = fs.readFileSync(path.join(root, 'src/renderer/renderer.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
  for (const expected of ['selectBlock', 'addBlock', "event.key !== 'Delete'", 'undo-button', 'redo-button', 'textInput.addEventListener', 'priceInput.addEventListener', 'renderPreview', 'captureHistoryState', 'snapshot.document', 'snapshot.selectedBlockId']) {
    assert.ok(js.includes(expected), 'renderer memuat ' + expected);
  }
  assert.match(js, /const money = \(amount\) => currency\.format\(amount\)/);
  assert.doesNotMatch(js, /'Rp\\s*'\s*\+\s*currency\.format/);
  assert.match(js, /block\.amount/);
  assert.doesNotMatch(js, /function\s+totalAmount\s*\(/);
  assert.match(html, /id="undo-button"[^>]*title="Urungkan \(Ctrl\+Z\)"[^>]*><svg/);
  assert.match(html, /id="redo-button"[^>]*title="Ulangi \(Ctrl\+Y\)"[^>]*><svg/);
  assert.doesNotMatch(html, /delete-block-button/);
});
