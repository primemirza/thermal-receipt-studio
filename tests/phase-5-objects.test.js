import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSampleDocument, validateDocument, cloneDocument, migrateLegacyDocument } from '../src/renderer/document-model.js';
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
  for (const id of ['add-rule-button', 'add-spacer-button', 'add-table-button', 'add-columns-button', 'add-qr-button', 'add-barcode-button', 'add-image-button', 'table-dialog-form', 'table-columns-count', 'table-rows-count', 'block-size-input', 'block-bold-input', 'block-spacer-height', 'block-image-width', 'block-table-border', 'block-italic-input', 'block-underline-input', 'block-total-amount', 'block-rule-character', 'block-image-alt', 'table-add-row', 'table-remove-row', 'table-add-column', 'table-remove-column', 'columns-dialog-form', 'columns-count', 'columns-dialog-cancel']) assert.ok(html.includes(id), id);
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
  assert.ok(html.includes('vendor/qrcode.js'));
  assert.ok(html.includes('vendor/qrcode_UTF8.js'));
  assert.ok(html.includes('vendor/JsBarcode.all.min.js'));
});

test('QR dan CODE128 dirender oleh library lokal tanpa layanan remote', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const js = fs.readFileSync(path.join(root, 'src/renderer/renderer.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
  assert.ok(fs.statSync(path.join(root, 'src/renderer/vendor/qrcode.js')).size > 10000);
  assert.ok(fs.statSync(path.join(root, 'src/renderer/vendor/JsBarcode.all.min.js')).size > 10000);
  assert.ok(js.includes('window.qrcode(0'));
  assert.ok(js.includes('window.JsBarcode(svg'));
  assert.ok(js.includes("format: 'CODE128'"));
  assert.ok(!html.includes('https://cdn.') && !html.includes('https://unpkg.com') && !html.includes('https://cdnjs.cloudflare.com'));
});

test('single-column tables and editable widths remain valid', () => {
  const doc = createSampleDocument();
  doc.blocks.push({ id: 'one-column-table', type: 'table', headers: ['Detail'], rows: [['Nilai']], columnWidths: [100], border: 'horizontal' });
  assert.equal(validateDocument(doc), true);
});

test('barcode accepts printable CODE128 data but rejects control characters', () => {
  const valid = createSampleDocument();
  valid.blocks.push({ id: 'code128-valid', type: 'barcode', value: 'INV-2026/10: A_01' });
  assert.equal(validateDocument(valid), true);
  const invalid = createSampleDocument();
  invalid.blocks.push({ id: 'code128-invalid', type: 'barcode', value: 'INV\n001' });
  assert.throws(() => validateDocument(invalid), /ASCII yang dapat dicetak/);
});

test('legacy date/time blocks migrate to ordinary manual text, not dynamic values', () => {
  const legacy = createSampleDocument();
  legacy.blocks.push({ id: 'legacy-date', type: 'dynamic', field: 'date', align: 'left' });
  assert.equal(validateDocument(legacy), true);
  const migrated = migrateLegacyDocument(legacy);
  const migratedBlock = migrated.blocks.at(-1);
  assert.equal(migratedBlock.type, 'text');
  assert.equal(migratedBlock.text, 'Tanggal: ');
  assert.equal(Object.hasOwn(migratedBlock, 'field'), false);
  assert.equal(validateDocument(migrated), true);
  assert.equal(legacy.blocks.at(-1).type, 'dynamic', 'migrasi tidak mengubah sumber');
});

test('all inspector controls referenced by renderer exist in the HTML', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const js = fs.readFileSync(path.join(root, 'src/renderer/renderer.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
  const ids = [...js.matchAll(/\$\(['"]([^'"]+)['"]\)/g)].map(match => match[1]);
  const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
  assert.deepEqual([...new Set(ids)].filter(id => !htmlIds.has(id)), []);
  assert.ok((html.match(/class=\"toolbar-icon\"/g) || []).length >= 15);
  assert.ok((html.match(/class="icon-button"[^>]*title="[^"]+"/g) || []).length >= 15);
  assert.ok(js.includes("$('columns-dialog-form').addEventListener('submit'"));
});
