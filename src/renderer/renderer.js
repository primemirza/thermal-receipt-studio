import { createSampleDocument, cloneDocument, validateDocument, migrateLegacyDocument } from './document-model.js';

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
  const active = findBlockEntry(selectedBlockId);
  if (!active) documentModel.blocks.push(block);
  else if (active.block.type === 'section') active.block.children.push(block);
  else active.list.splice(active.index + 1, 0, block);
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
  wrapper.style.marginLeft = align === 'right' ? 'auto' : align === 'center' ? 'auto' : '0';
  wrapper.style.marginRight = align === 'left' ? 'auto' : align === 'center' ? 'auto' : '0';
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
    const rule = make('span', 'design-rule'); rule.classList.add('rule-' + (block.style || 'solid')); rule.textContent = (block.character || '-').repeat(12); node.append(rule);
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
  designPaper.style.padding = '15px 12px 20px';
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
  if (block.type === 'table') {
    wrapper.style.width = '100%';
    line.style.width = '100%';
  } else if (block.type === 'columns') {
    wrapper.style.width = '100%';
  }
  if (block.align === 'right') wrapper.style.textAlign = 'right';
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
  receiptPreview.style.paddingTop = 'calc(12px + ' + margins.top + 'px)';
  receiptPreview.style.paddingRight = 'calc(10px + ' + margins.right + 'px)';
  receiptPreview.style.paddingBottom = 'calc(12px + ' + margins.bottom + 'px)';
  receiptPreview.style.paddingLeft = 'calc(10px + ' + margins.left + 'px)';
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
      table: { id, type: 'table', headers: ['Kolom 1', 'Kolom 2'], rows: [['', '']], border: 'all', columnWidths: [50, 50], align: 'left', size: 'normal', bold: false },
      columns: { id, type: 'columns', columns: ['Kolom 1', 'Kolom 2'] },
      qrcode: { id, type: 'qrcode', value: 'https://example.invalid', width: 96, align: 'center' },
      barcode: { id, type: 'barcode', value: '1234567890', width: 220, align: 'center' },
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
  guideButton.title = state.guides ? 'Sembunyikan panduan' : 'Tampilkan panduan';
  renderPreview();
  renderCanvas();
  setStatus(state.guides ? 'Panduan ukuran ditampilkan.' : 'Panduan ukuran disembunyikan.');
});
let draggedBlockId = null;
designPaper.addEventListener('dragstart', event => {
  const node = event.target.closest('[data-block-id]');
  if (!node || event.target.closest('[data-inline-edit], [data-col-resize]')) { event.preventDefault(); return; }
  draggedBlockId = node.dataset.blockId; node.classList.add('is-dragging');
  if (event.dataTransfer) { event.dataTransfer.setData('text/plain', draggedBlockId); event.dataTransfer.effectAllowed = 'move'; }
});
designPaper.addEventListener('dragover', event => {
  if (!draggedBlockId) return; const target = event.target.closest('[data-block-id]');
  if (target && target.dataset.blockId !== draggedBlockId) { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'; }
});
designPaper.addEventListener('drop', event => {
  if (!draggedBlockId) return; const target = event.target.closest('[data-block-id]'); const sourceId = draggedBlockId; draggedBlockId = null;
  if (!target || target.dataset.blockId === sourceId) return; event.preventDefault();
  const from = documentModel.blocks.findIndex(block => block.id === sourceId); const to = documentModel.blocks.findIndex(block => block.id === target.dataset.blockId); if (from < 0 || to < 0) return;
  const rect = target.getBoundingClientRect(); const after = event.clientY > rect.top + rect.height / 2; let destination = to + (after ? 1 : 0); if (from < destination) destination--; if (destination === from) return;
  mutate(() => { const [block] = documentModel.blocks.splice(from, 1); documentModel.blocks.splice(destination, 0, block); selectedBlockId = sourceId; }, 'Urutan elemen diperbarui.');
});
designPaper.addEventListener('dragend', () => { draggedBlockId = null; designPaper.querySelectorAll('.is-dragging').forEach(node => node.classList.remove('is-dragging')); });
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
italicInput.addEventListener('change', () => { const block = selectedBlock(); if (!block || !['text','item','total','table','columns'].includes(block.type)) return; mutate(() => { block.italic = italicInput.checked; }, 'Format miring diperbarui.'); });
underlineInput.addEventListener('change', () => { const block = selectedBlock(); if (!block || !['text','item','total','table','columns'].includes(block.type)) return; mutate(() => { block.underline = underlineInput.checked; }, 'Garis bawah diperbarui.'); });
spacerHeightInput.addEventListener('change', () => { const block = selectedBlock(); if (!block || block.type !== 'spacer') return; const value = Math.max(1, Math.min(20, Math.round(Number(spacerHeightInput.value) || 1))); mutate(() => { block.height = value; }, 'Tinggi spacer diperbarui.'); });
imageWidthInput.addEventListener('change', () => { const block = selectedBlock(); if (!block || block.type !== 'image') return; const value = Math.max(1, Math.min(512, Math.round(Number(imageWidthInput.value) || 1))); mutate(() => { block.width = value; }, 'Lebar gambar diperbarui.'); });
ruleStyleInput.addEventListener('change', () => { const block = selectedBlock(); if (!block || block.type !== 'rule' || !['solid','dashed','double'].includes(ruleStyleInput.value)) return; mutate(() => { block.style = ruleStyleInput.value; }, 'Gaya garis diperbarui.'); });
tableBorderInput.addEventListener('change', () => { const block = selectedBlock(); if (!block || block.type !== 'table' || !['all','horizontal','none'].includes(tableBorderInput.value)) return; mutate(() => { block.border = tableBorderInput.value; }, 'Border tabel diperbarui.'); });
totalAmountInput.addEventListener('change', () => { const block = selectedBlock(); if (!block || block.type !== 'total') return; const value = Math.max(0, Math.min(1000000000, Math.round(Number(totalAmountInput.value) || 0))); if (block.amount === value) return; mutate(() => { block.amount = value; }, 'Nilai total diperbarui.'); });
ruleCharacterInput.addEventListener('change', () => { const block = selectedBlock(); if (!block || block.type !== 'rule') return; const value = (ruleCharacterInput.value || '-').slice(0, 1); mutate(() => { block.character = value; }, 'Karakter garis diperbarui.'); });
imageAltInput.addEventListener('change', () => { const block = selectedBlock(); if (!block || block.type !== 'image') return; const value = imageAltInput.value.slice(0, 200); if (block.alt === value) return; mutate(() => { block.alt = value; }, 'Deskripsi gambar diperbarui.'); });
$('table-add-row').addEventListener('click', () => { const block = selectedBlock(); if (!block || block.type !== 'table' || block.rows.length >= 100) return; mutate(() => { block.rows.push(Array(block.headers.length).fill('')); }, 'Baris tabel ditambahkan.'); });
$('table-remove-row').addEventListener('click', () => { const block = selectedBlock(); if (!block || block.type !== 'table' || block.rows.length <= 0) return; mutate(() => { block.rows.pop(); }, 'Baris terakhir tabel dihapus.'); });
$('table-add-column').addEventListener('click', () => { const block = selectedBlock(); if (!block || block.type !== 'table' || block.headers.length >= 6) return; mutate(() => { block.headers.push('Kolom ' + (block.headers.length + 1)); block.rows.forEach(row => row.push('')); const count = block.headers.length; block.columnWidths = Array(count).fill(Number((100/count).toFixed(2))); block.columnWidths[count-1] = Number((100-block.columnWidths.slice(0,-1).reduce((sum,width)=>sum+width,0)).toFixed(2)); }, 'Kolom tabel ditambahkan.'); });
$('table-remove-column').addEventListener('click', () => { const block = selectedBlock(); if (!block || block.type !== 'table' || block.headers.length <= 1) return; mutate(() => { const oldWidths = columnWidths(block); block.headers.pop(); block.rows.forEach(row => row.pop()); const widths = oldWidths.slice(0, -1); const widthSum = widths.reduce((sum,v)=>sum+v,0); const normalized = widths.map(width => width / widthSum * 100); block.columnWidths = normalized.map(width => Number(width.toFixed(2))); block.columnWidths[block.columnWidths.length-1] = Number((100-block.columnWidths.slice(0,-1).reduce((sum,width)=>sum+width,0)).toFixed(2)); }, 'Kolom terakhir tabel dihapus.'); });

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
for (const [id, type] of [['add-rule-button','rule'], ['add-spacer-button','spacer'], ['add-qr-button','qrcode'], ['add-barcode-button','barcode']]) { const button = $(id); if (button) button.addEventListener('click', () => addBlock(type)); }
$('add-columns-button').addEventListener('click', () => $('columns-dialog').showModal());
$('columns-dialog-cancel').addEventListener('click', () => $('columns-dialog').close());
$('columns-dialog-form').addEventListener('submit', event => {
  event.preventDefault(); const count = Math.max(2, Math.min(4, Number($('columns-count').value) || 2));
  const id = 'b-' + crypto.randomUUID(); const block = { id, type: 'columns', columns: Array(count).fill('').map((_, i) => 'Kolom ' + (i + 1)), align: 'left', size: 'normal', bold: false };
  $('columns-dialog').close(); mutate(() => { documentModel.blocks.push(block); selectedBlockId = id; }, count + ' kolom teks disisipkan.');
});
$('add-table-button').addEventListener('click', () => $('table-dialog').showModal());
$('table-dialog-cancel').addEventListener('click', () => $('table-dialog').close());
$('table-dialog-form').addEventListener('submit', event => {
  event.preventDefault(); const cols = Math.max(1, Math.min(6, Number($('table-columns-count').value) || 1)); const rows = Math.max(1, Math.min(50, Number($('table-rows-count').value) || 1));
  const border = $('table-insert-border').value; const id = 'b-' + crypto.randomUUID(); const headers = Array.from({length: cols}, (_, i) => 'Kolom ' + (i+1));
  const widths = Array(cols).fill(Number((100 / cols).toFixed(2))); widths[cols-1] = Number((100-widths.slice(0,-1).reduce((sum,width)=>sum+width,0)).toFixed(2));
  const block = { id, type: 'table', headers, rows: Array.from({length: rows - 1}, () => Array(cols).fill('')), border, columnWidths: widths, align: 'left', size: 'normal', bold: false };
  $('table-dialog').close(); mutate(() => { documentModel.blocks.push(block); selectedBlockId = id; }, 'Tabel ' + rows + ' × ' + cols + ' disisipkan.');
});
function deleteSelectedBlock() {
  if (!selectedBlock()) return;
  mutate(() => { documentModel.blocks = documentModel.blocks.filter(block => block.id !== selectedBlockId); selectedBlockId = null; }, 'Elemen dihapus.');
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
