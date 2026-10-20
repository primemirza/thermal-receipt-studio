import { createSampleDocument, cloneDocument, validateDocument, migrateLegacyDocument, insertBlockAtSelection } from './document-model.js';

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
const italicInput = $('block-italic-input');
const underlineInput = $('block-underline-input');
const spacerHeightInput = $('block-spacer-height');
const imageWidthInput = $('block-image-width');
const ruleStyleInput = $('block-rule-style');
const tableBorderInput = $('block-table-border');
const totalAmountInput = $('block-total-amount');
const ruleCharacterInput = $('block-rule-character');
const imageAltInput = $('block-image-alt');
const tableStructureActions = $('table-structure-actions');
const tableLayoutFields = $('table-layout-fields');
const columnsLayoutFields = $('columns-layout-fields');
const sectionLayoutFields = $('section-layout-fields');
const tableWidthInput = $('block-table-width');
const tablePaddingInput = $('block-table-padding');
const columnsWidthInput = $('block-columns-width');
const columnsPaddingInput = $('block-columns-padding');
const columnsGapInput = $('block-columns-gap');
const columnsBorderInput = $('block-columns-border');
const columnWidthsInput = $('block-column-widths');
const sectionNameInput = $('block-section-name');
const sectionMarginInput = $('block-section-margin');
const sectionPaddingInput = $('block-section-padding');
const sectionChildCountInput = $('block-section-child-count');
const globalLayoutDialog = $('global-layout-dialog');
const blockContextMenu = $('block-context-menu');

let documentModel = createSampleDocument();
let selectedBlockId = null;
let isDirty = false;
let currentFilePath = null;
const state = { zoom: 100, guides: false, undo: [], redo: [] };
const currency = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
// Harga ditampilkan sebagai angka berkelompok; mata uang/prefix tidak dipaksakan oleh editor.
const money = (amount) => currency.format(amount);

function setStatus(message) { statusText.textContent = message; }
function findBlockEntry(id, blocks = documentModel.blocks, parentSection = null) {
  if (!id) return null;
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block.id === id) return { block, list: blocks, index, parentSection };
    if (block.type === 'section' && Array.isArray(block.children)) {
      const nested = findBlockEntry(id, block.children, block);
      if (nested) return nested;
    }
  }
  return null;
}
function selectedBlock() { return findBlockEntry(selectedBlockId)?.block ?? null; }
function countAllBlocks(blocks = documentModel.blocks) {
  return blocks.reduce((sum, block) => sum + 1 + (block.type === 'section' ? countAllBlocks(block.children) : 0), 0);
}
function insertNewBlock(block) {
  insertBlockAtSelection(documentModel, selectedBlockId, block);
  selectedBlockId = block.id;
}
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
  const before = captureHistoryState();
  const undoBefore = [...state.undo];
  const redoBefore = [...state.redo];
  saveUndoPoint();
  try {
    mutator();
    validateDocument(documentModel);
  } catch (error) {
    documentModel = cloneDocument(before.document);
    selectedBlockId = before.selectedBlockId;
    state.undo = undoBefore;
    state.redo = redoBefore;
    renderAll();
    setStatus('Perubahan ditolak: ' + String(error?.message || error));
    return false;
  }
  isDirty = true;
  renderAll();
  setStatus(message);
  return true;
}
function restoreHistory(from, to, message) {
  if (!from.length) return;
  to.push(captureHistoryState());
  const snapshot = from.pop();
  documentModel = cloneDocument(snapshot.document);
  isDirty = true;
  selectedBlockId = findBlockEntry(snapshot.selectedBlockId) ? snapshot.selectedBlockId : null;
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
  const values = block.type === 'columns' ? block.columns : block.headers;
  const count = values.length;
  if (Array.isArray(block.columnWidths) && block.columnWidths.length === count) return block.columnWidths;
  const width = Number((100 / count).toFixed(2));
  return Array.from({ length: count }, (_, index) => index === count - 1 ? Number((100 - width * (count - 1)).toFixed(2)) : width);
}
function createEditableText(value, field, extra = {}) {
  const span = make('span', '', value ?? '');
  span.contentEditable = 'true'; span.spellcheck = false; span.dataset.inlineEdit = 'true'; span.dataset.field = field;
  for (const [key, val] of Object.entries(extra)) span.dataset[key] = String(val);
  return span;
}
function styledTable(block, editable = false) {
  const table = make('table', (editable ? 'canvas-table' : 'preview-table') + ' border-' + (block.border || 'all'));
  table.style.setProperty('--cell-padding', (block.padding ?? 4) + 'px');
  table.style.fontSize = ({ small: '9px', normal: '11px', large: '13px', double: '15px' })[block.size || 'normal'];
  if (block.bold) table.style.fontWeight = '700';
  if (block.italic) table.style.fontStyle = 'italic';
  if (block.underline) table.style.textDecoration = 'underline';
  const colgroup = document.createElement('colgroup');
  columnWidths(block).forEach(width => { const col = document.createElement('col'); col.style.width = width + '%'; colgroup.append(col); });
  table.append(colgroup);
  const thead = document.createElement('thead'); const headerRow = document.createElement('tr');
  block.headers.forEach((value, colIndex) => {
    const th = document.createElement('th');
    if (editable) {
      th.append(createEditableText(value, 'tableCell', { rowIndex: -1, colIndex }));
      if (colIndex < block.headers.length - 1) {
        const grip = make('span', 'column-resize-handle'); grip.dataset.colResize = String(colIndex); grip.dataset.colKind = 'table';
        grip.title = 'Tarik untuk mengubah lebar kolom'; grip.setAttribute('aria-label', 'Ubah lebar kolom'); th.append(grip);
      }
    } else th.textContent = value;
    headerRow.append(th);
  });
  thead.append(headerRow); table.append(thead);
  const tbody = document.createElement('tbody');
  block.rows.forEach((row, rowIndex) => {
    const tr = document.createElement('tr');
    row.forEach((value, colIndex) => {
      const td = document.createElement('td');
      if (editable) td.append(createEditableText(value, 'tableCell', { rowIndex, colIndex }));
      else td.textContent = value;
      tr.append(td);
    });
    tbody.append(tr);
  });
  table.append(tbody);
  table.style.textAlign = block.align || 'left';
  return table;
}
function createTableWrapper(block, editable) {
  const wrapper = make('div', editable ? 'table-resize-wrapper' : 'preview-table-wrapper');
  wrapper.style.width = (block.width ?? 100) + '%';
  const align = block.align || 'left';
  const offset = block.offset ?? (align === 'right' ? 100 - (block.width ?? 100) : align === 'center' ? (100 - (block.width ?? 100)) / 2 : 0);
  wrapper.style.marginLeft = offset + '%';
  wrapper.style.marginRight = 'auto';
  if (editable) {
    const left = make('span', 'table-width-handle table-width-handle-left'); left.dataset.tableWidth = 'left'; left.title = 'Tarik untuk mengubah lebar kiri tabel';
    const right = make('span', 'table-width-handle table-width-handle-right'); right.dataset.tableWidth = 'right'; right.title = 'Tarik untuk mengubah lebar kanan tabel';
    wrapper.append(left);
    wrapper.append(styledTable(block, true));
    wrapper.append(right);
  } else wrapper.append(styledTable(block, false));
  return wrapper;
}
function createColumnLayout(block, editable) {
  const container = make('div', editable ? 'object-columns' : 'object-columns-preview');
  container.dataset.columnLayout = block.id;
  container.style.width = (block.width ?? 100) + '%';
  container.style.marginLeft = block.align === 'right' ? 'auto' : block.align === 'center' ? 'auto' : '0';
  container.style.marginRight = block.align === 'left' ? 'auto' : block.align === 'center' ? 'auto' : '0';
  container.style.gap = (block.gap ?? 0) + 'px';
  const widths = columnWidths(block);
  block.columns.forEach((value, index) => {
    const cell = make('div', 'column-cell border-' + (block.border || 'vertical'));
    cell.style.flex = '0 0 ' + widths[index] + '%';
    cell.style.padding = (block.padding ?? 4) + 'px';
    if (editable) {
      cell.append(createEditableText(value, 'columnCell', { colIndex: index }));
      if (index < block.columns.length - 1) {
        const grip = make('span', 'column-resize-handle column-resize-handle-columns'); grip.dataset.colResize = String(index); grip.dataset.colKind = 'columns';
        grip.title = 'Tarik untuk mengubah lebar kolom'; grip.setAttribute('aria-label', 'Ubah lebar kolom teks'); cell.append(grip);
      }
    } else cell.textContent = value;
    container.append(cell);
  });
  return container;
}
function createCodeGraphic(block) {
  if (block.type === 'qrcode') {
    try { const qr = window.qrcode(0, 'M'); qr.addData(block.value, 'Byte'); qr.make(); const img = document.createElement('img'); img.className = 'generated-code generated-qr'; img.alt = 'QR code untuk ' + block.value; img.src = qr.createDataURL(3, 4); img.style.width = (block.width || 96) + 'px'; img.style.height = 'auto'; img.style.maxWidth = '100%'; return img; }
    catch (error) { return make('span', 'object-placeholder', 'QR tidak valid: ' + (error?.message || 'payload terlalu panjang')); }
  }
  if (block.type === 'barcode') {
    try { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); window.JsBarcode(svg, block.value, { format: 'CODE128', lineColor: '#111111', width: 1.4, height: 48, displayValue: true, font: 'monospace', fontSize: 12, margin: 4 }); svg.classList.add('generated-code', 'generated-barcode'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Barcode ' + block.value); svg.style.width = (block.width || 220) + 'px'; svg.style.maxWidth = '100%'; svg.style.height = 'auto'; return svg; }
    catch (error) { return make('span', 'object-placeholder', 'Barcode tidak valid: ' + (error?.message || 'periksa isi barcode')); }
  }
  return make('span', 'object-placeholder', 'Objek kode tidak dikenal');
}
function applyTextStyle(node, block) {
  node.style.textAlign = block.align || 'left';
  if (block.align === 'right') node.style.justifyContent = 'flex-end';
  else if (block.align === 'center') node.style.justifyContent = 'center';
  node.style.fontSize = ({ small: '9px', normal: '11px', large: '14px', double: '17px' })[block.size || 'normal'];
  if (block.bold) node.style.fontWeight = '700';
  if (block.italic) node.style.fontStyle = 'italic';
  if (block.underline) node.style.textDecoration = 'underline';
}
function applyBoxStyle(node, box, kind) {
  const sides = ['top', 'right', 'bottom', 'left'];
  for (const side of sides) node.style[kind + side[0].toUpperCase() + side.slice(1)] = (box?.[side] ?? (kind === 'padding' ? 0 : 0)) + 'px';
}
function renderCanvasBlock(block) {
  const node = make('div', 'design-block' + (block.type === 'section' ? ' section-block' : '') + (block.id === selectedBlockId ? ' is-selected' : ''));
  node.dataset.blockId = block.id;
  node.tabIndex = 0;
  node.setAttribute('role', 'group');
  node.setAttribute('aria-label', 'Elemen ' + (block.type === 'section' ? (block.name || 'section') : block.type));
  applyTextStyle(node, block);
  const drag = make('button', 'block-drag-handle', '⠿');
  drag.type = 'button'; drag.draggable = true; drag.dataset.dragHandle = 'true';
  drag.title = 'Tarik untuk memindahkan elemen'; drag.setAttribute('aria-label', 'Pindahkan elemen');
  node.append(drag);
  if (block.type === 'section') {
    applyBoxStyle(node, block.margin, 'margin');
    applyBoxStyle(node, block.padding, 'padding');
    const header = make('div', 'section-header');
    header.append(make('span', 'block-type', 'SECTION'));
    header.append(createEditableText(block.name || 'Section baru', 'name'));
    const count = make('span', 'section-child-count', String(block.children.length));
    header.append(count); node.append(header);
    const children = make('div', 'section-children'); children.dataset.sectionChildren = block.id;
    if (!block.children.length) children.append(make('div', 'section-empty', 'Section kosong — sisipkan elemen untuk memulai.'));
    else block.children.forEach(child => children.append(renderCanvasBlock(child)));
    node.append(children);
    return node;
  }
  node.append(make('span', 'block-type', block.type.toUpperCase()));
  if (block.type === 'rule') {
    const rule = make('span', 'design-rule'); rule.classList.add('rule-' + (block.style || 'solid')); rule.textContent = (block.character || '-').repeat(documentModel.paperWidthMm === 58 ? 32 : 42); node.append(rule);
  } else if (block.type === 'spacer') {
    node.append(make('span', 'object-placeholder', 'Spacer · ' + block.height + ' baris')); node.style.minHeight = (block.height * 8) + 'px';
  } else if (block.type === 'table') {
    node.append(createTableWrapper(block, true));
  } else if (block.type === 'columns') {
    node.append(createColumnLayout(block, true));
  } else if (block.type === 'image') {
    const img = document.createElement('img'); img.src = block.dataUrl; img.alt = block.alt || 'Gambar struk'; img.style.width = block.width + 'px'; img.style.maxWidth = '100%'; node.append(img);
  } else if (block.type === 'qrcode' || block.type === 'barcode') {
    node.classList.add('code-block'); node.style.flexDirection = 'column';
    node.style.alignItems = block.align === 'right' ? 'flex-end' : block.align === 'center' ? 'center' : 'flex-start';
    node.append(createCodeGraphic(block)); const value = createEditableText(block.value, 'value'); value.className = 'code-value'; node.append(value);
  } else if (block.type === 'item') {
    node.append(createEditableText(block.name, 'name')); node.append(make('span', 'block-price', money(block.price)));
  } else if (block.type === 'total') {
    node.append(createEditableText(block.label, 'label'), make('strong', 'block-price', money(block.amount)));
  } else {
    const text = createEditableText(block.text, 'text'); node.append(text);
  }
  return node;
}
function renderCanvas() {
  const fragment = document.createDocumentFragment();
  documentModel.blocks.forEach(block => fragment.append(renderCanvasBlock(block)));
  designPaper.replaceChildren(fragment);
  const margins = documentModel.layout?.margins || { top: 0, right: 0, bottom: 0, left: 0 };
  const paperWidth = documentModel.paperWidthMm === 58 ? 284 : 364;
  designPaper.style.boxSizing = 'border-box';
  designPaper.style.width = paperWidth + 'px';
  designPaper.style.padding = (15 + margins.top) + 'px ' + (12 + margins.right) + 'px ' + (20 + margins.bottom) + 'px ' + (12 + margins.left) + 'px';
}
function createPreviewLeaf(block, columns) {
  let line;
  if (block.type === 'rule') {
    line = makeLine('rule rule-' + (block.style || 'solid'), [make('span', '', (block.character || '-').repeat(columns))]);
  } else if (block.type === 'spacer') {
    line = make('div', 'receipt-spacer'); line.style.height = (block.height * 4) + 'px';
  } else if (block.type === 'table') {
    line = createTableWrapper(block, false);
  } else if (block.type === 'columns') {
    line = createColumnLayout(block, false);
  } else if (block.type === 'image') {
    line = makeLine(block.align === 'center' ? 'center' : '', []);
    const img = document.createElement('img'); img.src = block.dataUrl; img.alt = block.alt || 'Gambar struk'; img.style.width = block.width + 'px'; img.style.maxWidth = '100%'; line.append(img);
  } else if (block.type === 'qrcode' || block.type === 'barcode') {
    line = makeLine('code-preview-line', [createCodeGraphic(block)]);
  } else if (block.type === 'item') {
    line = makeLine('', [make('span', '', block.name), make('span', 'right', money(block.price))]);
  } else if (block.type === 'total') {
    line = makeLine('', [make(block.bold ? 'b' : 'span', '', block.label), make(block.bold ? 'b' : 'span', 'right', money(block.amount))]);
  } else if (block.type === 'text' || block.type === 'dynamic') {
    const content = make(block.bold ? 'b' : 'span', '', block.type === 'dynamic' ? block.text || ({ date: 'Tanggal: ', time: 'Waktu: ', datetime: 'Tanggal/waktu: ', receiptNumber: 'No. struk: ' })[block.field] || '' : block.text);
    line = makeLine(block.align === 'center' ? 'center' : '', [content]);
  } else return null;
  const wrapper = make('div', 'receipt-block-preview preview-' + block.type);
  applyTextStyle(wrapper, block);
  wrapper.style.fontSize = ({ small: '9px', normal: '12px', large: '15px', double: '18px' })[block.size || 'normal'];
  if (block.type === 'table') {
    wrapper.style.width = '100%';
  } else if (block.type === 'columns') {
    wrapper.style.width = '100%';
  }
  if (block.align === 'right') wrapper.style.textAlign = 'right';
  if (block.type !== 'table' && block.type !== 'columns') {
    line.style.justifyContent = block.align === 'right' ? 'flex-end' : block.align === 'center' ? 'center' : 'flex-start';
    const price = line.querySelector('.right');
    if (price && block.align !== 'left') price.style.marginLeft = '0';
  }
  if (block.type === 'image') {
    line.style.justifyContent = block.align === 'right' ? 'flex-end' : block.align === 'center' ? 'center' : 'flex-start';
  }
  if (block.type === 'qrcode' || block.type === 'barcode') {
    line.style.justifyContent = block.align === 'right' ? 'flex-end' : block.align === 'center' ? 'center' : 'flex-start';
  }
  wrapper.append(line);
  return wrapper;
}
function renderPreviewBlocks(blocks, target, columns) {
  for (const block of blocks) {
    if (block.type === 'section') {
      const section = make('div', 'receipt-section-preview');
      section.dataset.sectionId = block.id;
      applyBoxStyle(section, block.margin, 'margin');
      applyBoxStyle(section, block.padding, 'padding');
      renderPreviewBlocks(block.children, section, columns);
      target.append(section);
    } else {
      const leaf = createPreviewLeaf(block, columns);
      if (leaf) target.append(leaf);
    }
  }
}
function renderPreview() {
  const columns = documentModel.paperWidthMm === 58 ? 32 : 42;
  const fragment = document.createDocumentFragment();
  renderPreviewBlocks(documentModel.blocks, fragment, columns);
  receiptPreview.replaceChildren(fragment);
  const margins = documentModel.layout?.margins || { top: 0, right: 0, bottom: 0, left: 0 };
  const receiptWidth = documentModel.paperWidthMm === 58 ? 288 : 368;
  receiptPreview.style.boxSizing = 'border-box';
  receiptPreview.style.width = receiptWidth + 'px';
  receiptPreview.style.paddingTop = (17 + margins.top) + 'px';
  receiptPreview.style.paddingRight = (14 + margins.right) + 'px';
  receiptPreview.style.paddingBottom = (20 + margins.bottom) + 'px';
  receiptPreview.style.paddingLeft = (14 + margins.left) + 'px';
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
  zoomValue.textContent = state.zoom + '%'; zoomStatus.textContent = 'Zoom ' + state.zoom + '%';
  paperChip.textContent = documentModel.paperWidthMm + ' mm'; canvasWidthLabel.textContent = documentModel.paperWidthMm + ' mm';
  previewDimensions.textContent = documentModel.paperWidthMm + ' mm · ' + columns + ' kolom';
  previewStatus.textContent = 'Preview diperbarui';
}
function renderInspector() {
  const block = selectedBlock();
  selectedLabel.textContent = block ? 'Elemen: ' + block.type : 'Pilih elemen di kanvas';
  textInput.disabled = !block || !['text', 'dynamic', 'item', 'total', 'qrcode', 'barcode'].includes(block.type);
  priceInput.disabled = !block || block.type !== 'item';
  alignInput.disabled = !block || !['text','item','total','table','columns','image','qrcode','barcode'].includes(block.type);
  textInput.value = !block ? '' : block.type === 'item' ? block.name : block.type === 'total' ? block.label : ['text','dynamic'].includes(block.type) ? (block.text || '') : ['qrcode', 'barcode'].includes(block.type) ? (block.value || '') : '';
  priceInput.value = block?.type === 'item' ? String(block.price) : '';
  alignInput.value = block?.align ?? 'left';
  sizeInput.disabled = !block || !['text','item','total','table','columns'].includes(block.type);
  sizeInput.value = block?.size || 'normal';
  boldInput.disabled = !block || !['text','item','total','table','columns'].includes(block.type);
  boldInput.checked = Boolean(block?.bold);
  italicInput.disabled = !block || !['text','item','total','table','columns'].includes(block.type);
  italicInput.checked = Boolean(block?.italic);
  underlineInput.disabled = !block || !['text','item','total','table','columns'].includes(block.type);
  underlineInput.checked = Boolean(block?.underline);
  spacerHeightInput.disabled = !block || block.type !== 'spacer';
  spacerHeightInput.value = block?.type === 'spacer' ? String(block.height) : '';
  imageWidthInput.disabled = !block || !['image','qrcode','barcode'].includes(block.type);
  imageWidthInput.value = block && ['image','qrcode','barcode'].includes(block.type) ? String(block.width || (block.type === 'qrcode' ? 96 : block.type === 'barcode' ? 220 : '')) : '';
  ruleStyleInput.disabled = !block || block.type !== 'rule';
  ruleStyleInput.value = block?.type === 'rule' ? (block.style || 'solid') : 'solid';
  tableBorderInput.disabled = !block || block.type !== 'table';
  tableBorderInput.value = block?.type === 'table' ? (block.border || 'all') : 'all';
  totalAmountInput.disabled = !block || block.type !== 'total';
  totalAmountInput.value = block?.type === 'total' ? String(block.amount) : '';
  ruleCharacterInput.disabled = !block || block.type !== 'rule';
  ruleCharacterInput.value = block?.type === 'rule' ? (block.character || '-') : '-';
  imageAltInput.disabled = !block || block.type !== 'image';
  imageAltInput.value = block?.type === 'image' ? (block.alt || '') : '';
  tableStructureActions.hidden = !block || block.type !== 'table';
  $('table-add-row').disabled = !block || block.type !== 'table' || block.rows.length >= 100;
  $('table-remove-row').disabled = !block || block.type !== 'table' || block.rows.length <= 0;
  $('table-add-column').disabled = !block || block.type !== 'table' || block.headers.length >= 6;
  $('table-remove-column').disabled = !block || block.type !== 'table' || block.headers.length <= 1;
  tableLayoutFields.hidden = !block || block.type !== 'table';
  tableWidthInput.disabled = !block || block.type !== 'table';
  tableWidthInput.value = block?.type === 'table' ? String(block.width ?? 100) : '100';
  tablePaddingInput.disabled = !block || block.type !== 'table';
  tablePaddingInput.value = block?.type === 'table' ? String(block.padding ?? 4) : '4';
  columnsLayoutFields.hidden = !block || block.type !== 'columns';
  columnsWidthInput.disabled = !block || block.type !== 'columns';
  columnsWidthInput.value = block?.type === 'columns' ? String(block.width ?? 100) : '100';
  columnsPaddingInput.disabled = !block || block.type !== 'columns';
  columnsPaddingInput.value = block?.type === 'columns' ? String(block.padding ?? 4) : '4';
  columnsGapInput.disabled = !block || block.type !== 'columns';
  columnsGapInput.value = block?.type === 'columns' ? String(block.gap ?? 0) : '0';
  columnsBorderInput.disabled = !block || block.type !== 'columns';
  columnsBorderInput.value = block?.type === 'columns' ? (block.border || 'vertical') : 'vertical';
  columnWidthsInput.disabled = !block || block.type !== 'columns';
  columnWidthsInput.value = block?.type === 'columns' ? columnWidths(block).join(', ') : '';
  sectionLayoutFields.hidden = !block || block.type !== 'section';
  sectionNameInput.disabled = !block || block.type !== 'section';
  sectionNameInput.value = block?.type === 'section' ? (block.name || 'Section baru') : '';
  sectionMarginInput.disabled = !block || block.type !== 'section';
  sectionMarginInput.value = block?.type === 'section' ? String(block.margin?.top ?? 0) : '0';
  sectionPaddingInput.disabled = !block || block.type !== 'section';
  sectionPaddingInput.value = block?.type === 'section' ? String(block.padding?.top ?? 8) : '8';
  sectionChildCountInput.value = block?.type === 'section' ? String(block.children.length) : '0';
}
function renderAll() {
  renderCanvas();
  renderPreview();
  renderInspector();
  const countLabel = $('element-count'); if (countLabel) countLabel.textContent = countAllBlocks() + ' elemen';
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
      table: { id, type: 'table', headers: ['Kolom 1', 'Kolom 2'], rows: [['', '']], border: 'all', columnWidths: [50, 50], width: 100, padding: 4, align: 'left', size: 'normal', bold: false },
      columns: { id, type: 'columns', columns: ['Kolom 1', 'Kolom 2'], columnWidths: [50, 50], width: 100, padding: 4, gap: 0, border: 'vertical', align: 'left' },
      section: { id, type: 'section', name: 'Section baru', children: [], margin: { top: 0, right: 0, bottom: 0, left: 0 }, padding: { top: 8, right: 8, bottom: 8, left: 8 } },
      qrcode: { id, type: 'qrcode', value: 'https://example.invalid', width: 96, align: 'center' },
      barcode: { id, type: 'barcode', value: '1234567890', width: 220, align: 'center' },
      text: { id, type: 'text', text: 'Teks baru', align: 'left', bold: false, size: 'normal' }
    };
    insertNewBlock(templates[type] || templates.text);
  }, 'Objek ' + type + ' ditambahkan.');
}
paperButtons.forEach(button => button.addEventListener('click', () => setPaper(Number(button.dataset.paper))));
$('zoom-out').addEventListener('click', () => setZoom(state.zoom - 10));
$('zoom-in').addEventListener('click', () => setZoom(state.zoom + 10));
$('zoom-fit').addEventListener('click', () => setZoom(100));
guideButton.addEventListener('click', () => {
  state.guides = !state.guides;
  guideButton.setAttribute('aria-pressed', String(state.guides));
  guideButton.title = state.guides ? 'Sembunyikan panduan' : 'Tampilkan panduan';
  renderPreview();
  renderCanvas();
  setStatus(state.guides ? 'Panduan ukuran ditampilkan.' : 'Panduan ukuran disembunyikan.');
});
let draggedBlockId = null;
designPaper.addEventListener('dragstart', event => {
  const handle = event.target.closest('[data-drag-handle]');
  if (!handle) { event.preventDefault(); return; }
  const node = handle.closest('[data-block-id]');
  if (!node) { event.preventDefault(); return; }
  draggedBlockId = node.dataset.blockId;
  node.classList.add('is-dragging');
  if (event.dataTransfer) { event.dataTransfer.setData('text/plain', draggedBlockId); event.dataTransfer.effectAllowed = 'move'; }
});
designPaper.addEventListener('dragover', event => {
  if (!draggedBlockId) return;
  const target = event.target.closest('[data-block-id]');
  if (target && target.dataset.blockId !== draggedBlockId) { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'; }
});
designPaper.addEventListener('drop', event => {
  if (!draggedBlockId) return;
  const sourceId = draggedBlockId; const targetNode = event.target.closest('[data-block-id]');
  draggedBlockId = null;
  if (!targetNode || targetNode.dataset.blockId === sourceId) return;
  event.preventDefault();
  const initialSource = findBlockEntry(sourceId); const initialTarget = findBlockEntry(targetNode.dataset.blockId);
  if (!initialSource || !initialTarget) return;
  if (initialSource.block.type === 'section' && containsBlockId(initialSource.block.children, initialTarget.block.id)) return;
  const after = event.clientY > targetNode.getBoundingClientRect().top + targetNode.getBoundingClientRect().height / 2;
  mutate(() => {
    const source = findBlockEntry(sourceId); const target = findBlockEntry(targetNode.dataset.blockId);
    if (!source || !target) return;
    const moving = source.block;
    source.list.splice(source.index, 1);
    const refreshedTarget = findBlockEntry(target.block.id);
    if (!refreshedTarget) return;
    if (refreshedTarget.block.type === 'section') refreshedTarget.block.children.push(moving);
    else refreshedTarget.list.splice(refreshedTarget.index + (after ? 1 : 0), 0, moving);
    selectedBlockId = sourceId;
  }, 'Urutan elemen diperbarui.');
});
designPaper.addEventListener('dragend', () => { draggedBlockId = null; designPaper.querySelectorAll('.is-dragging').forEach(node => node.classList.remove('is-dragging')); });
function containsBlockId(blocks, id) {
  return blocks.some(block => block.id === id || (block.type === 'section' && containsBlockId(block.children, id)));
}
designPaper.addEventListener('click', event => {
  const block = event.target.closest('[data-block-id]');
  if (block) selectBlock(block.dataset.blockId, Boolean(event.target.closest('[data-inline-edit], [data-col-resize], [data-table-width], [data-drag-handle]')));
});
designPaper.addEventListener('dblclick', event => {
  const blockNode = event.target.closest('[data-block-id]');
  const editor = event.target.closest('[data-inline-edit]') || blockNode?.querySelector('[data-inline-edit]');
  if (!blockNode || !editor) return;
  event.preventDefault();
  selectBlock(blockNode.dataset.blockId, true);
  editor.focus();
  const selection = window.getSelection();
  if (selection) { const range = document.createRange(); range.selectNodeContents(editor); selection.removeAllRanges(); selection.addRange(range); }
});
designPaper.addEventListener('keydown', event => {
  if (event.target.closest('[data-inline-edit]')) return;
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const block = event.target.closest('[data-block-id]');
  if (block) { event.preventDefault(); selectBlock(block.dataset.blockId); }
});
designPaper.addEventListener('contextmenu', event => {
  const node = event.target.closest('[data-block-id]');
  if (!node) { blockContextMenu.hidden = true; return; }
  event.preventDefault();
  selectBlock(node.dataset.blockId, true);
  blockContextMenu.hidden = false;
  blockContextMenu.style.left = Math.max(8, Math.min(event.clientX, window.innerWidth - 230)) + 'px';
  blockContextMenu.style.top = Math.max(8, Math.min(event.clientY, window.innerHeight - 190)) + 'px';
});
document.addEventListener('pointerdown', event => {
  if (!blockContextMenu.hidden && !event.target.closest('#block-context-menu')) blockContextMenu.hidden = true;
});
blockContextMenu.addEventListener('click', event => {
  const action = event.target.closest('[data-context-action]')?.dataset.contextAction;
  if (!action) return;
  blockContextMenu.hidden = true;
  if (action === 'insert-text') addBlock('text');
  else if (action === 'insert-section') addBlock('section');
  else if (action === 'delete') deleteSelectedBlock();
  else if (action === 'move-up' || action === 'move-down') {
    const entry = findBlockEntry(selectedBlockId);
    if (!entry) return;
    const next = entry.index + (action === 'move-up' ? -1 : 1);
    if (next < 0 || next >= entry.list.length) return;
    mutate(() => { const [item] = entry.list.splice(entry.index, 1); entry.list.splice(next, 0, item); }, 'Urutan elemen diperbarui.');
  }
});
textInput.addEventListener('change', () => {
  const block = selectedBlock();
  if (!block || !['text', 'item', 'total', 'qrcode', 'barcode'].includes(block.type)) return;
  const value = textInput.value.slice(0, block.type === 'qrcode' ? 2000 : 200);
  const key = ['text', 'dynamic'].includes(block.type) ? 'text' : block.type === 'item' ? 'name' : block.type === 'total' ? 'label' : 'value';
  if (block[key] === value) return;
  mutate(() => { block[key] = value; }, 'Isi elemen diperbarui.');
});
function commitInlineChange(block, apply, message, preserveCanvas) {
  const before = captureHistoryState(); const undoBefore = [...state.undo]; const redoBefore = [...state.redo];
  saveUndoPoint();
  try { apply(); validateDocument(documentModel); }
  catch (error) {
    documentModel = cloneDocument(before.document); selectedBlockId = before.selectedBlockId;
    state.undo = undoBefore; state.redo = redoBefore; renderAll();
    setStatus('Edit tidak diterapkan: ' + String(error?.message || error)); return false;
  }
  isDirty = true;
  if (preserveCanvas) { renderPreview(); renderInspector(); updateHistoryButtons(); } else renderAll();
  setStatus(message); return true;
}
designPaper.addEventListener('focusout', event => {
  const cell = event.target.closest('[data-inline-edit]'); if (!cell) return;
  const blockNode = cell.closest('[data-block-id]'); const block = findBlockEntry(blockNode?.dataset.blockId)?.block; if (!block) return;
  const field = cell.dataset.field; const max = field === 'value' && block.type === 'qrcode' ? 2000 : field === 'value' && block.type === 'barcode' ? 128 : 200; const value = cell.textContent.slice(0, max);
  const preserveCanvas = true;
  if (field === 'tableCell' && block.type === 'table') {
    const row = Number(cell.dataset.rowIndex); const col = Number(cell.dataset.colIndex); const oldValue = row < 0 ? block.headers[col] : block.rows[row]?.[col]; if (oldValue === value) return;
    commitInlineChange(block, () => { if (row < 0) block.headers[col] = value; else block.rows[row][col] = value; }, 'Isi sel tabel diperbarui.', preserveCanvas);
  } else if (field === 'columnCell' && block.type === 'columns') {
    const index = Number(cell.dataset.colIndex); if (block.columns[index] === value) return;
    commitInlineChange(block, () => { block.columns[index] = value; }, 'Isi kolom diperbarui.', preserveCanvas);
  } else if (['text','name','label','value'].includes(field) && Object.hasOwn(block, field) && block[field] !== value) {
    const updated = commitInlineChange(block, () => { block[field] = value; }, 'Isi elemen diperbarui.', preserveCanvas);
    if (updated && field === 'value' && ['qrcode','barcode'].includes(block.type)) {
      const holder = cell.closest('[data-block-id]'); const graphic = holder?.querySelector('.generated-code');
      if (graphic) graphic.replaceWith(createCodeGraphic(block));
    }
  }
});
designPaper.addEventListener('pointerdown', event => {
  const widthHandle = event.target.closest('[data-table-width]');
  if (widthHandle) {
    event.preventDefault(); event.stopPropagation();
    const wrapper = widthHandle.closest('.table-resize-wrapper');
    const blockId = widthHandle.closest('[data-block-id]')?.dataset.blockId;
    const block = findBlockEntry(blockId)?.block;
    if (!wrapper || !block || block.type !== 'table') return;
    const startX = event.clientX;
    const paperWidth = Math.max(1, designPaper.getBoundingClientRect().width);
    const originalWidth = block.width ?? 100;
    const align = block.align || 'left';
    const originalOffset = block.offset ?? (align === 'right' ? 100 - originalWidth : align === 'center' ? (100 - originalWidth) / 2 : 0);
    const side = widthHandle.dataset.tableWidth;
    const nextSize = clientX => {
      const delta = (clientX - startX) / paperWidth * 100;
      if (side === 'left') {
        const offset = Math.max(0, Math.min(originalOffset + originalWidth - 20, originalOffset + delta));
        return { width: originalWidth + originalOffset - offset, offset };
      }
      const width = Math.max(20, Math.min(100 - originalOffset, originalWidth + delta));
      return { width, offset: originalOffset };
    };
    const move = moveEvent => {
      const next = nextSize(moveEvent.clientX);
      wrapper.style.width = next.width + '%';
      wrapper.style.marginLeft = next.offset + '%';
      wrapper.style.marginRight = 'auto';
    };
    const finish = upEvent => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', finish);
      if (Math.abs(upEvent.clientX - startX) < 1) return;
      const next = nextSize(upEvent.clientX);
      mutate(() => {
        const current = findBlockEntry(blockId)?.block;
        if (current?.type !== 'table') return;
        current.width = Number(next.width.toFixed(2));
        current.offset = Number(next.offset.toFixed(2));
        current.align = 'left';
      }, 'Lebar dan posisi tepi tabel diperbarui.');
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', finish, { once: true });
    return;
  }
  const grip = event.target.closest('[data-col-resize]');
  if (!grip) return;
  event.preventDefault(); event.stopPropagation();
  const parent = grip.closest('[data-block-id]');
  const blockId = parent?.dataset.blockId;
  const block = findBlockEntry(blockId)?.block;
  const kind = grip.dataset.colKind;
  if (!block || !['table', 'columns'].includes(block.type) || block.type !== kind) return;
  const values = kind === 'table' ? block.headers : block.columns;
  if (values.length < 2) return;
  const index = Number(grip.dataset.colResize);
  if (index < 0 || index >= values.length - 1) return;
  const original = columnWidths(block);
  const container = kind === 'table' ? grip.closest('table') : grip.closest('[data-column-layout]');
  if (!container) return;
  const startX = event.clientX;
  const widthPx = Math.max(1, container.getBoundingClientRect().width);
  const pairWidth = original[index] + original[index + 1];
  const sizingElements = kind === 'table'
    ? [...container.querySelectorAll('col')]
    : [...container.querySelectorAll(':scope > .column-cell')];
  const setWidth = (element, width) => {
    if (kind === 'table') element.style.width = width + '%';
    else element.style.flex = '0 0 ' + width + '%';
  };
  const move = moveEvent => {
    const delta = (moveEvent.clientX - startX) / widthPx * 100;
    const left = Math.max(10, Math.min(pairWidth - 10, original[index] + delta));
    setWidth(sizingElements[index], left);
    setWidth(sizingElements[index + 1], pairWidth - left);
  };
  const finish = upEvent => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', finish);
    if (Math.abs(upEvent.clientX - startX) < 1) return;
    const styleWidth = kind === 'table'
      ? parseFloat(sizingElements[index].style.width)
      : parseFloat(sizingElements[index].style.flexBasis || sizingElements[index].style.flex.split(' ')[1]);
    const left = Number((Number.isFinite(styleWidth) ? styleWidth : original[index]).toFixed(2));
    const next = [...original];
    next[index] = left;
    next[index + 1] = Number((pairWidth - left).toFixed(2));
    mutate(() => { const current = findBlockEntry(blockId)?.block; if (current?.type === kind) current.columnWidths = next; }, kind === 'table' ? 'Lebar kolom tabel diubah.' : 'Lebar kolom teks diubah.');
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', finish, { once: true });
});
sizeInput.addEventListener('change', () => { const block = selectedBlock(); if (!block || !['text','item','total','table','columns','qrcode','barcode'].includes(block.type)) return; if (!['small','normal','large','double'].includes(sizeInput.value)) return; mutate(() => { block.size = sizeInput.value; }, 'Ukuran teks diperbarui.'); });
boldInput.addEventListener('change', () => { const block = selectedBlock(); if (!block || !['text','item','total','table','columns'].includes(block.type)) return; mutate(() => { block.bold = boldInput.checked; }, 'Format tebal diperbarui.'); });
italicInput.addEventListener('change', () => { const block = selectedBlock(); if (!block || !['text','item','total','table','columns'].includes(block.type)) return; mutate(() => { block.italic = italicInput.checked; }, 'Format miring diperbarui.'); });
underlineInput.addEventListener('change', () => { const block = selectedBlock(); if (!block || !['text','item','total','table','columns'].includes(block.type)) return; mutate(() => { block.underline = underlineInput.checked; }, 'Garis bawah diperbarui.'); });
spacerHeightInput.addEventListener('change', () => { const block = selectedBlock(); if (!block || block.type !== 'spacer') return; const value = Math.max(1, Math.min(20, Math.round(Number(spacerHeightInput.value) || 1))); mutate(() => { block.height = value; }, 'Tinggi spacer diperbarui.'); });
imageWidthInput.addEventListener('change', () => { const block = selectedBlock(); if (!block || block.type !== 'image') return; const value = Math.max(1, Math.min(512, Math.round(Number(imageWidthInput.value) || 1))); mutate(() => { block.width = value; }, 'Lebar gambar diperbarui.'); });
ruleStyleInput.addEventListener('change', () => { const block = selectedBlock(); if (!block || block.type !== 'rule' || !['solid','dashed','double'].includes(ruleStyleInput.value)) return; mutate(() => { block.style = ruleStyleInput.value; }, 'Gaya garis diperbarui.'); });
tableBorderInput.addEventListener('change', () => { const block = selectedBlock(); if (!block || block.type !== 'table' || !['all','horizontal','vertical','none'].includes(tableBorderInput.value)) return; mutate(() => { block.border = tableBorderInput.value; }, 'Border tabel diperbarui.'); });
totalAmountInput.addEventListener('change', () => { const block = selectedBlock(); if (!block || block.type !== 'total') return; const value = Math.max(0, Math.min(1000000000, Math.round(Number(totalAmountInput.value) || 0))); if (block.amount === value) return; mutate(() => { block.amount = value; }, 'Nilai total diperbarui.'); });
ruleCharacterInput.addEventListener('change', () => { const block = selectedBlock(); if (!block || block.type !== 'rule') return; const value = (ruleCharacterInput.value || '-').slice(0, 1); mutate(() => { block.character = value; }, 'Karakter garis diperbarui.'); });
imageAltInput.addEventListener('change', () => { const block = selectedBlock(); if (!block || block.type !== 'image') return; const value = imageAltInput.value.slice(0, 200); if (block.alt === value) return; mutate(() => { block.alt = value; }, 'Deskripsi gambar diperbarui.'); });
$('table-add-row').addEventListener('click', () => { const block = selectedBlock(); if (!block || block.type !== 'table' || block.rows.length >= 100) return; mutate(() => { block.rows.push(Array(block.headers.length).fill('')); }, 'Baris tabel ditambahkan.'); });
$('table-remove-row').addEventListener('click', () => { const block = selectedBlock(); if (!block || block.type !== 'table' || block.rows.length <= 0) return; mutate(() => { block.rows.pop(); }, 'Baris terakhir tabel dihapus.'); });
$('table-add-column').addEventListener('click', () => { const block = selectedBlock(); if (!block || block.type !== 'table' || block.headers.length >= 6) return; mutate(() => { block.headers.push('Kolom ' + (block.headers.length + 1)); block.rows.forEach(row => row.push('')); const count = block.headers.length; block.columnWidths = Array(count).fill(Number((100/count).toFixed(2))); block.columnWidths[count-1] = Number((100-block.columnWidths.slice(0,-1).reduce((sum,width)=>sum+width,0)).toFixed(2)); }, 'Kolom tabel ditambahkan.'); });
$('table-remove-column').addEventListener('click', () => { const block = selectedBlock(); if (!block || block.type !== 'table' || block.headers.length <= 1) return; mutate(() => { const oldWidths = columnWidths(block); block.headers.pop(); block.rows.forEach(row => row.pop()); const widths = oldWidths.slice(0, -1); const widthSum = widths.reduce((sum,v)=>sum+v,0); const normalized = widths.map(width => width / widthSum * 100); block.columnWidths = normalized.map(width => Number(width.toFixed(2))); block.columnWidths[block.columnWidths.length-1] = Number((100-block.columnWidths.slice(0,-1).reduce((sum,width)=>sum+width,0)).toFixed(2)); }, 'Kolom terakhir tabel dihapus.'); });

tableWidthInput.addEventListener('change', () => {
  const block = selectedBlock(); if (!block || block.type !== 'table') return;
  const fixedOffset = block.offset ?? 0;
  const value = Math.max(20, Math.min(100 - fixedOffset, Math.round(Number(tableWidthInput.value) || 20)));
  mutate(() => { block.width = value; }, 'Lebar tabel diperbarui.');
});
tablePaddingInput.addEventListener('change', () => {
  const block = selectedBlock(); if (!block || block.type !== 'table') return;
  const value = Math.max(0, Math.min(20, Math.round(Number(tablePaddingInput.value) || 0)));
  mutate(() => { block.padding = value; }, 'Padding sel tabel diperbarui.');
});
columnsWidthInput.addEventListener('change', () => {
  const block = selectedBlock(); if (!block || block.type !== 'columns') return;
  const value = Math.max(20, Math.min(100, Math.round(Number(columnsWidthInput.value) || 20)));
  mutate(() => { block.width = value; }, 'Lebar objek kolom diperbarui.');
});
columnsPaddingInput.addEventListener('change', () => {
  const block = selectedBlock(); if (!block || block.type !== 'columns') return;
  const value = Math.max(0, Math.min(30, Math.round(Number(columnsPaddingInput.value) || 0)));
  mutate(() => { block.padding = value; }, 'Padding kolom diperbarui.');
});
columnsGapInput.addEventListener('change', () => {
  const block = selectedBlock(); if (!block || block.type !== 'columns') return;
  const value = Math.max(0, Math.min(30, Math.round(Number(columnsGapInput.value) || 0)));
  mutate(() => { block.gap = value; }, 'Jarak antar kolom diperbarui.');
});
columnsBorderInput.addEventListener('change', () => {
  const block = selectedBlock(); if (!block || block.type !== 'columns' || !['all','vertical','none'].includes(columnsBorderInput.value)) return;
  mutate(() => { block.border = columnsBorderInput.value; }, 'Border kolom diperbarui.');
});
columnWidthsInput.addEventListener('change', () => {
  const block = selectedBlock(); if (!block || block.type !== 'columns') return;
  const widths = columnWidthsInput.value.split(',').map(value => Number(value.trim()));
  if (widths.length !== block.columns.length || widths.some(value => !Number.isFinite(value))) { setStatus('Masukkan satu angka lebar untuk setiap kolom, dipisah koma.'); renderInspector(); return; }
  mutate(() => { block.columnWidths = widths; }, 'Lebar tiap kolom diperbarui.');
});
sectionNameInput.addEventListener('change', () => {
  const block = selectedBlock(); if (!block || block.type !== 'section') return;
  const value = sectionNameInput.value.trim().slice(0, 200) || 'Section baru';
  if (block.name === value) return;
  mutate(() => { block.name = value; }, 'Nama section diperbarui.');
});
sectionMarginInput.addEventListener('change', () => {
  const block = selectedBlock(); if (!block || block.type !== 'section') return;
  const value = Math.max(0, Math.min(60, Math.round(Number(sectionMarginInput.value) || 0)));
  mutate(() => { block.margin = { top: value, right: value, bottom: value, left: value }; }, 'Margin section diperbarui.');
});
sectionPaddingInput.addEventListener('change', () => {
  const block = selectedBlock(); if (!block || block.type !== 'section') return;
  const value = Math.max(0, Math.min(60, Math.round(Number(sectionPaddingInput.value) || 0)));
  mutate(() => { block.padding = { top: value, right: value, bottom: value, left: value }; }, 'Padding section diperbarui.');
});
$('global-layout-button').addEventListener('click', () => {
  const margins = documentModel.layout?.margins || { top: 0, right: 0, bottom: 0, left: 0 };
  for (const side of ['top','right','bottom','left']) $('global-margin-' + side).value = String(margins[side] ?? 0);
  globalLayoutDialog.showModal();
});
$('global-layout-cancel').addEventListener('click', () => globalLayoutDialog.close());
$('global-layout-form').addEventListener('submit', event => {
  event.preventDefault();
  const margins = {};
  for (const side of ['top','right','bottom','left']) margins[side] = Math.max(0, Math.min(60, Math.round(Number($('global-margin-' + side).value) || 0)));
  mutate(() => { documentModel.layout = documentModel.layout || {}; documentModel.layout.margins = margins; }, 'Margin global diperbarui.');
  globalLayoutDialog.close();
});
$('add-section-button').addEventListener('click', () => addBlock('section'));
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
  mutate(() => { insertNewBlock({ id, type: 'image', dataUrl, alt: file.name.slice(0, 200), width: 180, align: 'center' }); }, 'Gambar ditambahkan ke dokumen.');
});
for (const [id, type] of [['add-rule-button','rule'], ['add-spacer-button','spacer'], ['add-qr-button','qrcode'], ['add-barcode-button','barcode']]) { const button = $(id); if (button) button.addEventListener('click', () => addBlock(type)); }
$('add-columns-button').addEventListener('click', () => $('columns-dialog').showModal());
$('columns-dialog-cancel').addEventListener('click', () => $('columns-dialog').close());
$('columns-dialog-form').addEventListener('submit', event => {
  event.preventDefault(); const count = Math.max(2, Math.min(4, Number($('columns-count').value) || 2));
  const id = 'b-' + crypto.randomUUID();
  const widths = Array(count).fill(Number((100 / count).toFixed(2)));
  widths[count - 1] = Number((100 - widths.slice(0, -1).reduce((sum, width) => sum + width, 0)).toFixed(2));
  const block = { id, type: 'columns', columns: Array(count).fill('').map((_, i) => 'Kolom ' + (i + 1)), columnWidths: widths, width: 100, padding: 4, gap: 0, border: 'vertical', align: 'left', size: 'normal', bold: false };
  $('columns-dialog').close(); mutate(() => insertNewBlock(block), count + ' kolom teks disisipkan.');
});
$('add-table-button').addEventListener('click', () => $('table-dialog').showModal());
$('table-dialog-cancel').addEventListener('click', () => $('table-dialog').close());
$('table-dialog-form').addEventListener('submit', event => {
  event.preventDefault(); const cols = Math.max(1, Math.min(6, Number($('table-columns-count').value) || 1)); const rows = Math.max(1, Math.min(50, Number($('table-rows-count').value) || 1));
  const border = $('table-insert-border').value; const id = 'b-' + crypto.randomUUID(); const headers = Array.from({length: cols}, (_, i) => 'Kolom ' + (i+1));
  const widths = Array(cols).fill(Number((100 / cols).toFixed(2))); widths[cols-1] = Number((100-widths.slice(0,-1).reduce((sum,width)=>sum+width,0)).toFixed(2));
  const block = { id, type: 'table', headers, rows: Array.from({length: rows - 1}, () => Array(cols).fill('')), border, columnWidths: widths, width: 100, padding: 4, align: 'left', size: 'normal', bold: false };
  $('table-dialog').close(); mutate(() => insertNewBlock(block), 'Tabel ' + rows + ' × ' + cols + ' disisipkan.');
});
function deleteSelectedBlock() {
  if (!selectedBlock()) return;
  mutate(() => {
    const entry = findBlockEntry(selectedBlockId);
    if (!entry) return;
    const parentId = entry.parentSection?.id || null;
    entry.list.splice(entry.index, 1);
    selectedBlockId = parentId;
  }, 'Elemen dihapus.');
}
document.addEventListener('keydown', event => {
  if (event.key !== 'Delete' && event.key !== 'Del') return;
  if (event.target.closest('input, textarea, select, [contenteditable="true"], dialog')) return;
  if (!selectedBlock()) return;
  event.preventDefault(); deleteSelectedBlock();
});
document.addEventListener('keydown', event => {
  if (!(event.ctrlKey || event.metaKey)) return;
  const key = event.key.toLowerCase();
  if (key === 's') { event.preventDefault(); document.activeElement?.blur?.(); saveCurrent('save'); }
  else if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  else if (key === 'z') { event.preventDefault(); restoreHistory(state.undo, state.redo, 'Perubahan diurungkan.'); }
  else if (key === 'y') { event.preventDefault(); restoreHistory(state.redo, state.undo, 'Perubahan diulangi.'); }
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
    const openedDocument = migrateLegacyDocument(result.value.document);
    validateDocument(openedDocument);
    documentModel = cloneDocument(openedDocument);
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
