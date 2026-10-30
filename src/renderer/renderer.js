import { createSampleDocument, cloneDocument, validateDocument, migrateLegacyDocument, insertBlockAtSelection } from './document-model.js';
import { createThermalLayout } from '../layout/thermal-layout.js';
import { encodeThermalLayout } from '../encoder/receipt-printer-encoder.js';
import ReceiptPrinterEncoder from './vendor/receipt-printer-encoder.mjs';

const $ = (id) => document.getElementById(id);
const statusText = $('status-text');
const statusVersion = $('status-version');
const appMeta = $('app-meta');
const paperButtons = [...document.querySelectorAll('button[data-paper]')];
const designPaper = $('design-paper');
const receiptPreview = $('receipt-preview');
const previewStage = $('preview-stage');
const zoomValue = $('zoom-value');
const zoomStatus = $('zoom-status');
const paperChip = $('paper-chip');
const thermalPreviewToggle = $('toggle-thermal-layout');
const canvasWidthLabel = $('canvas-width-label');
const previewDimensions = $('preview-dimensions');
const previewStatus = $('preview-status');
const guideButton = $('toggle-guides');
const textInput = $('block-text-input');
const priceInput = $('block-price-input');
const alignmentButtons = [...document.querySelectorAll('[data-text-align]')];
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
const sectionChildCountInput = $('block-section-child-count');
const blockSpacingFields = $('block-spacing-fields');
const spacingSides = ['top', 'right', 'bottom', 'left'];
const marginInputs = Object.fromEntries(spacingSides.map(side => [side, $('block-margin-' + side)]));
const paddingInputs = Object.fromEntries(spacingSides.map(side => [side, $('block-padding-' + side)]));
const globalLayoutDialog = $('global-layout-dialog');
const blockContextMenu = $('block-context-menu');

let documentModel = createSampleDocument();
let selectedBlockId = null;
let activeInlineTarget = null;
let activeInlineEditSession = null;
let isDirty = false;
let currentFilePath = null;
const state = { zoom: 100, guides: false, previewMode: 'visual', undo: [], redo: [] };
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
  scheduleRecoverySnapshot();
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
  span.contentEditable = 'false'; span.spellcheck = false; span.dataset.inlineEdit = 'true'; span.dataset.field = field;
  for (const [key, val] of Object.entries(extra)) span.dataset[key] = String(val);
  return span;
}
function styledTable(block, editable = false) {
  const table = make('table', (editable ? 'canvas-table' : 'preview-table') + ' border-' + (block.border || 'all'));
  table.style.setProperty('--cell-padding', (block.padding ?? 4) + 'px');
  table.style.fontSize = ({ small: '9px', normal: '11px', large: '13px', double: '15px' })[block.size || 'normal'];
  table.style.fontWeight = block.bold === true ? '700' : '400';
  table.style.fontStyle = block.italic === true ? 'italic' : 'normal';
  table.style.textDecoration = block.underline === true ? 'underline' : 'none';
  const colgroup = document.createElement('colgroup');
  columnWidths(block).forEach(width => { const col = document.createElement('col'); col.style.width = width + '%'; colgroup.append(col); });
  table.append(colgroup);
  const thead = document.createElement('thead'); const headerRow = document.createElement('tr');
  block.headers.forEach((value, colIndex) => {
    const th = document.createElement('th');
    th.style.textAlign = tableCellAlignment(block, -1, colIndex);
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
      td.style.textAlign = tableCellAlignment(block, rowIndex, colIndex);
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
  const columnGap = block.gap ?? 0;
  container.style.gap = columnGap + 'px';
  const widths = columnWidths(block);
  const gapShare = columnGap * Math.max(0, block.columns.length - 1) / block.columns.length;
  block.columns.forEach((value, index) => {
    const cell = make('div', 'column-cell border-' + (block.border || 'vertical'));
    cell.style.flex = '0 0 calc(' + widths[index] + '% - ' + gapShare + 'px)';
    cell.style.padding = (block.padding ?? 4) + 'px';
    cell.style.textAlign = columnCellAlignment(block, index);
    cell.style.fontWeight = block.bold === true ? '700' : '400';
    cell.style.fontStyle = block.italic === true ? 'italic' : 'normal';
    cell.style.textDecoration = block.underline === true ? 'underline' : 'none';
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
  const alignment = block.align || 'left';
  node.style.textAlign = alignment;
  node.style.justifyContent = alignment === 'right' ? 'flex-end' : alignment === 'center' ? 'center' : 'flex-start';
  node.style.fontSize = ({ small: '9px', normal: '11px', large: '14px', double: '17px' })[block.size || 'normal'];
  node.style.fontWeight = block.bold === true ? '700' : '400';
  node.style.fontStyle = block.italic === true ? 'italic' : 'normal';
  node.style.textDecoration = block.underline === true ? 'underline' : 'none';
}
function tableCellAlignment(block, rowIndex, colIndex) {
  return block.cellAlignments?.[rowIndex + 1]?.[colIndex] || block.align || 'left';
}
function columnCellAlignment(block, colIndex) {
  return block.columnAlignments?.[colIndex] || block.align || 'left';
}
function alignmentForTarget(block) {
  if (!block) return 'left';
  if (activeInlineTarget?.blockId === block.id && activeInlineTarget.field === 'tableCell' && block.type === 'table') {
    return tableCellAlignment(block, activeInlineTarget.rowIndex, activeInlineTarget.colIndex);
  }
  if (activeInlineTarget?.blockId === block.id && activeInlineTarget.field === 'columnCell' && block.type === 'columns') {
    return columnCellAlignment(block, activeInlineTarget.colIndex);
  }
  return block.align || 'left';
}
function updateAlignmentButtons() {
  const block = selectedBlock();
  const selectedAlignment = alignmentForTarget(block);
  for (const button of alignmentButtons) {
    const active = Boolean(block) && button.dataset.textAlign === selectedAlignment;
    button.setAttribute('aria-pressed', String(active));
    button.classList.toggle('is-active', active);
    button.disabled = !block || !['text','item','total','table','columns','image','qrcode','barcode'].includes(block.type);
  }
}
function applyAlignment(alignment) {
  const block = selectedBlock();
  if (!block || !['left','center','right'].includes(alignment)) return;
  const target = activeInlineTarget?.blockId === block.id ? activeInlineTarget : null;
  mutate(() => {
    if (block.type === 'table' && target?.field === 'tableCell') {
      const rowIndex = target.rowIndex + 1;
      if (!Array.isArray(block.cellAlignments)) {
        block.cellAlignments = Array.from({ length: block.rows.length + 1 }, () => Array(block.headers.length).fill(block.align || 'left'));
      }
      while (block.cellAlignments.length < block.rows.length + 1) {
        block.cellAlignments.push(Array(block.headers.length).fill(block.align || 'left'));
      }
      block.cellAlignments[rowIndex][target.colIndex] = alignment;
    } else if (block.type === 'columns' && target?.field === 'columnCell') {
      if (!Array.isArray(block.columnAlignments)) block.columnAlignments = Array(block.columns.length).fill(block.align || 'left');
      block.columnAlignments[target.colIndex] = alignment;
    } else {
      block.align = alignment;
      if (block.type === 'table') {
        block.cellAlignments = Array.from({ length: block.rows.length + 1 }, () => Array(block.headers.length).fill(alignment));
      } else if (block.type === 'columns') {
        block.columnAlignments = Array(block.columns.length).fill(alignment);
      }
    }
  }, 'Perataan teks diperbarui.');
}
function applyBoxStyle(node, box, kind) {
  if (!box) return;
  for (const side of ['top', 'right', 'bottom', 'left']) {
    node.style[kind + side[0].toUpperCase() + side.slice(1)] = (box[side] ?? 0) + 'px';
  }
}
function createResizableObject(block, content) {
  const wrapper = make('div', 'resizable-object');
  wrapper.style.width = (block.width || (block.type === 'qrcode' ? 96 : block.type === 'barcode' ? 220 : 120)) + 'px';
  wrapper.style.maxWidth = '100%';
  content.style.width = '100%';
  content.style.maxWidth = '100%';
  content.style.height = 'auto';
  wrapper.append(content);
  const handle = make('span', 'object-resize-handle', '↘');
  handle.dataset.objectResize = 'true';
  handle.title = 'Tarik untuk mengubah ukuran objek';
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-label', 'Ubah ukuran objek');
  handle.tabIndex = 0;
  wrapper.append(handle);
  return wrapper;
}
function cloneBlockWithFreshIds(block) {
  const clone = cloneDocument({ schemaVersion: 1, title: 'clone', paperWidthMm: 58, currency: 'IDR', blocks: [block] }).blocks[0];
  const refresh = item => {
    item.id = 'b-' + crypto.randomUUID();
    if (item.type === 'section') item.children.forEach(refresh);
  };
  refresh(clone);
  return clone;
}
function renderCanvasBlock(block) {
  const isSection = block.type === 'section';
  const isRule = block.type === 'rule';
  const node = make('div', 'design-block' + (isSection ? ' section-block' : '') + (isRule ? ' design-block-rule' : '') + (block.id === selectedBlockId ? ' is-selected' : ''));
  node.dataset.blockId = block.id;
  node.tabIndex = 0;
  node.setAttribute('role', 'group');
  node.setAttribute('aria-label', 'Elemen ' + (isSection ? (block.name || 'section') : block.type));
  applyTextStyle(node, block);
  if (block.margin) applyBoxStyle(node, block.margin, 'margin');
  if (isSection && block.padding) applyBoxStyle(node, block.padding, 'padding');
  if (!isSection && block.blockPadding) applyBoxStyle(node, block.blockPadding, 'padding');
  const drag = make('button', 'block-drag-handle', '⠿');
  drag.type = 'button'; drag.draggable = true; drag.dataset.dragHandle = 'true';
  drag.title = 'Tarik untuk memindahkan elemen'; drag.setAttribute('aria-label', 'Pindahkan elemen');
  node.append(drag);
  if (isSection) {
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
    const rule = make('span', 'design-rule');
    rule.classList.add('rule-' + (block.style || 'solid'));
    const character = block.character || '-';
    if (character !== '-') { rule.classList.add('rule-character'); rule.textContent = character.repeat(documentModel.paperWidthMm === 58 ? 32 : 42); }
    node.append(rule);
  } else if (block.type === 'spacer') {
    node.append(make('span', 'object-placeholder', 'Spacer · ' + block.height + ' baris')); node.style.minHeight = (block.height * 8) + 'px';
  } else if (block.type === 'table') {
    node.append(createTableWrapper(block, true));
  } else if (block.type === 'columns') {
    node.append(createColumnLayout(block, true));
  } else if (block.type === 'image') {
    const img = document.createElement('img'); img.src = block.dataUrl; img.alt = block.alt || 'Gambar struk'; node.append(createResizableObject(block, img));
  } else if (block.type === 'qrcode' || block.type === 'barcode') {
    node.classList.add('code-block'); node.style.flexDirection = 'column';
    node.style.alignItems = block.align === 'right' ? 'flex-end' : block.align === 'center' ? 'center' : 'flex-start';
    node.append(createResizableObject(block, createCodeGraphic(block)));
    const value = createEditableText(block.value, 'value'); value.className = 'code-value'; node.append(value);
  } else if (block.type === 'item') {
    node.append(createEditableText(block.name, 'name')); node.append(make('span', 'block-price', money(block.price)));
  } else if (block.type === 'total') {
    node.append(createEditableText(block.label, 'label'), make('strong', 'block-price', money(block.amount)));
  } else {
    node.append(createEditableText(block.text, 'text'));
  }
  return node;
}
function renderCanvas() {
  // Cleanup active inline edit session jika elemen tidak lagi terhubung ke DOM
  if (activeInlineEditSession?.element && !activeInlineEditSession.element.isConnected) {
    activeInlineEditSession = null;
  }
  const fragment = document.createDocumentFragment();
  documentModel.blocks.forEach(block => fragment.append(renderCanvasBlock(block)));
  designPaper.replaceChildren(fragment);
  const margins = documentModel.layout?.margins || { top: 0, right: 0, bottom: 0, left: 0 };
  const paperWidth = documentModel.paperWidthMm === 58 ? 284 : 364;
  designPaper.style.boxSizing = 'border-box';
  designPaper.style.width = paperWidth + 'px';
  designPaper.style.zoom = String(state.zoom / 100);
  designPaper.style.transform = 'none';
  designPaper.style.transformOrigin = '';
  designPaper.style.padding = (15 + margins.top) + 'px ' + (12 + margins.right) + 'px ' + (20 + margins.bottom) + 'px ' + (12 + margins.left) + 'px';
}
function createPreviewLeaf(block, columns) {
  let line;
  if (block.type === 'rule') {
    const character = block.character || '-';
    const lineClass = 'rule rule-' + (block.style || 'solid') + (character !== '-' ? ' rule-character' : '');
    line = makeLine(lineClass, [make('span', '', character !== '-' ? character.repeat(columns) : '')]);
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
  if (block.margin) applyBoxStyle(wrapper, block.margin, 'margin');
  if (block.blockPadding) applyBoxStyle(wrapper, block.blockPadding, 'padding');
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
function renderThermalLayoutPreview(layout, target) {
  for (const operation of layout.operations) {
    if (operation.type === 'cut') continue;
    if (operation.type === 'feed') {
      for (let index = 0; index < Math.max(0, Math.min(20, operation.lines)); index += 1) {
        const blank = make('div', 'thermal-layout-line', ' ');
        blank.setAttribute('aria-hidden', 'true');
        target.append(blank);
      }
      continue;
    }
    if (operation.type === 'image') {
      const line = make('div', 'thermal-layout-line thermal-layout-media');
      const img = document.createElement('img');
      img.src = operation.dataUrl;
      img.alt = operation.alt || 'Gambar struk';
      img.style.width = operation.width + 'px';
      img.style.maxWidth = '100%';
      line.append(img);
      target.append(line);
      continue;
    }
    if (operation.type === 'qrcode' || operation.type === 'barcode') {
      const line = make('div', 'thermal-layout-line thermal-layout-media');
      line.append(createCodeGraphic({ type: operation.type, value: operation.value, width: operation.width }));
      target.append(line);
      continue;
    }
    const text = operation.type === 'rule'
      ? (operation.character || '-').slice(0, 1).repeat(Math.max(1, Math.min(layout.profile.effectiveColumns, operation.width || layout.profile.effectiveColumns)))
      : operation.text;
    const line = make('div', 'thermal-layout-line', text);
    line.style.textAlign = operation.align || 'left';
    line.style.fontWeight = operation.bold ? '700' : '400';
    line.style.fontStyle = operation.italic ? 'italic' : 'normal';
    line.style.textDecoration = operation.underline ? 'underline' : 'none';
    line.style.fontSize = operation.size === 'double' || operation.size === 'large' ? '12px' : operation.size === 'small' ? '9px' : '10px';
    if (operation.type === 'rule' && operation.style === 'double') line.style.fontWeight = '700';
    target.append(line);
  }
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
  const columns = documentModel.paperWidthMm === 58 ? 32 : 48;
  const fragment = document.createDocumentFragment();
  const thermalLayout = state.previewMode === 'thermal' ? createThermalLayout(documentModel) : null;
  if (thermalLayout) renderThermalLayoutPreview(thermalLayout, fragment);
  else renderPreviewBlocks(documentModel.blocks, fragment, columns);
  receiptPreview.replaceChildren(fragment);
  const margins = documentModel.layout?.margins || { top: 0, right: 0, bottom: 0, left: 0 };
  const receiptWidth = documentModel.paperWidthMm === 58 ? 284 : 364;
  receiptPreview.style.boxSizing = 'border-box';
  receiptPreview.style.width = receiptWidth + 'px';
  receiptPreview.style.paddingTop = (17 + margins.top) + 'px';
  receiptPreview.style.paddingRight = (14 + margins.right) + 'px';
  receiptPreview.style.paddingBottom = (20 + margins.bottom) + 'px';
  receiptPreview.style.paddingLeft = (14 + margins.left) + 'px';
  receiptPreview.className = 'receipt-preview zoom-' + state.zoom + (state.previewMode === 'thermal' ? ' thermal-layout-preview' : '');
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
  previewDimensions.textContent = documentModel.paperWidthMm + ' mm · ' + (thermalLayout ? thermalLayout.profile.columns : columns) + ' kolom' + (thermalLayout ? ' · layout thermal' : '');
  previewStatus.textContent = thermalLayout ? 'Simulasi layout thermal diperbarui' : 'Preview diperbarui';
  if (thermalPreviewToggle) {
    const textSpan = thermalPreviewToggle.querySelector('.btn-text');
    const label = state.previewMode === 'thermal' ? 'Preview visual' : 'Simulasi thermal';
    if (textSpan) {
      textSpan.textContent = label;
    } else {
      thermalPreviewToggle.textContent = label;
    }
    thermalPreviewToggle.setAttribute('aria-pressed', String(state.previewMode === 'thermal'));
  }
}
function renderInspector() {
  const block = selectedBlock();
  selectedLabel.textContent = block ? 'Elemen: ' + block.type : 'Pilih elemen di kanvas';
  textInput.disabled = !block || !['text', 'dynamic', 'item', 'total', 'qrcode', 'barcode'].includes(block.type);
  priceInput.disabled = !block || block.type !== 'item';
  textInput.value = !block ? '' : block.type === 'item' ? block.name : block.type === 'total' ? block.label : ['text','dynamic'].includes(block.type) ? (block.text || '') : ['qrcode', 'barcode'].includes(block.type) ? (block.value || '') : '';
  priceInput.value = block?.type === 'item' ? String(block.price) : '';
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
  sectionChildCountInput.value = block?.type === 'section' ? String(block.children.length) : '0';
  blockSpacingFields.hidden = !block;
  const spacingPadding = block?.type === 'section' ? block.padding : block?.blockPadding;
  for (const side of spacingSides) {
    marginInputs[side].disabled = !block;
    marginInputs[side].value = String(block?.margin?.[side] ?? 0);
    paddingInputs[side].disabled = !block;
    paddingInputs[side].value = String(spacingPadding?.[side] ?? (block?.type === 'section' ? 8 : 0));
  }
  updateAlignmentButtons();
}
function renderAll() {
  renderCanvas();
  renderPreview();
  renderInspector();
  const countLabel = $('element-count'); if (countLabel) countLabel.textContent = countAllBlocks() + ' elemen';
  updateHistoryButtons();
}
let recoveryTimer = null;
function scheduleRecoverySnapshot() {
  if (recoveryTimer) clearTimeout(recoveryTimer);
  recoveryTimer = setTimeout(async () => {
    try {
      if (window.trs?.saveRecoverySnapshot && isDirty) {
        await window.trs.saveRecoverySnapshot(cloneDocument(documentModel), currentFilePath);
      }
    } catch {}
  }, 1000);
}

function setPaper(width) {
  if (![58, 80].includes(width)) return;
  mutate(() => { documentModel.paperWidthMm = width; }, 'Lebar kertas diubah ke ' + width + ' mm.');
  window.trs?.setPreference?.('defaultPaperWidth', width).catch(() => {});
}
function setZoom(value) {
  state.zoom = Math.min(150, Math.max(60, value));
  designPaper.style.zoom = String(state.zoom / 100);
  renderPreview();
  zoomValue.textContent = state.zoom + '%';
  zoomStatus.textContent = 'Zoom ' + state.zoom + '%';
  setStatus('Zoom area kerja dan preview ' + state.zoom + '%.');
  window.trs?.setPreference?.('zoom', state.zoom).catch(() => {});
}
function selectBlock(id) {
  selectedBlockId = id;
  // Never replace canvas DOM during a pointer/click sequence. Replacing the target
  // between the two click events prevents Chromium from emitting a usable dblclick
  // and destroys the node that should receive keyboard input.
  designPaper.querySelectorAll('[data-block-id]').forEach(node => node.classList.toggle('is-selected', node.dataset.blockId === id));
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
  window.trs?.setPreference?.('guides', state.guides).catch(() => {});
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
const editorSurface = $('editor-surface');
editorSurface.addEventListener('click', event => {
  if (event.target.closest('[data-block-id]') || event.target.closest('.canvas-ruler')) return;
  if (event.target === editorSurface) {
    selectedBlockId = null;
    renderCanvas();
    renderInspector();
  }
});
function resolveInlineEditor(event) {
  const target = event.target instanceof Element ? event.target : event.target?.parentElement;
  if (!target) return null;
  // Resize/reorder handles are controls, not text-edit targets.
  if (target.closest('[data-col-resize], [data-table-width], [data-drag-handle], [data-object-resize]')) return null;
  const direct = target.closest('[data-inline-edit]');
  if (direct) return direct;

  const cell = target.closest('td, th, .column-cell, .section-header');
  if (cell) return cell.querySelector('[data-inline-edit]');

  // A double-click can land on the block padding/type label rather than on the
  // inner span. Resolve the block's primary editable field instead of failing.
  const blockNode = target.closest('[data-block-id]');
  if (!blockNode) return null;
  const block = findBlockEntry(blockNode.dataset.blockId)?.block;
  if (!block) return null;
  const fieldByType = {
    text: 'text', dynamic: 'text', item: 'name', total: 'label',
    section: 'name', qrcode: 'value', barcode: 'value'
  };
  const field = fieldByType[block.type];
  if (field) return blockNode.querySelector('[data-field="' + field + '"]');
  // For tables/columns, clicking a non-cell part of the block falls back to the
  // first editable cell so the whole block remains operable by double-click.
  if (block.type === 'table' || block.type === 'columns') return blockNode.querySelector('[data-inline-edit]');
  return null;
}
function trackInlineTarget(editor, blockId) {
  if (!editor) { activeInlineTarget = null; return; }
  activeInlineTarget = {
    blockId,
    field: editor.dataset.field,
    rowIndex: Number(editor.dataset.rowIndex ?? -2),
    colIndex: Number(editor.dataset.colIndex ?? -1)
  };
}
function getInlineModelValue(block, cell) {
  const field = cell.dataset.field;
  if (field === 'tableCell' && block.type === 'table') {
    const row = Number(cell.dataset.rowIndex), col = Number(cell.dataset.colIndex);
    return row < 0 ? block.headers[col] : block.rows[row]?.[col];
  }
  if (field === 'columnCell' && block.type === 'columns') return block.columns[Number(cell.dataset.colIndex)];
  return Object.hasOwn(block, field) ? block[field] : undefined;
}
function setInlineModelValue(block, cell, value) {
  const field = cell.dataset.field;
  if (field === 'tableCell' && block.type === 'table') {
    const row = Number(cell.dataset.rowIndex), col = Number(cell.dataset.colIndex);
    if (row < 0) block.headers[col] = value;
    else if (block.rows[row]) block.rows[row][col] = value;
    else return false;
    return true;
  }
  if (field === 'columnCell' && block.type === 'columns') {
    const index = Number(cell.dataset.colIndex);
    if (index < 0 || index >= block.columns.length) return false;
    block.columns[index] = value;
    return true;
  }
  if (['text','name','label','value'].includes(field) && Object.hasOwn(block, field)) {
    block[field] = value;
    return true;
  }
  return false;
}
function inlineValueForCommit(cell, block) {
  const field = cell.dataset.field;
  const max = field === 'value' && block.type === 'qrcode' ? 2000 : field === 'value' && block.type === 'barcode' ? 128 : 200;
  return cell.textContent.slice(0, max);
}
function ensureInlineEditSession(cell, blockId) {
  if (activeInlineEditSession?.element === cell && activeInlineEditSession.blockId === blockId) return activeInlineEditSession;
  const block = findBlockEntry(blockId)?.block;
  if (!block) return null;
  activeInlineEditSession = {
    element: cell,
    blockId,
    originalValue: String(getInlineModelValue(block, cell) ?? ''),
    wasDirty: isDirty,
    undoSaved: false,
    undoBefore: [...state.undo],
    redoBefore: [...state.redo]
  };
  return activeInlineEditSession;
}
designPaper.addEventListener('input', event => {
  const cell = event.target instanceof Element ? event.target.closest('[data-inline-edit][contenteditable="true"]') : null;
  if (!cell) return;
  const blockNode = cell.closest('[data-block-id]');
  const blockId = blockNode?.dataset.blockId;
  const block = findBlockEntry(blockId)?.block;
  if (!block) return;
  const session = ensureInlineEditSession(cell, blockId);
  const value = inlineValueForCommit(cell, block);
  if (String(getInlineModelValue(block, cell) ?? '') === value) return;
  const before = cloneDocument(documentModel);
  if (!session.undoSaved) {
    session.undoBefore = [...state.undo];
    session.redoBefore = [...state.redo];
    saveUndoPoint();
    session.undoSaved = true;
  }
  try {
    if (!setInlineModelValue(block, cell, value)) return;
    validateDocument(documentModel);
  } catch (error) {
    documentModel = before;
    cell.textContent = String(getInlineModelValue(findBlockEntry(blockId)?.block || block, cell) ?? '');
    state.undo = session.undoBefore;
    state.redo = session.redoBefore;
    session.undoSaved = false;
    updateHistoryButtons();
    setStatus('Edit tidak diterapkan: ' + String(error?.message || error));
    return;
  }
  isDirty = true;
  renderPreview();
  updateHistoryButtons();
  setStatus('Isi elemen diperbarui.');
}, true);
function beginInlineEdit(editor, blockId) {
  if (!editor || !blockId || !editor.isConnected) return false;
  trackInlineTarget(editor, blockId);
  ensureInlineEditSession(editor, blockId);
  selectedBlockId = blockId;
  designPaper.querySelectorAll('[data-block-id]').forEach(node => node.classList.toggle('is-selected', node.dataset.blockId === blockId));
  // Set editability before focusing, and leave this exact node mounted until blur.
  editor.setAttribute('contenteditable', 'true');
  editor.setAttribute('role', 'textbox');
  editor.setAttribute('aria-label', 'Edit teks langsung');
  editor.setAttribute('spellcheck', 'false');
  editor.focus();
  const selection = window.getSelection();
  if (selection) {
    const range = document.createRange();
    range.selectNodeContents(editor);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  return document.activeElement === editor;
}
designPaper.addEventListener('click', event => {
  const target = event.target instanceof Element ? event.target : event.target?.parentElement;
  const blockNode = target?.closest('[data-block-id]');
  if (blockNode) {
    const editor = resolveInlineEditor(event);
    trackInlineTarget(editor, blockNode.dataset.blockId);
    // Selection is class-only; never render the canvas from this handler.
    selectBlock(blockNode.dataset.blockId);
    if (event.detail >= 2 && editor) {
      event.preventDefault();
      beginInlineEdit(editor, blockNode.dataset.blockId);
    }
  } else if (target === designPaper || (target?.closest('.section-children') && (target.classList.contains('section-empty') || target.children.length === 0))) {
    activeInlineTarget = null;
    selectedBlockId = null;
    renderCanvas();
    renderInspector();
  }
});
// Capture dblclick on the editor surface before any child/bubble handler can alter
// the event target. This also covers nested section, table and columns content.
$('editor-surface').addEventListener('dblclick', event => {
  const target = event.target instanceof Element ? event.target : event.target?.parentElement;
  const blockNode = target?.closest('[data-block-id]');
  const editor = resolveInlineEditor(event);
  if (!blockNode || !editor) return;
  event.preventDefault();
  event.stopPropagation();
  beginInlineEdit(editor, blockNode.dataset.blockId);
}, true);
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
  activeInlineTarget = null;
  selectBlock(node.dataset.blockId);
  blockContextMenu.hidden = false;
  blockContextMenu.style.left = Math.max(8, Math.min(event.clientX, window.innerWidth - 230)) + 'px';
  blockContextMenu.style.top = Math.max(8, Math.min(event.clientY, window.innerHeight - 245)) + 'px';
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
  else if (action === 'duplicate') duplicateSelectedBlock();
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
function finishInlineEdit(cell) {
  if (!cell) return;
  const blockNode = cell.closest('[data-block-id]');
  const blockId = blockNode?.dataset.blockId;
  const block = findBlockEntry(blockId)?.block;
  const session = activeInlineEditSession?.element === cell ? activeInlineEditSession : null;
  if (block) {
    const value = inlineValueForCommit(cell, block);
    const oldValue = String(getInlineModelValue(block, cell) ?? '');
    // Input events sync normal typing. This is a safeguard for edits applied by
    // assistive technology or scripts that changed text without dispatching input.
    if (oldValue !== value) {
      const before = cloneDocument(documentModel);
      const undoBefore = [...state.undo];
      const redoBefore = [...state.redo];
      if (!session?.undoSaved) saveUndoPoint();
      try {
        if (!setInlineModelValue(block, cell, value)) throw new Error('Field teks tidak dapat disimpan.');
        validateDocument(documentModel);
        isDirty = true;
        renderPreview();
        updateHistoryButtons();
        setStatus('Isi elemen diperbarui.');
      } catch (error) {
        documentModel = before;
        state.undo = session?.undoBefore ?? undoBefore;
        state.redo = session?.redoBefore ?? redoBefore;
        cell.textContent = oldValue;
        updateHistoryButtons();
        setStatus('Edit tidak diterapkan: ' + String(error?.message || error));
      }
    }
    if (['qrcode','barcode'].includes(block.type) && cell.dataset.field === 'value') {
      const graphic = blockNode?.querySelector('.generated-code');
      const wrapper = graphic?.closest('.resizable-object');
      if (wrapper) wrapper.replaceWith(createResizableObject(block, createCodeGraphic(block)));
      else if (graphic) graphic.replaceWith(createCodeGraphic(block));
    }
  }
  cell.setAttribute('contenteditable', 'false');
  cell.removeAttribute('role');
  cell.removeAttribute('aria-label');
  if (activeInlineEditSession?.element === cell) activeInlineEditSession = null;
}
document.addEventListener('pointerdown', event => {
  const cell = activeInlineEditSession?.element;
  if (!cell || !cell.isConnected) {
    activeInlineEditSession = null;
    return;
  }
  const target = event.target instanceof Node ? event.target : event.target?.parentNode;
  if (target && cell.contains(target)) return;
  // A real pointer action inside this app ends editing. Losing OS/window focus
  // emits no such pointer action, so switching to Photos keeps the editor active.
  finishInlineEdit(cell);
}, true);
designPaper.addEventListener('keydown', event => {
  const cell = event.target instanceof Element
    ? event.target.closest('[data-inline-edit][contenteditable="true"]')
    : null;
  if (!cell) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    finishInlineEdit(cell);
    cell.blur();
  }
  // Other keys, including Escape, leave inline mode active. The requested exit
  // conditions are Enter or an actual pointer action outside the edited element.
});

designPaper.addEventListener('pointerdown', event => {
  const objectHandle = event.target.closest('[data-object-resize]');
  if (objectHandle) {
    event.preventDefault(); event.stopPropagation();
    const wrapper = objectHandle.closest('.resizable-object');
    const blockId = objectHandle.closest('[data-block-id]')?.dataset.blockId;
    const block = findBlockEntry(blockId)?.block;
    if (!wrapper || !block || !['image', 'qrcode', 'barcode'].includes(block.type)) return;
    const startWidth = Number(block.width || (block.type === 'qrcode' ? 96 : block.type === 'barcode' ? 220 : 120));
    const startX = event.clientX, startY = event.clientY;
    const minWidth = block.type === 'qrcode' ? 32 : block.type === 'barcode' ? 64 : 1;
    const getWidth = moveEvent => {
      const dx = moveEvent.clientX - startX, dy = moveEvent.clientY - startY;
      const delta = Math.abs(dx) >= Math.abs(dy) ? dx : dy;
      return Math.max(minWidth, Math.min(512, Math.round(startWidth + delta)));
    };
    const move = moveEvent => { wrapper.style.width = getWidth(moveEvent) + 'px'; };
    const finish = upEvent => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', finish);
      document.removeEventListener('pointercancel', cancel);
      if (Math.abs(upEvent.clientX - startX) < 1 && Math.abs(upEvent.clientY - startY) < 1) return;
      const width = getWidth(upEvent);
      mutate(() => {
        const current = findBlockEntry(blockId)?.block;
        if (current && ['image', 'qrcode', 'barcode'].includes(current.type)) current.width = width;
      }, 'Ukuran objek diperbarui.');
    };
    const cancel = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', finish);
      document.removeEventListener('pointercancel', cancel);
      wrapper.style.width = startWidth + 'px';
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', finish, { once: true });
    document.addEventListener('pointercancel', cancel, { once: true });
    return;
  }
  const widthHandle = event.target.closest('[data-table-width]');
  if (widthHandle) {
    event.preventDefault(); event.stopPropagation();
    const wrapper = widthHandle.closest('.table-resize-wrapper');
    const blockId = widthHandle.closest('[data-block-id]')?.dataset.blockId;
    const block = findBlockEntry(blockId)?.block;
    if (!wrapper || !block || block.type !== 'table') return;
    const startX = event.clientX;
    const paperStyle = window.getComputedStyle(designPaper);
    const paperWidth = Math.max(1, designPaper.clientWidth - parseFloat(paperStyle.paddingLeft) - parseFloat(paperStyle.paddingRight));
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
    else { const gapShare = (block.gap ?? 0) * Math.max(0, block.columns.length - 1) / block.columns.length; element.style.flex = '0 0 calc(' + width + '% - ' + gapShare + 'px)'; }
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
    const delta = (upEvent.clientX - startX) / widthPx * 100;
    const left = Number(Math.max(10, Math.min(pairWidth - 10, original[index] + delta)).toFixed(2));
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
imageWidthInput.addEventListener('change', () => { const block = selectedBlock(); if (!block || !['image','qrcode','barcode'].includes(block.type)) return; const min = block.type === 'qrcode' ? 32 : block.type === 'barcode' ? 64 : 1; const value = Math.max(min, Math.min(512, Math.round(Number(imageWidthInput.value) || min))); mutate(() => { block.width = value; }, 'Lebar ' + (block.type === 'image' ? 'gambar' : block.type === 'qrcode' ? 'QR code' : 'barcode') + ' diperbarui.'); });
ruleStyleInput.addEventListener('change', () => { const block = selectedBlock(); if (!block || block.type !== 'rule' || !['solid','dashed','double'].includes(ruleStyleInput.value)) return; mutate(() => { block.style = ruleStyleInput.value; }, 'Gaya garis diperbarui.'); });
tableBorderInput.addEventListener('change', () => { const block = selectedBlock(); if (!block || block.type !== 'table' || !['all','horizontal','vertical','none'].includes(tableBorderInput.value)) return; mutate(() => { block.border = tableBorderInput.value; }, 'Border tabel diperbarui.'); });
totalAmountInput.addEventListener('change', () => { const block = selectedBlock(); if (!block || block.type !== 'total') return; const value = Math.max(0, Math.min(1000000000, Math.round(Number(totalAmountInput.value) || 0))); if (block.amount === value) return; mutate(() => { block.amount = value; }, 'Nilai total diperbarui.'); });
ruleCharacterInput.addEventListener('change', () => { const block = selectedBlock(); if (!block || block.type !== 'rule') return; const value = (ruleCharacterInput.value || '-').slice(0, 1); mutate(() => { block.character = value; }, 'Karakter garis diperbarui.'); });
imageAltInput.addEventListener('change', () => { const block = selectedBlock(); if (!block || block.type !== 'image') return; const value = imageAltInput.value.slice(0, 200); if (block.alt === value) return; mutate(() => { block.alt = value; }, 'Deskripsi gambar diperbarui.'); });
$('table-add-row').addEventListener('click', () => { const block = selectedBlock(); if (!block || block.type !== 'table' || block.rows.length >= 100) return; mutate(() => { block.rows.push(Array(block.headers.length).fill('')); if (Array.isArray(block.cellAlignments)) block.cellAlignments.push(Array(block.headers.length).fill(block.align || 'left')); }, 'Baris tabel ditambahkan.'); });
$('table-remove-row').addEventListener('click', () => { const block = selectedBlock(); if (!block || block.type !== 'table' || block.rows.length <= 0) return; mutate(() => { block.rows.pop(); if (Array.isArray(block.cellAlignments)) block.cellAlignments.pop(); }, 'Baris terakhir tabel dihapus.'); });
$('table-add-column').addEventListener('click', () => { const block = selectedBlock(); if (!block || block.type !== 'table' || block.headers.length >= 6) return; mutate(() => { block.headers.push('Kolom ' + (block.headers.length + 1)); block.rows.forEach(row => row.push('')); if (Array.isArray(block.cellAlignments)) block.cellAlignments.forEach(row => row.push(block.align || 'left')); const count = block.headers.length; block.columnWidths = Array(count).fill(Number((100/count).toFixed(2))); block.columnWidths[count-1] = Number((100-block.columnWidths.slice(0,-1).reduce((sum,width)=>sum+width,0)).toFixed(2)); }, 'Kolom tabel ditambahkan.'); });
$('table-remove-column').addEventListener('click', () => { const block = selectedBlock(); if (!block || block.type !== 'table' || block.headers.length <= 1) return; mutate(() => { const oldWidths = columnWidths(block); block.headers.pop(); block.rows.forEach(row => row.pop()); if (Array.isArray(block.cellAlignments)) block.cellAlignments.forEach(row => row.pop()); const widths = oldWidths.slice(0, -1); const widthSum = widths.reduce((sum,v)=>sum+v,0); const normalized = widths.map(width => width / widthSum * 100); block.columnWidths = normalized.map(width => Number(width.toFixed(2))); block.columnWidths[block.columnWidths.length-1] = Number((100-block.columnWidths.slice(0,-1).reduce((sum,width)=>sum+width,0)).toFixed(2)); }, 'Kolom terakhir tabel dihapus.'); });

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
for (const side of spacingSides) {
  marginInputs[side].addEventListener('change', () => {
    const block = selectedBlock(); if (!block) return;
    const value = Math.max(0, Math.min(60, Math.round(Number(marginInputs[side].value) || 0)));
    mutate(() => {
      block.margin = { top: 0, right: 0, bottom: 0, left: 0, ...(block.margin || {}), [side]: value };
    }, 'Margin ' + side + ' diperbarui.');
  });
  paddingInputs[side].addEventListener('change', () => {
    const block = selectedBlock(); if (!block) return;
    const value = Math.max(0, Math.min(60, Math.round(Number(paddingInputs[side].value) || 0)));
    const key = block.type === 'section' ? 'padding' : 'blockPadding';
    mutate(() => {
      const defaultBox = block.type === 'section'
        ? { top: 8, right: 8, bottom: 8, left: 8 }
        : { top: 0, right: 0, bottom: 0, left: 0 };
      block[key] = { ...defaultBox, ...(block[key] || {}), [side]: value };
    }, 'Padding ' + side + ' diperbarui.');
  });
}
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
alignmentButtons.forEach(button => button.addEventListener('click', () => applyAlignment(button.dataset.textAlign)));
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
function duplicateSelectedBlock() {
  const sourceId = selectedBlockId;
  const entry = findBlockEntry(sourceId);
  if (!entry) return;
  const duplicate = cloneBlockWithFreshIds(entry.block);
  mutate(() => {
    const current = findBlockEntry(sourceId);
    if (!current) return;
    current.list.splice(current.index + 1, 0, duplicate);
    selectedBlockId = duplicate.id;
  }, 'Elemen diduplikasi.');
}
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
  if (event.shiftKey && ['l','e','r'].includes(key)) {
    event.preventDefault();
    applyAlignment(({ l: 'left', e: 'center', r: 'right' })[key]);
    return;
  }
  if (key === 's') { event.preventDefault(); document.activeElement?.blur?.(); saveCurrent('save'); }
  else if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  else if (key === 'z') { event.preventDefault(); restoreHistory(state.undo, state.redo, 'Perubahan diurungkan.'); }
  else if (key === 'y') { event.preventDefault(); restoreHistory(state.redo, state.undo, 'Perubahan diulangi.'); }
});
thermalPreviewToggle?.addEventListener('click', () => {
  state.previewMode = state.previewMode === 'thermal' ? 'visual' : 'thermal';
  renderPreview();
  setStatus(state.previewMode === 'thermal' ? 'Simulasi layout thermal aktif.' : 'Preview visual aktif.');
});
$('undo-button').addEventListener('click', () => restoreHistory(state.undo, state.redo, 'Perubahan diurungkan.'));
$('redo-button').addEventListener('click', () => restoreHistory(state.redo, state.undo, 'Perubahan diulangi.'));


const printerDialog = $('printer-dialog');
const printerMode = $('printer-mode');
const printerDevice = $('printer-device');
const rawPrinterFields = $('raw-printer-fields');
async function refreshPrinterList() {
  printerDevice.replaceChildren();
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Printer default Windows';
  printerDevice.append(placeholder);
  const result = await window.trs.listPrinters();
  if (!result?.ok) {
    placeholder.textContent = 'Daftar printer tidak tersedia';
    setStatus('Deteksi printer gagal: ' + (result?.message || result?.error || 'kesalahan tidak diketahui'));
    return;
  }
  for (const printer of result.value || []) {
    const option = document.createElement('option');
    option.value = printer.name;
    option.textContent = (printer.displayName || printer.name) + (printer.isDefault ? ' (default)' : '');
    printerDevice.append(option);
    if (printer.isDefault) printerDevice.value = printer.name;
  }
}
function updatePrinterMode() {
  const raw = printerMode.value === 'raw';
  rawPrinterFields.hidden = !raw;
  printerDevice.disabled = raw;
}
async function resolvePrinterImage(dataUrl) {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas gambar tidak tersedia untuk encoder.');
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}
$('printer-button').addEventListener('click', async () => {
  // Langsung cetak menggunakan printer yang tersimpan di profil tanpa dialog
  const button = $('printer-button');
  button.disabled = true;
  try {
    // Muat profil printer tersimpan
    const profileResult = await window.trs.getPrinterProfile();
    if (!profileResult?.ok || !profileResult.value) {
      setStatus('Belum ada printer yang disimpan. Silakan atur printer melalui menu.');
      printerDialog.showModal();
      await refreshPrinterList();
      loadRecentFilesPanel();
      return;
    }
    
    const profile = profileResult.value;
    if (profile.mode === 'driver' && profile.driverName) {
      // Cetak langsung dengan driver Windows menggunakan printer tersimpan
      const layout = createThermalLayout(documentModel, { feedBeforeCut: 3, cut: true });
      const layoutPlain = JSON.parse(JSON.stringify(layout));
      
      // Lengkapi grafik QR code dan Barcode
      for (const op of layoutPlain.operations) {
        if (op.type === 'qrcode' && !op.dataUrl && typeof window.qrcode === 'function') {
          try {
            const qr = window.qrcode(0, 'M');
            qr.addData(op.value, 'Byte');
            qr.make();
            op.dataUrl = qr.createDataURL(3, 4);
          } catch {}
        } else if (op.type === 'barcode' && !op.svg && typeof window.JsBarcode === 'function') {
          try {
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            window.JsBarcode(svg, op.value, {
              format: 'CODE128',
              lineColor: '#000000',
              width: 1.4,
              height: 48,
              displayValue: true,
              font: 'monospace',
              fontSize: 12,
              margin: 4
            });
            op.svg = svg.outerHTML;
          } catch {}
        }
      }
      
      const resolveImage = async (dataUrl, operation) => {
        if (!dataUrl) return null;
        const img = new Image();
        img.src = dataUrl;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, canvas.width, canvas.height);
      };
      
      const escposBytes = await encodeThermalLayout(layoutPlain, ReceiptPrinterEncoder, {
        language: 'esc-pos',
        columns: layoutPlain.profile.columns,
        feedBeforeCut: 0,
        resolveImage
      });
      
      const result = await window.trs.printViaDriver(Array.from(escposBytes), documentModel.paperWidthMm, profile.driverName);
      if (!result?.ok) throw new Error(result?.message || result?.error || 'Driver printer gagal.');
      
      setStatus('Job dikirim ke driver Windows (RAW API): ' + profile.driverName + '.');
    } else if (profile.mode === 'raw' && profile.rawHost && profile.rawPort) {
      // Cetak langsung dengan raw TCP
      if (!$('raw-escpos-confirm').checked) {
        setStatus('Konfirmasi dukungan ESC/POS diperlukan untuk raw TCP.');
        printerDialog.showModal();
        await refreshPrinterList();
        loadRecentFilesPanel();
        return;
      }
      
      const layout = createThermalLayout(documentModel, { feedBeforeCut: 3, cut: true });
      const layoutPlain = JSON.parse(JSON.stringify(layout));
      
      for (const op of layoutPlain.operations) {
        if (op.type === 'qrcode' && !op.dataUrl && typeof window.qrcode === 'function') {
          try {
            const qr = window.qrcode(0, 'M');
            qr.addData(op.value, 'Byte');
            qr.make();
            op.dataUrl = qr.createDataURL(3, 4);
          } catch {}
        } else if (op.type === 'barcode' && !op.svg && typeof window.JsBarcode === 'function') {
          try {
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            window.JsBarcode(svg, op.value, {
              format: 'CODE128',
              lineColor: '#000000',
              width: 1.4,
              height: 48,
              displayValue: true,
              font: 'monospace',
              fontSize: 12,
              margin: 4
            });
            op.svg = svg.outerHTML;
          } catch {}
        }
      }
      
      const resolveImage = async (dataUrl, operation) => {
        if (!dataUrl) return null;
        const img = new Image();
        img.src = dataUrl;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, canvas.width, canvas.height);
      };
      
      const escposBytes = await encodeThermalLayout(layoutPlain, ReceiptPrinterEncoder, {
        language: 'esc-pos',
        columns: layoutPlain.profile.columns,
        feedBeforeCut: 0,
        resolveImage
      });
      
      const result = await window.trs.printRaw(Array.from(escposBytes), profile.rawHost, Number(profile.rawPort));
      if (!result?.ok) throw new Error(result?.message || result?.error || 'Raw print gagal.');
      
      setStatus('Job dikirim ke printer TCP: ' + profile.rawHost + ':' + profile.rawPort + '.');
    } else {
      setStatus('Profil printer tidak lengkap. Silakan atur printer melalui menu.');
      printerDialog.showModal();
      await refreshPrinterList();
      loadRecentFilesPanel();
    }
  } catch (err) {
    setStatus('Cetak gagal: ' + String(err?.message || err));
  } finally {
    button.disabled = false;
  }
});
$('printer-settings-button').addEventListener('click', async () => {
  updatePrinterMode();
  printerDialog.showModal();
  await refreshPrinterList();
  loadRecentFilesPanel();
});
$('toolbar-printer-select').addEventListener('change', async () => {
  const select = $('toolbar-printer-select');
  const printerName = select.value;
  if (!printerName) return;
  
  // Simpan printer yang dipilih ke profil
  try {
    await window.trs.savePrinterProfile({ id: 'default', mode: 'driver', driverName: printerName });
    setStatus('Printer disimpan: ' + printerName);
  } catch (err) {
    setStatus('Gagal menyimpan printer: ' + String(err?.message || err));
  }
});
$('printer-dialog-cancel').addEventListener('click', () => printerDialog.close());
printerMode.addEventListener('change', updatePrinterMode);

// --- Recent Files Panel ---
async function loadRecentFilesPanel() {
  const section = $('recent-files-section');
  const list = $('recent-files-list');
  if (!section || !list) return;
  try {
    const result = await window.trs.getRecentFiles();
    if (!result?.ok || !result.value?.length) { section.hidden = true; return; }
    list.replaceChildren();
    for (const file of result.value) {
      const li = document.createElement('li');
      li.className = 'recent-file-item';
      const name = String(file.path).split(/[\\/]/).pop().replace(/\.trstudio$/i, '');
      const date = file.lastOpenedAt ? new Date(file.lastOpenedAt).toLocaleString('id-ID') : '';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'recent-file-btn';
      btn.innerHTML = '<svg aria-hidden="true" class="btn-icon" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>' +
        '<div class="recent-file-info"><span class="recent-file-name">' + name.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</span>' +
        '<span class="recent-file-meta">' + file.paperWidth + ' mm · ' + date + '</span></div>';
      btn.title = file.path;
      btn.addEventListener('click', () => {
        printerDialog.close();
        openRecentFile(file.path);
      });
      li.append(btn);
      list.append(li);
    }
    section.hidden = false;
  } catch { section.hidden = true; }
}
async function openRecentFile(filePath) {
  if (!confirmDiscard()) return;
  try {
    const result = await window.trs.openDocument();
    if (!result?.ok || !result.value) { setStatus('Gagal membuka file terkini.'); return; }
    const openedDocument = migrateLegacyDocument(result.value.document);
    validateDocument(openedDocument);
    documentModel = cloneDocument(openedDocument);
    selectedBlockId = null; currentFilePath = result.value.path; updateWindowTitle(); isDirty = false;
    state.undo = []; state.redo = []; renderAll(); setStatus('Dokumen dibuka: ' + currentFilePath);
  } catch (err) { setStatus('Dokumen tidak valid: ' + String(err?.message || err)); }
}
$('printer-print-button').addEventListener('click', async () => {
  const button = $('printer-print-button');
  button.disabled = true;
  try {
    if (printerMode.value === 'driver') {
      // Gunakan thermal layout yang sama dengan jalur raw TCP/ESC-POS agar output identik.
      // Encode layout ke ESC/POS bytes di renderer, lalu kirim raw bytes ke main process
      // untuk dikirim via Windows API RAW (bukan webContents.print) untuk kompatibilitas
      // dengan driver thermal seperti XPrinter/EPPOS yang tidak merender HTML dengan benar.
      const layout = createThermalLayout(documentModel, { feedBeforeCut: 3, cut: true });
      // IPC hanya mendukung nilai yang dapat di-serialize (JSON); konversi ke plain object.
      const layoutPlain = JSON.parse(JSON.stringify(layout));
      // Lengkapi grafik QR code dan Barcode di sisi renderer sebelum dikirim ke main process
      for (const op of layoutPlain.operations) {
        if (op.type === 'qrcode' && !op.dataUrl && typeof window.qrcode === 'function') {
          try {
            const qr = window.qrcode(0, 'M');
            qr.addData(op.value, 'Byte');
            qr.make();
            op.dataUrl = qr.createDataURL(3, 4);
          } catch {}
        } else if (op.type === 'barcode' && !op.svg && typeof window.JsBarcode === 'function') {
          try {
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            window.JsBarcode(svg, op.value, {
              format: 'CODE128',
              lineColor: '#000000',
              width: 1.4,
              height: 48,
              displayValue: true,
              font: 'monospace',
              fontSize: 12,
              margin: 4
            });
            op.svg = svg.outerHTML;
          } catch {}
        }
      }
      // Encode layout ke ESC/POS bytes di renderer
      const resolveImage = async (dataUrl, operation) => {
        if (!dataUrl) return null;
        const img = new Image();
        img.src = dataUrl;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, canvas.width, canvas.height);
      };
      const escposBytes = await encodeThermalLayout(layoutPlain, ReceiptPrinterEncoder, {
        language: 'esc-pos',
        columns: layoutPlain.profile.columns,
        feedBeforeCut: 0,
        resolveImage
      });
      const result = await window.trs.printViaDriver(Array.from(escposBytes), documentModel.paperWidthMm, printerDevice.value);
      if (!result?.ok) throw new Error(result?.message || result?.error || 'Driver printer gagal.');
      // Simpan profil printer yang berhasil digunakan
      window.trs.savePrinterProfile({ id: 'default', mode: 'driver', driverName: printerDevice.value }).catch(() => {});
      setStatus('Job dikirim ke driver Windows (RAW API): ' + (printerDevice.value || 'printer default') + '.');

    } else {
      if (!$('raw-escpos-confirm').checked) throw new Error('Konfirmasi dukungan ESC/POS diperlukan sebelum mengirim data raw.');
      const host = $('raw-printer-host').value.trim();
      const port = Number($('raw-printer-port').value);
      const layout = createThermalLayout(documentModel, { feedBeforeCut: 1, cut: true });
      const bytes = await encodeThermalLayout(layout, ReceiptPrinterEncoder, { resolveImage: resolvePrinterImage });
      const result = await window.trs.printRawTcp(bytes, host, port);
      if (!result?.ok) throw new Error(result?.message || result?.error || 'Pengiriman ESC/POS gagal.');
      // Simpan profil printer TCP yang berhasil digunakan
      window.trs.savePrinterProfile({ id: 'default', mode: 'raw', rawHost: host, rawPort: port }).catch(() => {});
      setStatus('Job ESC/POS dikirim: ' + result.value.bytesSent + ' byte ke ' + host + ':' + port + '.');
    }
    printerDialog.close();
  } catch (error) {
    setStatus('Cetak gagal: ' + String(error?.message || error));
  } finally {
    button.disabled = false;
  }
});
$('printer-reprint-button').addEventListener('click', async () => {
  const button = $('printer-reprint-button');
  button.disabled = true;
  try {
    const result = await window.trs.reprintLastJob();
    if (!result?.ok) throw new Error(result?.message || result?.error || 'Cetak ulang gagal.');
    setStatus('Job cetak terakhir dikirim ulang.');
    printerDialog.close();
  } catch (error) {
    setStatus('Cetak ulang gagal: ' + String(error?.message || error));
  } finally {
    button.disabled = false;
  }
});


async function saveCurrent(mode = 'save') {
  const result = await window.trs.saveDocument(cloneDocument(documentModel), mode);
  if (!result?.ok) { setStatus('Gagal menyimpan: ' + (result?.message || result?.error || 'kesalahan tidak diketahui')); return false; }
  if (!result.value) { setStatus('Penyimpanan dibatalkan.'); return false; }
  currentFilePath = result.value.path;
  updateWindowTitle();
  isDirty = false;
  setStatus('Dokumen tersimpan: ' + currentFilePath);
  // Hapus recovery snapshot karena dokumen sudah tersimpan
  window.trs.clearRecoverySnapshot().catch(() => {});
  return true;
}
function updateWindowTitle() {
  const savedName = currentFilePath ? String(currentFilePath).split(/[\\/]/).pop() : '';
  const fileName = savedName.replace(/\.trstudio$/i, '');
  document.title = fileName ? 'Thermal Receipt Studio - ' + fileName : 'Thermal Receipt Studio';
  window.trs.setWindowTitle(document.title).catch(() => {});
}
function confirmDiscard() { return !isDirty || window.confirm('Perubahan belum disimpan. Buang perubahan?'); }
$('new-document-button').addEventListener('click', () => {
  if (!confirmDiscard()) return;
  documentModel = createSampleDocument(); selectedBlockId = null; currentFilePath = null; updateWindowTitle(); isDirty = false;
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
    selectedBlockId = null; currentFilePath = result.value.path; updateWindowTitle(); isDirty = false;
    state.undo = []; state.redo = []; renderAll(); setStatus('Dokumen dibuka: ' + currentFilePath);
  } catch (err) { setStatus('Dokumen tidak valid: ' + String(err?.message || err)); }
});
$('save-document-button').addEventListener('click', () => saveCurrent('save'));
$('save-as-document-button').addEventListener('click', () => saveCurrent('saveAs'));

async function boot() {
  updateWindowTitle();
  renderAll();
  try {
    const ver = await window.trs.getVersion();
    if (ver.ok) { const label = 'v' + ver.value; statusVersion.textContent = label; appMeta.textContent = label; }
    const dir = await window.trs.getUserDataDir();
    if (dir.ok) console.info('User data dir:', dir.value);

    // --- Fase 8: Muat preferensi dari database ---
    try {
      const prefsResult = await window.trs.getPreferences();
      if (prefsResult?.ok && prefsResult.value) {
        const prefs = prefsResult.value;
        // Pulihkan zoom terakhir
        if (typeof prefs.zoom === 'number' && prefs.zoom >= 60 && prefs.zoom <= 150) {
          state.zoom = prefs.zoom;
          designPaper.style.zoom = String(state.zoom / 100);
          zoomValue.textContent = state.zoom + '%';
          zoomStatus.textContent = 'Zoom ' + state.zoom + '%';
        }
        // Pulihkan status panduan
        if (typeof prefs.guides === 'boolean' && prefs.guides) {
          state.guides = true;
          guideButton.setAttribute('aria-pressed', 'true');
          guideButton.title = 'Sembunyikan panduan';
        }
        // Pulihkan lebar kertas default jika dokumen baru (sample)
        if ((prefs.defaultPaperWidth === 80 || prefs.defaultPaperWidth === 58) &&
            documentModel.paperWidthMm !== prefs.defaultPaperWidth) {
          documentModel.paperWidthMm = prefs.defaultPaperWidth;
          paperButtons.forEach(b => {
            const active = Number(b.dataset.paper) === prefs.defaultPaperWidth;
            b.classList.toggle('is-active', active);
            b.setAttribute('aria-pressed', String(active));
          });
        }
        renderAll();
      }
    } catch (e) { console.warn('Gagal memuat preferensi:', e); }

    // --- Fase 8: Muat profil printer ---
    try {
      const profileResult = await window.trs.getPrinterProfile();
      if (profileResult?.ok && profileResult.value) {
        const profile = profileResult.value;
        if (profile.mode === 'raw' || profile.mode === 'driver') {
          printerMode.value = profile.mode;
          updatePrinterMode();
        }
        if (profile.mode === 'raw') {
          if (profile.rawHost) $('raw-printer-host').value = profile.rawHost;
          if (profile.rawPort) $('raw-printer-port').value = String(profile.rawPort);
        }
        // Pulihkan nama printer Windows yang terakhir dipilih ke dropdown toolbar
        if (profile.mode === 'driver' && profile.driverName) {
          const toolbarSelect = $('toolbar-printer-select');
          if (toolbarSelect) {
            // Load daftar printer dulu
            const listResult = await window.trs.printersList();
            if (listResult?.ok && listResult.value) {
              toolbarSelect.innerHTML = '<option value="">Pilih printer...</option>';
              for (const printer of listResult.value) {
                const option = document.createElement('option');
                option.value = printer.name;
                option.textContent = printer.displayName || printer.name;
                toolbarSelect.appendChild(option);
              }
              toolbarSelect.value = profile.driverName;
            }
          }
        }
      }
    } catch (e) { console.warn('Gagal memuat profil printer:', e); }
    
    // Load daftar printer ke dropdown toolbar (jika belum ada dari profil)
    const toolbarSelect = $('toolbar-printer-select');
    if (toolbarSelect && toolbarSelect.options.length <= 1) {
      try {
        const listResult = await window.trs.printersList();
        if (listResult?.ok && listResult.value) {
          toolbarSelect.innerHTML = '<option value="">Pilih printer...</option>';
          for (const printer of listResult.value) {
            const option = document.createElement('option');
            option.value = printer.name;
            option.textContent = printer.displayName || printer.name;
            toolbarSelect.appendChild(option);
          }
        }
      } catch (e) { console.warn('Gagal memuat daftar printer:', e); }
    }

    // --- Fase 8: Periksa recovery snapshot ---
    try {
      const snapResult = await window.trs.getRecoverySnapshot();
      if (snapResult?.ok && snapResult.value) {
        const snap = snapResult.value;
        const recoveryDialog = $('recovery-dialog');
        const recoveryMeta = $('recovery-meta');
        if (recoveryDialog) {
          if (recoveryMeta) {
            const date = snap.updatedAt ? new Date(snap.updatedAt).toLocaleString('id-ID') : 'tidak diketahui';
            const filePart = snap.filePath ? ' (file: ' + String(snap.filePath).split(/[\\/]/).pop() + ')' : ' (dokumen baru)';
            recoveryMeta.textContent = 'Terakhir disimpan otomatis: ' + date + filePart;
          }
          recoveryDialog.showModal();
          // Tombol pulihkan
          $('recovery-restore').onclick = () => {
            try {
              validateDocument(snap.document);
              documentModel = cloneDocument(snap.document);
              currentFilePath = snap.filePath || null;
              isDirty = true;
              state.undo = []; state.redo = [];
              renderAll();
              updateWindowTitle();
              setStatus('Dokumen dipulihkan dari autosave terakhir.');
            } catch (err) {
              setStatus('Pemulihan gagal: ' + String(err?.message || err));
            }
            recoveryDialog.close();
          };
          // Tombol abaikan
          $('recovery-discard').onclick = () => {
            window.trs.clearRecoverySnapshot().catch(() => {});
            setStatus('Sesi sebelumnya diabaikan. Dokumen baru disiapkan.');
            recoveryDialog.close();
          };
        }
      }
    } catch (e) { console.warn('Gagal memeriksa recovery snapshot:', e); }

    setStatus('Dokumen siap · perubahan belum disimpan');
  } catch (err) {
    console.error(err);
    setStatus('Model dokumen siap; metadata aplikasi tidak tersedia.');
  }
}
boot();
