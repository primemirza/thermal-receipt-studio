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
  for (const id of ['add-rule-button', 'add-spacer-button', 'add-table-button', 'add-columns-button', 'add-section-button', 'global-layout-button', 'add-qr-button', 'add-barcode-button', 'add-image-button', 'table-dialog-form', 'table-columns-count', 'table-rows-count', 'block-size-input', 'block-bold-input', 'block-spacer-height', 'block-image-width', 'block-table-border', 'block-italic-input', 'block-underline-input', 'block-total-amount', 'block-rule-character', 'block-image-alt', 'table-add-row', 'table-remove-row', 'table-add-column', 'table-remove-column', 'columns-dialog-form', 'columns-count', 'columns-dialog-cancel', 'global-layout-form', 'global-margin-top', 'global-margin-right', 'global-margin-bottom', 'global-margin-left', 'block-table-width', 'block-table-padding', 'block-columns-width', 'block-columns-padding', 'block-columns-gap', 'block-column-widths', 'block-section-name', 'block-section-child-count', 'block-spacing-fields', 'block-margin-top', 'block-margin-right', 'block-margin-bottom', 'block-margin-left', 'block-padding-top', 'block-padding-right', 'block-padding-bottom', 'block-padding-left', 'block-context-menu', 'align-left-button', 'align-center-button', 'align-right-button']) assert.ok(html.includes(id), id);
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


test('workspace panel order is properties, design canvas, then preview', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'src/renderer/app.css'), 'utf8');
  const props = html.indexOf('<section class="panel inspector-panel"');
  const canvas = html.indexOf('<section class="panel editor-panel"');
  const preview = html.indexOf('<section class="panel preview-panel"');
  assert.ok(props >= 0 && props < canvas && canvas < preview);
  assert.match(css, /grid-template-columns:\s*minmax\(255px, \.68fr\) minmax\(340px, 1\.15fr\) minmax\(320px, 1fr\)/);
  assert.match(css, /\.inspector-scroll[\s\S]*?overflow-y: auto/);
});

test('separator renders one style stroke instead of repeated glyphs plus a border', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const js = fs.readFileSync(path.join(root, 'src/renderer/renderer.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'src/renderer/app.css'), 'utf8');
  assert.ok(js.includes("if (character !== '-') { rule.classList.add('rule-character'); rule.textContent = character.repeat(documentModel.paperWidthMm === 58 ? 32 : 42); }"));
  assert.ok(js.includes("character !== '-' ? character.repeat(columns) : ''"));
  assert.match(css, /\.design-block\.design-block-rule \{ border-bottom: 0 !important; \}/);
  assert.match(css, /\.receipt-line\.rule-character \{ border-bottom: 0 !important; \}/);
});

test('Word-style alignment toolbar applies to all blocks and individual table/column cells', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const js = fs.readFileSync(path.join(root, 'src/renderer/renderer.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
  const model = fs.readFileSync(path.join(root, 'src/renderer/document-model.js'), 'utf8');
  for (const id of ['align-left-button','align-center-button','align-right-button']) assert.ok(html.includes('id="' + id + '"'));
  assert.ok(!html.includes('id="block-align-input"'), 'alignment is not a property inspector control anymore');
  assert.ok(js.includes('function applyAlignment(alignment)'));
  assert.ok(js.includes("block.cellAlignments[rowIndex][target.colIndex] = alignment"));
  assert.ok(js.includes("block.columnAlignments[target.colIndex] = alignment"));
  assert.ok(js.includes("alignmentButtons.forEach(button => button.addEventListener('click'"));
  assert.ok(js.includes("event.shiftKey && ['l','e','r'].includes(key)"));
  assert.ok(model.includes("block.cellAlignments.forEach((row, rowIndex) => assertAlignments(row, block.headers.length"));
  assert.ok(model.includes("assertAlignments(block.columnAlignments"));
});

test('zoom controls update both canvas and receipt preview without rebuilding the canvas on every step', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const js = fs.readFileSync(path.join(root, 'src/renderer/renderer.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
  const zoom = js.slice(js.indexOf('function setZoom(value)'), js.indexOf('function selectBlock', js.indexOf('function setZoom(value)')));
  assert.ok(zoom.includes('designPaper.style.zoom = String(state.zoom / 100)'));
  assert.ok(zoom.includes('renderPreview()'));
  assert.ok(zoom.includes('zoomValue.textContent = state.zoom + \'%\''));
  assert.ok(zoom.includes('Zoom area kerja dan preview'));
  assert.ok(js.includes('designPaper.style.zoom = String(state.zoom / 100)'), 'canvas zoom must also be applied on render');
  assert.ok(html.includes('Perkecil area kerja dan preview'));
  assert.ok(html.includes('Perbesar area kerja dan preview'));
});

test('tables and text columns preserve explicit false bold/italic/underline values', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const js = fs.readFileSync(path.join(root, 'src/renderer/renderer.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'src/renderer/app.css'), 'utf8');
  assert.ok(js.includes("node.style.fontWeight = block.bold === true ? '700' : '400'"));
  assert.ok(js.includes("table.style.fontWeight = block.bold === true ? '700' : '400'"));
  assert.ok(js.includes("cell.style.fontWeight = block.bold === true ? '700' : '400'"));
  assert.match(css, /\.canvas-table th, \.preview-table th \{[\s\S]*?font-weight: inherit/);
  assert.match(css, /\.column-cell \{[\s\S]*?font-weight: inherit/);
});

test('nested sections can contain further sections and alignment model stays valid through round-trip', () => {
  const doc = createSampleDocument();
  const root = {
    id: 'section-root', type: 'section', name: 'Root',
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    padding: { top: 8, right: 8, bottom: 8, left: 8 }, children: []
  };
  const nested = {
    id: 'section-nested', type: 'section', name: 'Nested',
    margin: { top: 1, right: 1, bottom: 1, left: 1 },
    padding: { top: 2, right: 2, bottom: 2, left: 2 }, children: [
      { id: 'nested-text', type: 'text', text: 'Di dalam section', align: 'center' }
    ]
  };
  root.children.push(nested);
  doc.blocks.push(root);
  insertBlockAtSelection(doc, root.id, { id: 'section-child-after-nested', type: 'text', text: 'Child berikutnya' });
  assert.equal(root.children.at(-1).id, 'section-child-after-nested');
  const grandchild = {
    id: 'section-grandchild', type: 'section', name: 'Section di dalam section',
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    padding: { top: 2, right: 2, bottom: 2, left: 2 }, children: []
  };
  insertBlockAtSelection(doc, nested.id, grandchild);
  assert.equal(nested.children.at(-1).id, grandchild.id);
  const grandchildText = { id: 'grandchild-text', type: 'text', text: 'Nested paling dalam' };
  insertBlockAtSelection(doc, grandchild.id, grandchildText);
  assert.equal(grandchild.children[0].id, grandchildText.id);
  assert.equal(validateDocument(doc), true);
  const loaded = parseTrstudio(serializeTrstudio(doc), validateDocument);
  assert.deepEqual(loaded.document, doc);
  const tooDeep = createSampleDocument();
  let children = tooDeep.blocks;
  for (let i = 0; i < 22; i += 1) {
    const section = { id: 'deep-section-' + i, type: 'section', name: 'Level ' + i, margin: { top:0,right:0,bottom:0,left:0 }, padding: { top:0,right:0,bottom:0,left:0 }, children: [] };
    children.push(section); children = section.children;
  }
  assert.throws(() => validateDocument(tooDeep), /20 level/);
});

test('table and column per-cell alignment values are validated and round-trip', () => {
  const doc = createSampleDocument();
  doc.blocks.push({
    id: 'aligned-table', type: 'table', headers: ['A','B'], rows: [['1','2']],
    cellAlignments: [['center','right'], ['left','center']], columnWidths: [50,50]
  });
  doc.blocks.push({
    id: 'aligned-columns', type: 'columns', columns: ['Kiri','Kanan'],
    columnAlignments: ['left','right'], columnWidths: [50,50]
  });
  assert.equal(validateDocument(doc), true);
  const loaded = parseTrstudio(serializeTrstudio(doc), validateDocument);
  assert.deepEqual(loaded.document, doc);
  const invalid = cloneDocument(doc);
  invalid.blocks.find(block => block.id === 'aligned-table').cellAlignments[1][0] = 'justify';
  assert.throws(() => validateDocument(invalid), /Perataan/);
  const invalidColumns = cloneDocument(doc);
  invalidColumns.blocks.find(block => block.id === 'aligned-columns').columnAlignments.push('left');
  assert.throws(() => validateDocument(invalidColumns), /Perataan/);
});

test('double-click editing preserves the target node and handles block, table and column surfaces', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const js = fs.readFileSync(path.join(root, 'src/renderer/renderer.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
  const factory = js.slice(js.indexOf('function createEditableText'), js.indexOf('function styledTable'));
  const select = js.slice(js.indexOf('function selectBlock'), js.indexOf('function addBlock'));
  const resolver = js.slice(js.indexOf('function resolveInlineEditor'), js.indexOf('function trackInlineTarget'));
  const helper = js.slice(js.indexOf('function beginInlineEdit'), js.indexOf("designPaper.addEventListener('click'"));
  const click = js.slice(js.indexOf("designPaper.addEventListener('click'"), js.indexOf("$('editor-surface').addEventListener('dblclick'"));
  const dbl = js.slice(js.indexOf("$('editor-surface').addEventListener('dblclick'"), js.indexOf("designPaper.addEventListener('keydown'"));
  const context = js.slice(js.indexOf("designPaper.addEventListener('contextmenu'"), js.indexOf("document.addEventListener('pointerdown'", js.indexOf("designPaper.addEventListener('contextmenu'")));
  assert.ok(factory.includes("span.contentEditable = 'false'"));
  assert.ok(!select.includes('renderCanvas()'), 'selecting a block must not replace the DOM target before dblclick');
  assert.ok(select.includes("node.classList.toggle('is-selected'"));
  assert.ok(resolver.includes("target.closest('[data-inline-edit]')"));
  assert.ok(resolver.includes("target.closest('td, th, .column-cell, .section-header')"));
  assert.ok(resolver.includes('const field = fieldByType[block.type]'));
  assert.ok(resolver.includes('return blockNode.querySelector('));
  assert.ok(resolver.includes("block.type === 'table' || block.type === 'columns'"));
  assert.ok(helper.includes("editor.setAttribute('contenteditable', 'true')"));
  assert.ok(helper.includes('editor.focus()'));
  assert.ok(helper.includes('selectNodeContents(editor)'));
  assert.ok(click.includes('event.detail >= 2 && editor'));
  assert.ok(click.includes('selectBlock(blockNode.dataset.blockId)'));
  assert.ok(dbl.includes("beginInlineEdit(editor, blockNode.dataset.blockId)"));
  assert.ok(dbl.includes("}, true);"), 'dblclick must be caught during capture before bubble handlers');
  assert.ok(!context.includes("contentEditable = 'true'"), 'right-click must never activate edit mode');
  assert.ok(html.includes('id="design-paper"') && html.includes('id="editor-surface"'));
});
test('image, QR and barcode objects have direct resize handles with validated bounds', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const js = fs.readFileSync(path.join(root, 'src/renderer/renderer.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'src/renderer/app.css'), 'utf8');
  assert.ok(js.includes('function createResizableObject(block, content)'));
  assert.ok(js.includes("event.target.closest('[data-object-resize]')"));
  assert.ok(js.includes("!['image', 'qrcode', 'barcode'].includes(block.type)"));
  assert.ok(js.includes('Math.min(512, Math.round(startWidth + delta))'));
  assert.match(css, /\.object-resize-handle[\s\S]*?cursor: nwse-resize/);
});

test('every block supports independent margin and padding values on all four sides', () => {
  const doc = createSampleDocument();
  doc.blocks.push({
    id: 'custom-box-model', type: 'text', text: 'Box model',
    margin: { top: 1, right: 2, bottom: 3, left: 4 },
    blockPadding: { top: 5, right: 6, bottom: 7, left: 8 }
  });
  assert.equal(validateDocument(doc), true);
  const invalidMargin = cloneDocument(doc);
  invalidMargin.blocks.at(-1).margin.left = 61;
  assert.throws(() => validateDocument(invalidMargin), /Margin blok/);
  const invalidPadding = cloneDocument(doc);
  invalidPadding.blocks.at(-1).blockPadding.bottom = 61;
  assert.throws(() => validateDocument(invalidPadding), /Padding blok/);
  const invalidSectionPadding = createSampleDocument();
  invalidSectionPadding.blocks.push({
    id: 'section-padding-box-invalid', type: 'section', name: 'Section',
    children: [], margin: { top: 0, right: 0, bottom: 0, left: 0 },
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    blockPadding: { top: 61, right: 0, bottom: 0, left: 0 }
  });
  assert.throws(() => validateDocument(invalidSectionPadding), /Padding blok/);
});

test('saving and opening a document synchronize the real Electron title with its file name', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const js = fs.readFileSync(path.join(root, 'src/renderer/renderer.js'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'src/preload/preload.cjs'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'src/main/main.js'), 'utf8');
  assert.ok(js.includes("document.title = fileName ? 'Thermal Receipt Studio - ' + fileName : 'Thermal Receipt Studio'"));
  assert.ok(js.includes('window.trs.setWindowTitle(document.title)'));
  assert.ok(preload.includes("setWindowTitle: (title) => invoke('window:setTitle', [title])"));
  assert.ok(main.includes("'window:setTitle'"));
  assert.ok(main.includes('mainWindow?.setTitle(title)'));
  assert.ok(js.includes('currentFilePath = null; updateWindowTitle()'));
});

test('context menu duplicate inserts a full independent copy immediately below selected block', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const js = fs.readFileSync(path.join(root, 'src/renderer/renderer.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
  const duplicate = js.slice(js.indexOf('function duplicateSelectedBlock'), js.indexOf('function deleteSelectedBlock'));
  assert.ok(html.includes('data-context-action="duplicate">Duplikat elemen</button>'));
  assert.ok(js.includes("else if (action === 'duplicate') duplicateSelectedBlock()"));
  assert.ok(duplicate.includes('cloneBlockWithFreshIds(entry.block)'));
  assert.ok(duplicate.includes('current.list.splice(current.index + 1, 0, duplicate)'));
  assert.ok(js.includes('function cloneBlockWithFreshIds(block)'));
});
