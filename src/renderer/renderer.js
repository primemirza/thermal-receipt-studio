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
  validateDocument(documentModel);
  renderAll();
  setStatus(message);
}
function restoreHistory(from, to, message) {
  if (!from.length) return;
  to.push(captureHistoryState());
  const snapshot = from.pop();
  documentModel = cloneDocument(snapshot.document);
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
      fragment.append(makeLine('rule', [make('span', '', '-'.repeat(columns))]));
    } else if (block.type === 'item') {
      fragment.append(makeLine('', [make('span', '', block.name), make('span', 'right', money(block.price))]));
    } else if (block.type === 'total') {
      fragment.append(makeLine('', [make('b', '', block.label), make('b', 'right', money(block.amount))]));
    } else {
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
  textInput.disabled = !block || block.type === 'rule';
  priceInput.disabled = !block || block.type !== 'item';
  alignInput.disabled = !block || !['text'].includes(block.type);
  textInput.value = !block ? '' : block.type === 'item' ? block.name : block.type === 'total' ? block.label : block.type === 'text' ? block.text : '';
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
    const block = type === 'item'
      ? { id, type: 'item', name: 'Item baru', price: 0 }
      : { id, type: 'text', text: 'Teks baru', align: 'left', bold: false };
    documentModel.blocks.push(block);
    selectedBlockId = id;
  }, type === 'item' ? 'Item baru ditambahkan.' : 'Elemen teks ditambahkan.');
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
  if (!block || !['text', 'item', 'total'].includes(block.type)) return;
  const value = textInput.value.slice(0, 200);
  if ((block.type === 'text' ? block.text : block.type === 'item' ? block.name : block.label) === value) return;
  mutate(() => {
    if (block.type === 'text') block.text = value;
    else if (block.type === 'item') block.name = value;
    else block.label = value;
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
$('delete-block-button').addEventListener('click', () => {
  if (!selectedBlock() || documentModel.blocks.length <= 1) return;
  mutate(() => {
    documentModel.blocks = documentModel.blocks.filter(block => block.id !== selectedBlockId);
    selectedBlockId = null;
  }, 'Elemen dihapus.');
});
$('undo-button').addEventListener('click', () => restoreHistory(state.undo, state.redo, 'Perubahan diurungkan.'));
$('redo-button').addEventListener('click', () => restoreHistory(state.redo, state.undo, 'Perubahan diulangi.'));

async function boot() {
  renderAll();
  try {
    const ver = await window.trs.getVersion();
    if (ver.ok) { const label = 'v' + ver.value; statusVersion.textContent = label; appMeta.textContent = label; }
    const dir = await window.trs.getUserDataDir();
    if (dir.ok) console.info('User data dir:', dir.value);
    setStatus('Model dokumen siap · perubahan belum disimpan');
  } catch (err) {
    console.error(err);
    setStatus('Model dokumen siap; metadata aplikasi tidak tersedia.');
  }
}
boot();
