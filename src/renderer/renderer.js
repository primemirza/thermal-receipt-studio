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

let documentModel = createSampleDocument();
let selectedBlockId = null;
let isDirty = false;
let currentFilePath = null;
const state = { zoom: 100, guides: false, undo: [], redo: [] };
const currency = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
// Harga ditampilkan sebagai angka berkelompok; mata uang/prefix tidak dipaksakan oleh editor.
const money = (amount) => currency.format(amount);

function setStatus(message) { statusText.textContent = message; }
function dynamicLabel(field) {
  return ({ date: '[Tanggal saat cetak]', time: '[Waktu saat cetak]', datetime: '[Tanggal & waktu saat cetak]', receiptNumber: '[Nomor struk]' })[field] || '[Placeholder]';
}
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
function renderCanvas() {
  const fragment = document.createDocumentFragment();
  for (const block of documentModel.blocks) {
    const node = make('div', 'design-block' + (block.align === 'center' ? ' center' : '') + (block.id === selectedBlockId ? ' is-selected' : ''));
    node.dataset.blockId = block.id;
    node.tabIndex = 0;
    node.setAttribute('role', 'button');
    node.setAttribute('aria-label', 'Pilih elemen ' + block.type);
    node.append(make('span', 'block-type', block.type.toUpperCase()));
    if (block.type === 'rule') {
      node.append(make('span', 'design-rule'));
    } else if (block.type === 'spacer') {
      node.append(make('span', 'object-placeholder', 'Spacer · ' + block.height + ' baris'));
      node.style.minHeight = (block.height * 8) + 'px';
    } else if (block.type === 'dynamic') {
      node.append(make('span', '', dynamicLabel(block.field)));
    } else if (block.type === 'table') {
      const table = make('div', 'object-table');
      table.append(make('div', 'object-table-row object-table-head', block.headers.join(' │ ')));
      block.rows.forEach(row => table.append(make('div', 'object-table-row', row.join(' │ '))));
      node.append(table);
    } else if (block.type === 'columns') {
      node.append(make('span', 'object-columns', block.columns.join(' │ ')));
    } else if (block.type === 'image') {
      const img = document.createElement('img'); img.src = block.dataUrl; img.alt = block.alt || 'Gambar struk'; img.style.width = block.width + 'px'; img.style.maxWidth = '100%'; node.append(img);
    } else if (block.type === 'qrcode' || block.type === 'barcode') {
      node.append(make('span', 'object-placeholder', block.type.toUpperCase() + ' · ' + block.value));
    } else if (block.type === 'item') {
      node.append(make('span', '', block.name));
      node.append(make('span', 'block-price', money(block.price)));
    } else if (block.type === 'total') {
      node.append(make('strong', '', block.label), make('strong', 'block-price', money(block.amount)));
    } else {
      const text = make(block.bold ? 'strong' : 'span', '', block.text);
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
      fragment.append(makeLine('rule', [make('span', '', (block.character || '-').repeat(columns))]));
    } else if (block.type === 'spacer') {
      const spacer = make('div', 'receipt-spacer'); spacer.style.height = (block.height * 4) + 'px'; fragment.append(spacer);
    } else if (block.type === 'dynamic') {
      fragment.append(makeLine(block.align === 'center' ? 'center' : '', [make('span', '', dynamicLabel(block.field))]));
    } else if (block.type === 'table') {
      fragment.append(makeLine('', [make('span', 'object-table-preview', [block.headers.join(' | '), ...block.rows.map(row => row.join(' | '))].join('\n'))]));
    } else if (block.type === 'columns') {
      fragment.append(makeLine('', [make('span', 'object-columns-preview', block.columns.join(' | '))]));
    } else if (block.type === 'image') {
      const line = makeLine(block.align === 'center' ? 'center' : '', []);
      const img = document.createElement('img'); img.src = block.dataUrl; img.alt = block.alt || 'Gambar struk'; img.style.width = block.width + 'px'; img.style.maxWidth = '100%'; line.append(img); fragment.append(line);
    } else if (block.type === 'qrcode' || block.type === 'barcode') {
      fragment.append(makeLine('center', [make('span', 'object-placeholder', block.type.toUpperCase() + ' · ' + block.value)]));
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
  textInput.disabled = !block || !['text', 'item', 'total', 'dynamic', 'qrcode', 'barcode'].includes(block.type);
  priceInput.disabled = !block || block.type !== 'item';
  alignInput.disabled = !block || !['text'].includes(block.type);
  textInput.value = !block ? '' : block.type === 'item' ? block.name : block.type === 'total' ? block.label : block.type === 'text' ? block.text : ['dynamic', 'qrcode', 'barcode'].includes(block.type) ? (block.field || block.value || '') : '';
  priceInput.value = block?.type === 'item' ? String(block.price) : '';
  alignInput.value = block?.align ?? 'left';
  $('delete-block-button').disabled = !block || documentModel.blocks.length <= 1;
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
function selectBlock(id) {
  selectedBlockId = id;
  renderCanvas();
  renderInspector();
}
function addBlock(type) {
  const id = 'b-' + crypto.randomUUID();
  mutate(() => {
    const templates = {
      item: { id, type: 'item', name: 'Item baru', price: 0 },
      rule: { id, type: 'rule', style: 'solid', character: '-' },
      spacer: { id, type: 'spacer', height: 2 },
      dynamic: { id, type: 'dynamic', field: 'date', align: 'left' },
      table: { id, type: 'table', headers: ['Item', 'Qty', 'Harga'], rows: [['Contoh', '1', '5000']] },
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
  if (block) selectBlock(block.dataset.blockId);
});
designPaper.addEventListener('keydown', event => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const block = event.target.closest('[data-block-id]');
  if (block) { event.preventDefault(); selectBlock(block.dataset.blockId); }
});
textInput.addEventListener('change', () => {
  const block = selectedBlock();
  if (!block || !['text', 'item', 'total', 'qrcode', 'barcode'].includes(block.type)) return;
  const value = textInput.value.slice(0, 200);
  if ((block.type === 'text' ? block.text : block.type === 'item' ? block.name : block.label) === value) return;
  mutate(() => {
    if (block.type === 'text') block.text = value;
    else if (block.type === 'item') block.name = value;
    else if (block.type === 'total') block.label = value;
    else block.value = value;
  }, 'Perubahan teks diterapkan.');
});
priceInput.addEventListener('change', () => {
  const block = selectedBlock();
  if (!block || block.type !== 'item') return;
  const value = Math.max(0, Math.min(1_000_000_000, Math.round(Number(priceInput.value) || 0)));
  if (block.price === value) return;
  mutate(() => { block.price = value; }, 'Harga item diperbarui.');
});
alignInput.addEventListener('change', () => {
  const block = selectedBlock();
  if (!block || block.type !== 'text' || !['left', 'center', 'right'].includes(alignInput.value)) return;
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
for (const [id, type] of [['add-rule-button','rule'], ['add-spacer-button','spacer'], ['add-dynamic-button','dynamic'], ['add-table-button','table'], ['add-columns-button','columns'], ['add-qr-button','qrcode'], ['add-barcode-button','barcode']]) {
  const button = $(id);
  if (button) button.addEventListener('click', () => addBlock(type));
}
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
