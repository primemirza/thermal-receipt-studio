import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSampleDocument, validateDocument, cloneDocument, migrateLegacyDocument, insertBlockAtSelection } from '../src/renderer/document-model.js';
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
  for (const id of ['add-rule-button', 'add-spacer-button', 'add-table-button', 'add-columns-button', 'add-section-button', 'global-layout-button', 'add-qr-button', 'add-barcode-button', 'add-image-button', 'table-dialog-form', 'table-columns-count', 'table-rows-count', 'block-size-input', 'block-bold-input', 'block-spacer-height', 'block-image-width', 'block-table-border', 'block-italic-input', 'block-underline-input', 'block-total-amount', 'block-rule-character', 'block-image-alt', 'table-add-row', 'table-remove-row', 'table-add-column', 'table-remove-column', 'columns-dialog-form', 'columns-count', 'columns-dialog-cancel', 'global-layout-form', 'global-margin-top', 'global-margin-right', 'global-margin-bottom', 'global-margin-left', 'block-table-width', 'block-table-padding', 'block-columns-width', 'block-columns-padding', 'block-columns-gap', 'block-column-widths', 'block-section-name', 'block-section-margin', 'block-section-padding', 'block-context-menu']) assert.ok(html.includes(id), id);
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
  assert.ok(js.includes('styledTable(block, false)'));
  assert.ok(js.includes('createTableWrapper(block, true)'));
  assert.ok(js.includes('createTableWrapper(block, false)'));
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


test('nested sections, global margins and table/column layout validate and round-trip', () => {
  const doc = createSampleDocument();
  doc.layout.margins = { top: 5, right: 3, bottom: 7, left: 4 };
  doc.blocks.push({
    id: 'section-a', type: 'section', name: 'Informasi transaksi',
    margin: { top: 2, right: 3, bottom: 2, left: 3 },
    padding: { top: 6, right: 8, bottom: 6, left: 8 },
    children: [
      { id: 'inside-text', type: 'text', text: 'Tanggal manual: 18/10/2026', align: 'left' },
      { id: 'inside-table', type: 'table', headers: ['Item', 'Jumlah'], rows: [['Teh', '2']], width: 82, offset: 18, padding: 6, columnWidths: [55, 45], border: 'vertical' },
      { id: 'inside-columns', type: 'columns', columns: ['Kiri', 'Kanan'], width: 90, padding: 5, gap: 4, border: 'all', columnWidths: [60, 40] }
    ]
  });
  assert.equal(validateDocument(doc), true);
  const loaded = parseTrstudio(serializeTrstudio(doc), validateDocument);
  assert.deepEqual(loaded.document, doc);
});

test('validator rejects invalid global margins, section boxes, widths and padding', () => {
  const margin = createSampleDocument();
  margin.layout.margins.left = 61;
  assert.throws(() => validateDocument(margin), /Margin global/);
  const section = createSampleDocument();
  section.blocks.push({ id: 'bad-section', type: 'section', name: 'Bad', children: [], margin: { top: 0, right: 0, bottom: 0, left: 80 } });
  assert.throws(() => validateDocument(section), /Margin section/);
  const width = createSampleDocument();
  width.blocks.push({ id: 'bad-width', type: 'table', headers: ['A','B'], rows: [], width: 15 });
  assert.throws(() => validateDocument(width), /Lebar tabel/);
  const padding = createSampleDocument();
  padding.blocks.push({ id: 'bad-padding', type: 'columns', columns: ['A','B'], padding: 31 });
  assert.throws(() => validateDocument(padding), /Padding kolom/);
});

test('new element insertion follows active selection and respects section nesting', () => {
  const doc = createSampleDocument();
  const first = { id: 'new-after-rule', type: 'text', text: 'After rule' };
  insertBlockAtSelection(doc, 'b-rule-1', first);
  assert.equal(doc.blocks[2].id, first.id, 'blok baru disisipkan setelah blok aktif');

  const emptySection = { id: 'empty-section', type: 'section', name: 'Kosong', children: [], margin: {top:0,right:0,bottom:0,left:0}, padding: {top:8,right:8,bottom:8,left:8} };
  doc.blocks.push(emptySection);
  const insideEmpty = { id: 'empty-child', type: 'text', text: 'Anak' };
  insertBlockAtSelection(doc, emptySection.id, insideEmpty);
  assert.deepEqual(emptySection.children.map(block => block.id), [insideEmpty.id]);

  const populated = { id: 'populated-section', type: 'section', name: 'Data', children: [
    { id: 'child-1', type: 'text', text: 'A' },
    { id: 'child-2', type: 'text', text: 'B' }
  ], margin: {top:0,right:0,bottom:0,left:0}, padding: {top:8,right:8,bottom:8,left:8} };
  doc.blocks.push(populated);
  const afterChild = { id: 'child-after', type: 'text', text: 'C' };
  insertBlockAtSelection(doc, 'child-1', afterChild);
  assert.deepEqual(populated.children.map(block => block.id), ['child-1', 'child-after', 'child-2']);
  const appendedInSection = { id: 'section-last', type: 'text', text: 'Last' };
  insertBlockAtSelection(doc, populated.id, appendedInSection);
  assert.equal(populated.children.at(-1).id, appendedInSection.id);

  const noSelection = { id: 'document-end', type: 'text', text: 'End' };
  const count = doc.blocks.length;
  insertBlockAtSelection(doc, null, noSelection);
  assert.equal(doc.blocks.length, count + 1);
  assert.equal(doc.blocks.at(-1).id, noSelection.id);
  assert.equal(validateDocument(doc), true);
});

test('table edge offset survives validation and invalid offset-width pairs are rejected', () => {
  const valid = createSampleDocument();
  valid.blocks.push({ id: 'edge-table-valid', type: 'table', headers: ['A', 'B'], rows: [], width: 72, offset: 28, columnWidths: [50, 50], padding: 5 });
  assert.equal(validateDocument(valid), true);
  const invalid = createSampleDocument();
  invalid.blocks.push({ id: 'edge-table-invalid', type: 'table', headers: ['A', 'B'], rows: [], width: 80, offset: 30, columnWidths: [50, 50] });
  assert.throws(() => validateDocument(invalid), /Posisi tabel/);
});
test('editor uses a dedicated drag handle and double-click editing rather than making the whole block draggable', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const js = fs.readFileSync(path.join(root, 'src/renderer/renderer.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'src/renderer/app.css'), 'utf8');
  assert.ok(js.includes('data-drag-handle'));
  assert.ok(js.includes("designPaper.addEventListener('dblclick'"));
  assert.ok(js.includes('insertBlockAtSelection(documentModel, selectedBlockId, block)'));
  assert.ok(js.includes("designPaper.addEventListener('contextmenu'"));
  assert.ok(!js.includes('node.draggable = true'));
  assert.ok(html.includes('id="add-section-button"'));
  assert.ok(html.includes('id="global-layout-button"'));
  assert.match(css, /body \.editor-panel \.inspector[\s\S]*?overflow-y: auto/);
  assert.match(css, /body \.toolbar[\s\S]*?flex-flow: row nowrap/);
  assert.ok(js.includes("data-table-width"));  assert.ok(js.includes("!['image','qrcode','barcode'].includes(block.type)"));
  assert.ok(js.includes('global-layout-form'));
  assert.ok(js.includes('tableWidthInput.addEventListener'));
  assert.ok(html.includes('value="vertical">Vertikal</option>'));
});
