import { createSampleDocument, cloneDocument, validateDocument } from './document-model.js';

const $ = (id) => document.getElementById(id);
const statusText = $('status-text');
const statusVersion = $('status-version');
const appMeta = $('app-meta');
const paperButtons = [...document.querySelectorAll('[data-paper]')];
const designPaper = $('design-paper');
const receiptPreview = $('receipt-preview');
const previewStage = $('preview-stage');
const zoomValue = $('zoom-value');
const zoomStatus = $('zoom-status');
const paperChip = $('paper-chip');
const canvasWidthLabel = $('canvas-width-label');
const previewDimensions = $('preview-dimensions');
const previewStatus = $('preview-status');
const guideButton = $('toggle-guides');
const textInput = $('block-text-input');
const priceInput = $('block-price-input');
const alignInput = $('block-align-input');
const selectedLabel = $('selected-block-label');
const sizeInput = $('block-size-input');
const boldInput = $('block-bold-input');
const spacerHeightInput = $('block-spacer-height');
const imageWidthInput = $('block-image-width');
const ruleStyleInput = $('block-rule-style');
const tableBorderInput = $('block-table-border');

let documentModel = createSampleDocument();
let selectedBlockId = null;
let isDirty = false;
let currentFilePath = null;
const state = { zoom: 100, guides: false, undo: [], redo: [] };
const currency = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
// Harga ditampilkan sebagai angka berkelompok; mata uang/prefix tidak dipaksakan oleh editor.
const money = (amount) => currency.format(amount);

function setStatus(message) { statusText.textContent = message; }
function selectedBlock() { return documentModel.blocks.find(block => block.id === selectedBlockId) ?? null; }
function captureHistoryState() {
  return { document: cloneDocument(documentModel), selectedBlockId };
}
function saveUndoPoint() {
  state.undo.push(captureHistoryState());
  if (state.undo.length > 80) state.undo.shift();
  state.redo = [];
  updateHistoryButtons();
}
function updateHistoryButtons() {
  $('undo-button').disabled = state.undo.length === 0;
  $('redo-button').disabled = state.redo.length === 0;
}
function mutate(mutator, message) {
  saveUndoPoint();
  mutator();
  isDirty = true;
  validateDocument(documentModel);
  renderAll();
  setStatus(message);
}
function restoreHistory(from, to, message) {
  if (!from.length) return;
  to.push(captureHistoryState());
  const snapshot = from.pop();
  documentModel = cloneDocument(snapshot.document);
  isDirty = true;
  selectedBlockId = documentModel.blocks.some(block => block.id === snapshot.selectedBlockId)
    ? snapshot.selectedBlockId
    : null;
  validateDocument(documentModel);
  renderAll();
  setStatus(message);
}
function make(tag, className, value) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (value !== undefined) el.textContent = value;
  return el;
}
function makeLine(className, children) {
  const line = make('div', 'receipt-line' + (className ? ' ' + className : ''));
  children.forEach(child => line.append(child));
  return line;
}
function columnWidths(block) {
  const n = block.headers.length;
  if (Array.isArray(block.columnWidths) && block.columnWidths.length === n) return block.columnWidths;
  const width = Number((100 / n).toFixed(2));
  return Array.from({ length: n }, (_, i) => i === n - 1 ? Number((100 - width * (n - 1)).toFixed(2)) : width);
}
function createEditableText(value, field, extra = {}) {
  const span = make('span', '', value ?? '');
  span.contentEditable = 'true'; span.spellcheck = false; span.dataset.inlineEdit = 'true'; span.dataset.field = field;
  for (const [key, val] of Object.entries(extra)) span.dataset[key] = String(val);
  return span;
}
function createEditableTable(block) {
  const table = make('table', 'canvas-table border-' + (block.border || 'all')); table.dataset.tableId = block.id;
  const colgroup = document.createElement('colgroup');
  columnWidths(block).forEach(width => { const col = document.createElement('col'); col.style.width = width + '%'; colgroup.append(col); }); table.append(colgroup);
  const thead = document.createElement('thead'); const headRow = document.createElement('tr');
  block.headers.forEach((header, colIndex) => { const th = document.createElement('th'); th.append(createEditableText(header, 'tableCell', { rowIndex: -1, colIndex })); if (colIndex < block.headers.length - 1) { const grip = make('span', 'column-resize-handle'); grip.dataset.colResize = String(colIndex); grip.title = 'Tarik untuk mengubah lebar kolom'; grip.setAttribute('aria-label', 'Ubah lebar kolom'); th.append(grip); } headRow.append(th); });
  thead.append(headRow); table.append(thead);
  const tbody = document.createElement('tbody');
  block.rows.forEach((row, rowIndex) => { const tr = document.createElement('tr'); row.forEach((value, colIndex) => { const td = document.createElement('td'); td.append(createEditableText(value, 'tableCell', { rowIndex, colIndex })); tr.append(td); }); tbody.append(tr); });
  table.append(tbody);
  table.style.fontSize = ({ small: '9px', normal: '11px', large: '13px', double: '15px' })[block.size || 'normal']; if (block.bold) table.style.fontWeight = '700';
  return table;
}
function createPreviewTable(block) {
  const table = make('table', 'preview-table border-' + (block.border || 'all')); const colgroup = document.createElement('colgroup');
  columnWidths(block).forEach(width => { const col = document.createElement('col'); col.style.width = width + '%'; colgroup.append(col); }); table.append(colgroup);
  const thead = document.createElement('thead'); const headRow = document.createElement('tr'); block.headers.forEach(value => headRow.append(make('th', '', value))); thead.append(headRow); table.append(thead);
  const tbody = document.createElement('tbody'); block.rows.forEach(row => { const tr = document.createElement('tr'); row.forEach(value => tr.append(make('td', '', value))); tbody.append(tr); }); table.append(tbody);
  table.style.textAlign = block.align || 'left'; table.style.fontSize = ({ small: '9px', normal: '11px', large: '13px', double: '15px' })[block.size || 'normal']; if (block.bold) table.style.fontWeight = '700';
  return table;
}
function applyBlockLayout(node, block) {
  node.style.textAlign = block.align || 'left';
  if (block.align === 'right') node.style.justifyContent = 'flex-end'; else if (block.align === 'center') node.style.justifyContent = 'center';
  node.style.fontSize = ({ small: '9px', normal: '11px', large: '14px', double: '17px' })[block.size || 'normal']; if (block.bold) node.style.fontWeight = '700';
}
function renderCanvas() {
  const fragment = document.createDocumentFragment();
  for (const block of documentModel.blocks) {
    const node = make('div', 'design-block' + (block.id === selectedBlockId ? ' is-selected' : ''));
    applyBlockLayout(node, block);
    node.dataset.blockId = block.id;
    node.tabIndex = 0;
    node.setAttribute('role', 'button');
    node.setAttribute('aria-label', 'Pilih elemen ' + block.type);
    node.append(make('span', 'block-type', block.type.toUpperCase()));
    if (block.type === 'rule') {
      const rule = make('span', 'design-rule'); rule.classList.add('rule-' + (block.style || 'solid')); node.append(rule);
    } else if (block.type === 'spacer') {
      node.append(make('span', 'object-placeholder', 'Spacer · ' + block.height + ' baris'));
      node.style.minHeight = (block.height * 8) + 'px';
    } else if (block.type === 'table') {
      node.append(createEditableTable(block));
    } else if (block.type === 'columns') {
      const columns = make('div', 'object-columns'); block.columns.forEach((value, index) => columns.append(createEditableText(value, 'columnCell', { colIndex: index }))); node.append(columns);
    } else if (block.type === 'image') {
      const img = document.createElement('img'); img.src = block.dataUrl; img.alt = block.alt || 'Gambar struk'; img.style.width = block.width + 'px'; img.style.maxWidth = '100%'; node.append(img);
    } else if (block.type === 'qrcode' || block.type === 'barcode') {
      const code = make('span', 'object-placeholder', block.type.toUpperCase() + ' · '); code.append(createEditableText(block.value, 'value')); node.append(code);
    } else if (block.type === 'item') {
      node.append(createEditableText(block.name, 'name'));
      node.append(make('span', 'block-price', money(block.price)));
    } else if (block.type === 'total') {
      node.append(createEditableText(block.label, 'label'), make('strong', 'block-price', money(block.amount)));
    } else {
      const text = createEditableText(block.text, 'text'); if (block.bold) text.style.fontWeight = '700';
      if (block.align === 'right') node.style.justifyContent = 'flex-end';
      node.append(text);
    }
    fragment.append(node);
  }
  designPaper.replaceChildren(fragment);
}
function renderPreview() {
  const columns = documentModel.paperWidthMm === 58 ? 32 : 42;
  const fragment = document.createDocumentFragment();
  for (const block of documentModel.blocks) {
    if (block.type === 'rule') {
      fragment.append(makeLine('rule rule-' + (block.style || 'solid'), [make('span', '', (block.character || '-').repeat(columns))]));
    } else if (block.type === 'spacer') {
      const spacer = make('div', 'receipt-spacer'); spacer.style.height = (block.height * 4) + 'px'; fragment.append(spacer);
    } else if (block.type === 'table') {
      fragment.append(makeLine('', [make('span', 'object-table-preview', [block.headers.join(' | '), ...block.rows.map(row => row.join(' | '))].join('\n'))]));
    } else if (block.type === 'columns') {
      const line = makeLine('columns-line', []); const columns = make('span', 'object-columns-preview'); block.columns.forEach(value => columns.append(make('span', '', value))); line.append(columns); fragment.append(line);
    } else if (block.type === 'image') {
      const line = makeLine(block.align === 'center' ? 'center' : '', []); if (block.align === 'right') line.style.justifyContent = 'flex-end';
      const img = document.createElement('img'); img.src = block.dataUrl; img.alt = block.alt || 'Gambar struk'; img.style.width = block.width + 'px'; img.style.maxWidth = '100%'; line.append(img); fragment.append(line);
    } else if (block.type === 'qrcode' || block.type === 'barcode') {
      const code = make('span', 'object-placeholder', block.type.toUpperCase() + ' · ' + block.value); const line = makeLine(block.align === 'center' ? 'center' : '', [code]); if (block.align === 'right') line.style.justifyContent = 'flex-end'; fragment.append(line);
    } else if (block.type === 'item') {
      fragment.append(makeLine('', [make('span', '', block.name), make('span', 'right', money(block.price))]));
    } else if (block.type === 'total') {
      fragment.append(makeLine('', [make('b', '', block.label), make('b', 'right', money(block.amount))]));
    } else if (block.type === 'text') {
      const cls = block.align === 'center' ? 'center' : '';
      const content = make(block.bold ? 'b' : 'span', '', block.text);
      const line = makeLine(cls, [content]);
      if (block.align === 'right') line.style.justifyContent = 'flex-end';
      fragment.append(line);
    }
  }
  receiptPreview.replaceChildren(fragment);
  receiptPreview.className = 'receipt-preview zoom-' + state.zoom;
  receiptPreview.dataset.paper = String(documentModel.paperWidthMm);
  designPaper.dataset.paper = String(documentModel.paperWidthMm);
  previewStage.classList.toggle('show-guides', state.guides);
  $('editor-surface').classList.toggle('show-guides', state.guides);
  paperButtons.forEach(button => {
    const active = Number(button.dataset.paper) === documentModel.paperWidthMm;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  zoomValue.textContent = state.zoom + '%';
  zoomStatus.textContent = 'Zoom ' + state.zoom + '%';
  paperChip.textContent = documentModel.paperWidthMm + ' mm';
  canvasWidthLabel.textContent = documentModel.paperWidthMm + ' mm';
  previewDimensions.textContent = documentModel.paperWidthMm + ' mm · ' + columns + ' kolom';
  previewStatus.textContent = 'Preview diperbarui';
}
function renderInspector() {
  const block = selectedBlock();
  selectedLabel.textContent = block ? 'Elemen: ' + block.type : 'Pilih elemen di kanvas';
  textInput.disabled = !block || !['text', 'item', 'total', 'qrcode', 'barcode'].includes(block.type);
  priceInput.disabled = !block || block.type !== 'item';
  alignInput.disabled = !block || !['text','item','total','table','columns','image','qrcode','barcode'].includes(block.type);
  textInput.value = !block ? '' : block.type === 'item' ? block.name : block.type === 'total' ? block.label : block.type === 'text' ? block.text : ['qrcode', 'barcode'].includes(block.type) ? (block.value || '') : '';
  priceInput.value = block?.type === 'item' ? String(block.price) : '';
  alignInput.value = block?.align ?? 'left';
  sizeInput.disabled = !block || !['text','item','total','table','columns','qrcode','barcode'].includes(block.type);
  sizeInput.value = block?.size || 'normal';
  boldInput.disabled = !block || !['text','item','total','table','columns'].includes(block.type);
  boldInput.checked = Boolean(block?.bold);
  spacerHeightInput.disabled = !block || block.type !== 'spacer';
  spacerHeightInput.value = block?.type === 'spacer' ? String(block.height) : '';
  imageWidthInput.disabled = !block || block.type !== 'image';
  imageWidthInput.value = block?.type === 'image' ? String(block.width) : '';
  ruleStyleInput.disabled = !block || block.type !== 'rule';
  ruleStyleInput.value = block?.type === 'rule' ? (block.style || 'solid') : 'solid';
  tableBorderInput.disabled = !block || block.type !== 'table';
  tableBorderInput.value = block?.type === 'table' ? (block.border || 'all') : 'all';
}
function renderAll() {
  renderCanvas();
  renderPreview();
  renderInspector();
  updateHistoryButtons();
}
function setPaper(width) {
  if (![58, 80].includes(width)) return;
  mutate(() => { documentModel.paperWidthMm = width; }, 'Lebar kertas diubah ke ' + width + ' mm.');
}
function setZoom(value) {
  state.zoom = Math.min(150, Math.max(60, value));
  renderPreview();
  setStatus('Zoom preview ' + state.zoom + '%.');
}
function selectBlock(id, preserveCanvas = false) {
  selectedBlockId = id;
  if (!preserveCanvas) renderCanvas();
  else designPaper.querySelectorAll('[data-block-id]').forEach(node => node.classList.toggle('is-selected', node.dataset.blockId === id));
  renderInspector();
}
function addBlock(type) {
  const id = 'b-' + crypto.randomUUID();
  mutate(() => {
    const templates = {
      item: { id, type: 'item', name: 'Item baru', price: 0 },
      rule: { id, type: 'rule', style: 'solid', character: '-' },
      spacer: { id, type: 'spacer', height: 2 },
      table: { id, type: 'table', headers: ['Kolom 1', 'Kolom 2'], rows: [['', '']], border: 'all', columnWidths: [50, 50], align: 'left', size: 'normal', bold: false },
      columns: { id, type: 'columns', columns: ['Kolom 1', 'Kolom 2'] },
      qrcode: { id, type: 'qrcode', value: 'https://example.invalid' },
      barcode: { id, type: 'barcode', value: '1234567890' },
      text: { id, type: 'text', text: 'Teks baru', align: 'left', bold: false, size: 'normal' }
    };
    const block = templates[type] || templates.text;
    documentModel.blocks.push(block);
    selectedBlockId = id;
  }, 'Objek ' + type + ' ditambahkan.');
}
paperButtons.forEach(button => button.addEventListener('click', () => setPaper(Number(button.dataset.paper))));
$('zoom-out').addEventListener('click', () => setZoom(state.zoom - 10));
$('zoom-in').addEventListener('click', () => setZoom(state.zoom + 10));
$('zoom-fit').addEventListener('click', () => setZoom(100));
guideButton.addEventListener('click', () => {
  state.guides = !state.guides;
  guideButton.setAttribute('aria-pressed', String(state.guides));
  guideButton.textContent = 'Panduan: ' + (state.guides ? 'aktif' : 'mati');
  renderPreview();
  renderCanvas();
  setStatus(state.guides ? 'Panduan ukuran ditampilkan.' : 'Panduan ukuran disembunyikan.');
});
designPaper.addEventListener('click', event => {
  const block = event.target.closest('[data-block-id]');
  if (block) selectBlock(block.dataset.blockId, Boolean(event.target.closest('[data-inline-edit], [data-col-resize]')));
});
designPaper.addEventListener('keydown', event => {
  if (event.target.closest('[data-inline-edit]')) return;
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const block = event.target.closest('[data-block-id]');
  if (block) { event.preventDefault(); selectBlock(block.dataset.blockId); }
});
textInput.addEventListener('change', () => {
  const block = selectedBlock();
  if (!block || !['text', 'item', 'total', 'qrcode', 'barcode'].includes(block.type)) return;
  const value = textInput.value.slice(0, block.type === 'qrcode' ? 2000 : 200);
  const key = block.type === 'text' ? 'text' : block.type === 'item' ? 'name' : block.type === 'total' ? 'label' : 'value';
  if (block[key] === value) return;
  mutate(() => { block[key] = value; }, 'Isi elemen diperbarui.');
});
designPaper.addEventListener('focusout', event => {
  const cell = event.target.closest('[data-inline-edit]'); if (!cell) return;
  const blockNode = cell.closest('[data-block-id]'); const block = documentModel.blocks.find(item => item.id === blockNode?.dataset.blockId); if (!block) return;
  const field = cell.dataset.field; const value = cell.textContent.slice(0, 200);
  if (field === 'tableCell') {
    const row = Number(cell.dataset.rowIndex); const col = Number(cell.dataset.colIndex); const oldValue = row < 0 ? block.headers?.[col] : block.rows?.[row]?.[col];
    if (oldValue === value || block.type !== 'table') return;
    mutate(() => { if (row < 0) block.headers[col] = value; else block.rows[row][col] = value; }, 'Isi sel tabel diperbarui.');
  } else if (field === 'columnCell' && block.type === 'columns') {
    const index = Number(cell.dataset.colIndex); if (block.columns[index] === value) return;
    mutate(() => { block.columns[index] = value; }, 'Isi kolom diperbarui.');
  } else if (['text','name','label','value'].includes(field) && block[field] !== value) {
    mutate(() => { block[field] = value; }, 'Isi elemen diperbarui.');
  }
});
designPaper.addEventListener('pointerdown', event => {
  const grip = event.target.closest('[data-col-resize]'); if (!grip) return;
  event.preventDefault(); event.stopPropagation();
  const table = grip.closest('table'); const parent = grip.closest('[data-block-id]');
  const block = documentModel.blocks.find(item => item.id === parent?.dataset.blockId && item.type === 'table');
  if (!table || !block || block.headers.length < 2) return;
  const index = Number(grip.dataset.colResize); if (index >= block.headers.length - 1) return;
  const original = columnWidths(block); const startX = event.clientX; const widthPx = Math.max(1, table.getBoundingClientRect().width);
  const pair = original[index] + original[index + 1]; const cols = [...table.querySelectorAll('col')];
  const move = e => { const delta = (e.clientX - startX) / widthPx * 100; const left = Math.max(8, Math.min(pair - 8, original[index] + delta)); cols[index].style.width = left + '%'; cols[index + 1].style.width = (pair - left) + '%'; };
  const finish = e => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', finish); if (Math.abs(e.clientX - startX) < 1) return; const left = Number(parseFloat(cols[index].style.width).toFixed(2)); const widths = [...original]; widths[index] = left; widths[index + 1] = Number((pair-left).toFixed(2)); mutate(() => { block.columnWidths = widths; }, 'Lebar kolom tabel diubah.'); };
  document.addEventListener('pointermove', move); document.addEventListener('pointerup', finish, { once: true });
});
sizeInput.addEventListener('change', () => { const block = selectedBlock(); if (!block || !['text','item','total','table','columns','qrcode','barcode'].includes(block.type)) return; if (!['small','normal','large','double'].includes(sizeInput.value)) return; mutate(() => { block.size = sizeInput.value; }, 'Ukuran teks diperbarui.'); });
boldInput.addEventListener('change', () => { const block = selectedBlock(); if (!block || !['text','item','total','table','columns'].includes(block.type)) return; mutate(() => { block.bold = boldInput.checked; }, 'Format tebal diperbarui.'); });
spacerHeightInput.addEventListener('change', () => { const block = selectedBlock(); if (!block || block.type !== 'spacer') return; const value = Math.max(1, Math.min(20, Math.round(Number(spacerHeightInput.value) || 1))); mutate(() => { block.height = value; }, 'Tinggi spacer diperbarui.'); });
imageWidthInput.addEventListener('change', () => { const block = selectedBlock(); if (!block || block.type !== 'image') return; const value = Math.max(1, Math.min(512, Math.round(Number(imageWidthInput.value) || 1))); mutate(() => { block.width = value; }, 'Lebar gambar diperbarui.'); });
ruleStyleInput.addEventListener('change', () => { const block = selectedBlock(); if (!block || block.type !== 'rule' || !['solid','dashed','double'].includes(ruleStyleInput.value)) return; mutate(() => { block.style = ruleStyleInput.value; }, 'Gaya garis diperbarui.'); });
tableBorderInput.addEventListener('change', () => { const block = selectedBlock(); if (!block || block.type !== 'table' || !['all','horizontal','none'].includes(tableBorderInput.value)) return; mutate(() => { block.border = tableBorderInput.value; }, 'Border tabel diperbarui.'); });

priceInput.addEventListener('change', () => {
  const block = selectedBlock();
  if (!block || block.type !== 'item') return;
  const value = Math.max(0, Math.min(1_000_000_000, Math.round(Number(priceInput.value) || 0)));
  if (block.price === value) return;
  mutate(() => { block.price = value; }, 'Harga item diperbarui.');
});
alignInput.addEventListener('change', () => {
  const block = selectedBlock();
  if (!block || !['text','item','total','table','columns','image','qrcode','barcode'].includes(block.type) || !['left', 'center', 'right'].includes(alignInput.value)) return;
  mutate(() => { block.align = alignInput.value; }, 'Perataan teks diperbarui.');
});
$('add-text-button').addEventListener('click', () => addBlock('text'));
$('add-item-button').addEventListener('click', () => addBlock('item'));
$('add-image-button')?.addEventListener('click', () => $('image-file-input').click());
$('image-file-input')?.addEventListener('change', async event => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    setStatus('Gambar harus PNG/JPEG/WebP/GIF dan maksimal 5 MiB.'); return;
  }
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file);
  }).catch(() => null);
  if (!dataUrl) { setStatus('Gagal membaca file gambar.'); return; }
  const id = 'b-' + crypto.randomUUID();
  mutate(() => { documentModel.blocks.push({ id, type: 'image', dataUrl, alt: file.name.slice(0, 200), width: 180, align: 'center' }); selectedBlockId = id; }, 'Gambar ditambahkan ke dokumen.');
});
for (const [id, type] of [['add-rule-button','rule'], ['add-spacer-button','spacer'], ['add-columns-button','columns'], ['add-qr-button','qrcode'], ['add-barcode-button','barcode']]) { const button = $(id); if (button) button.addEventListener('click', () => addBlock(type)); }
$('add-table-button').addEventListener('click', () => $('table-dialog').showModal());
$('table-dialog-cancel').addEventListener('click', () => $('table-dialog').close());
$('table-dialog-form').addEventListener('submit', event => {
  event.preventDefault(); const cols = Math.max(1, Math.min(6, Number($('table-columns-count').value) || 1)); const rows = Math.max(1, Math.min(50, Number($('table-rows-count').value) || 1));
  const border = $('table-insert-border').value; const id = 'b-' + crypto.randomUUID(); const headers = Array.from({length: cols}, (_, i) => 'Kolom ' + (i+1));
  const widths = Array(cols).fill(Number((100 / cols).toFixed(2))); widths[cols-1] = Number((100-widths.slice(0,-1).reduce((sum,width)=>sum+width,0)).toFixed(2));
  const block = { id, type: 'table', headers, rows: Array.from({length: rows}, () => Array(cols).fill('')), border, columnWidths: widths, align: 'left', size: 'normal', bold: false };
  $('table-dialog').close(); mutate(() => { documentModel.blocks.push(block); selectedBlockId = id; }, 'Tabel ' + rows + ' × ' + cols + ' disisipkan.');
});
$('delete-block-button').addEventListener('click', () => {
  if (!selectedBlock() || documentModel.blocks.length <= 1) return;
  mutate(() => {
    documentModel.blocks = documentModel.blocks.filter(block => block.id !== selectedBlockId);
    selectedBlockId = null;
  }, 'Elemen dihapus.');
});
$('undo-button').addEventListener('click', () => restoreHistory(state.undo, state.redo, 'Perubahan diurungkan.'));
$('redo-button').addEventListener('click', () => restoreHistory(state.redo, state.undo, 'Perubahan diulangi.'));


async function saveCurrent(mode = 'save') {
  const result = await window.trs.saveDocument(cloneDocument(documentModel), mode);
  if (!result?.ok) { setStatus('Gagal menyimpan: ' + (result?.message || result?.error || 'kesalahan tidak diketahui')); return false; }
  if (!result.value) { setStatus('Penyimpanan dibatalkan.'); return false; }
  currentFilePath = result.value.path;
  isDirty = false;
  setStatus('Dokumen tersimpan: ' + currentFilePath);
  return true;
}
function confirmDiscard() { return !isDirty || window.confirm('Perubahan belum disimpan. Buang perubahan?'); }
$('new-document-button').addEventListener('click', () => {
  if (!confirmDiscard()) return;
  documentModel = createSampleDocument(); selectedBlockId = null; currentFilePath = null; isDirty = false;
  state.undo = []; state.redo = []; renderAll(); setStatus('Dokumen baru dibuat.');
});
$('open-document-button').addEventListener('click', async () => {
  if (!confirmDiscard()) return;
  const result = await window.trs.openDocument();
  if (!result?.ok) { setStatus('Gagal membuka file: ' + (result?.message || result?.error || 'file tidak valid')); return; }
  if (!result.value) { setStatus('Buka file dibatalkan.'); return; }
  try {
    validateDocument(result.value.document);
    documentModel = cloneDocument(result.value.document);
    selectedBlockId = null; currentFilePath = result.value.path; isDirty = false;
    state.undo = []; state.redo = []; renderAll(); setStatus('Dokumen dibuka: ' + currentFilePath);
  } catch (err) { setStatus('Dokumen tidak valid: ' + String(err?.message || err)); }
});
$('save-document-button').addEventListener('click', () => saveCurrent('save'));
$('save-as-document-button').addEventListener('click', () => saveCurrent('saveAs'));

async function boot() {
  renderAll();
  try {
    const ver = await window.trs.getVersion();
    if (ver.ok) { const label = 'v' + ver.value; statusVersion.textContent = label; appMeta.textContent = label; }
    const dir = await window.trs.getUserDataDir();
    if (dir.ok) console.info('User data dir:', dir.value);
    setStatus('Dokumen siap · perubahan belum disimpan');
  } catch (err) {
    console.error(err);
    setStatus('Model dokumen siap; metadata aplikasi tidak tersedia.');
  }
}
boot();
