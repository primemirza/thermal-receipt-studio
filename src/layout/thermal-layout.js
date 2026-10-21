import { validateDocument } from '../renderer/document-model.js';

const DEFAULT_COLUMNS = Object.freeze({ 58: 32, 80: 48 });
const ALIGNMENTS = new Set(['left', 'center', 'right']);

function assertWidth(paperWidthMm, columnsOverride) {
  if (![58, 80].includes(paperWidthMm)) throw new TypeError('Lebar kertas harus 58 atau 80 mm.');
  const columns = columnsOverride ?? DEFAULT_COLUMNS[paperWidthMm];
  if (!Number.isInteger(columns) || columns < 16 || columns > 64) {
    throw new TypeError('Jumlah kolom printer harus berupa bilangan bulat 16–64.');
  }
  return columns;
}

export function wrapText(value, width) {
  if (!Number.isInteger(width) || width < 1) throw new TypeError('Lebar wrapping harus minimal 1 kolom.');
  const source = String(value ?? '').replace(/\r\n?/g, '\n');
  const result = [];
  for (const paragraph of source.split('\n')) {
    if (paragraph.length === 0) {
      result.push('');
      continue;
    }
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      if (!word) continue;
      if (!line) {
        while (Array.from(word).length > width) {
          result.push(Array.from(word).slice(0, width).join(''));
          word = Array.from(word).slice(width).join('');
        }
        line = word;
      } else if (Array.from(line).length + 1 + Array.from(word).length <= width) {
        line += ' ' + word;
      } else {
        result.push(line);
        line = '';
        while (Array.from(word).length > width) {
          result.push(Array.from(word).slice(0, width).join(''));
          word = Array.from(word).slice(width).join('');
        }
        line = word;
      }
    }
    result.push(line);
  }
  return result.length ? result : [''];
}

function padCell(value, width, align) {
  const text = String(value ?? '');
  const missing = Math.max(0, width - Array.from(text).length);
  if (align === 'right') return ' '.repeat(missing) + text;
  if (align === 'center') {
    const left = Math.floor(missing / 2);
    return ' '.repeat(left) + text + ' '.repeat(missing - left);
  }
  return text + ' '.repeat(missing);
}

function formatAmount(value) {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(value);
}

function normalizeWidths(values, count) {
  if (Array.isArray(values) && values.length === count &&
      values.every(value => Number.isFinite(value) && value > 0)) {
    return values.map(value => value / values.reduce((sum, item) => sum + item, 0));
  }
  return Array.from({ length: count }, () => 1 / count);
}

function pushText(operations, text, block, width) {
  const align = ALIGNMENTS.has(block.align) ? block.align : 'left';
  for (const line of wrapText(text, width)) {
    operations.push({
      type: 'text',
      text: line,
      align,
      bold: block.bold === true,
      italic: block.italic === true,
      underline: block.underline === true
    });
  }
}

function layoutTable(block, width, operations) {
  const count = block.headers.length;
  const innerWidth = Math.max(count, Math.floor(width * ((block.width ?? 100) / 100)));
  const weights = normalizeWidths(block.columnWidths, count);
  const colWidths = weights.map(weight => Math.max(1, Math.floor(innerWidth * weight)));
  let used = colWidths.reduce((sum, item) => sum + item, 0);
  for (let i = 0; used > innerWidth && i < colWidths.length; i += 1) {
    if (colWidths[i] > 1) { colWidths[i] -= 1; used -= 1; }
  }
  for (let i = 0; used < innerWidth; i = (i + 1) % colWidths.length) {
    colWidths[i] += 1;
    used += 1;
  }

  const rows = [block.headers, ...block.rows];
  rows.forEach((row, rowIndex) => {
    const alignments = block.cellAlignments?.[rowIndex] || [];
    const wrapped = row.map((cell, columnIndex) =>
      wrapText(cell, colWidths[columnIndex]).map(line =>
        padCell(line, colWidths[columnIndex], ALIGNMENTS.has(alignments[columnIndex]) ? alignments[columnIndex] : 'left')
      )
    );
    const height = Math.max(1, ...wrapped.map(cellLines => cellLines.length));
    for (let lineIndex = 0; lineIndex < height; lineIndex += 1) {
      operations.push({
        type: 'text',
        text: wrapped.map(cellLines => cellLines[lineIndex] ?? ' '.repeat(colWidths[wrapped.indexOf(cellLines)] ?? 0)).join(''),
        align: 'left',
        bold: block.bold === true || (rowIndex === 0 && block.headerBold !== false),
        italic: block.italic === true,
        underline: block.underline === true,
        sourceType: 'table'
      });
    }
    if (rowIndex === 0 && block.border === 'horizontal') {
      operations.push({ type: 'rule', style: 'solid', character: '-', width: innerWidth });
    }
  });
}

function layoutColumns(block, width, operations) {
  const count = block.columns.length;
  const gap = Math.max(0, Math.min(3, Math.round((block.gap ?? 0) / 12)));
  const available = Math.max(count, width - gap * (count - 1));
  const weights = normalizeWidths(block.columnWidths, count);
  const widths = weights.map(weight => Math.max(1, Math.floor(available * weight)));
  let used = widths.reduce((sum, item) => sum + item, 0);
  for (let i = 0; used < available; i = (i + 1) % widths.length) { widths[i] += 1; used += 1; }
  while (used > available) {
    const index = widths.findIndex(item => item > 1);
    if (index < 0) break;
    widths[index] -= 1; used -= 1;
  }
  const cells = block.columns.map((value, index) => wrapText(value, widths[index]));
  const height = Math.max(1, ...cells.map(lines => lines.length));
  for (let line = 0; line < height; line += 1) {
    const parts = cells.map((lines, index) => {
      const alignment = block.columnAlignments?.[index] || 'left';
      return padCell(lines[line] ?? '', widths[index], alignment);
    });
    operations.push({
      type: 'text',
      text: parts.join(' '.repeat(gap)),
      align: block.align || 'left',
      bold: block.bold === true,
      italic: block.italic === true,
      underline: block.underline === true,
      sourceType: 'columns'
    });
  }
}

export function createThermalProfile(paperWidthMm, options = {}) {
  const columns = assertWidth(paperWidthMm, options.columns);
  const margins = options.margins || { left: 0, right: 0 };
  const leftPx = Number.isFinite(margins.left) ? margins.left : 0;
  const rightPx = Number.isFinite(margins.right) ? margins.right : 0;
  // The document model stores margins in CSS pixels; Font A is approximately 12 px per character.
  const marginColumns = Math.ceil(leftPx / 12) + Math.ceil(rightPx / 12);
  const effectiveColumns = Math.max(1, columns - marginColumns);
  return Object.freeze({
    paperWidthMm,
    columns,
    marginColumns,
    effectiveColumns,
    font: 'A',
    characterWidthPx: 12
  });
}

export function createThermalLayout(document, options = {}) {
  validateDocument(document);
  const profile = createThermalProfile(document.paperWidthMm, {
    columns: options.columns,
    margins: document.layout?.margins
  });
  const operations = [];
  const width = profile.effectiveColumns;

  function visit(blocks) {
    for (const block of blocks) {
      switch (block.type) {
        case 'section':
          visit(block.children);
          break;
        case 'text':
          pushText(operations, block.text, block, width);
          break;
        case 'dynamic':
          pushText(operations, block.text || '', block, width);
          break;
        case 'item': {
          const price = formatAmount(block.price);
          const nameWidth = Math.max(1, width - Array.from(price).length - 1);
          const names = wrapText(block.name, nameWidth);
          operations.push({ type: 'text', text: padCell(names[0], nameWidth, 'left') + ' ' + price, align: 'left', bold: block.bold === true, italic: block.italic === true, underline: block.underline === true, sourceType: 'item' });
          for (const line of names.slice(1)) operations.push({ type: 'text', text: line, align: 'left', bold: block.bold === true, italic: block.italic === true, underline: block.underline === true, sourceType: 'item' });
          break;
        }
        case 'total': {
          const value = formatAmount(block.amount);
          const labelWidth = Math.max(1, width - Array.from(value).length - 1);
          operations.push({ type: 'text', text: padCell(block.label, labelWidth, 'left') + ' ' + value, align: 'left', bold: block.bold === true, italic: block.italic === true, underline: block.underline === true, sourceType: 'total' });
          break;
        }
        case 'rule': {
          const character = block.character || (block.style === 'double' ? '=' : '-');
          operations.push({ type: 'rule', style: block.style || 'solid', character, width });
          break;
        }
        case 'spacer':
          operations.push({ type: 'feed', lines: block.height });
          break;
        case 'table':
          layoutTable(block, width, operations);
          break;
        case 'columns':
          layoutColumns(block, width, operations);
          break;
        case 'image':
          operations.push({ type: 'image', dataUrl: block.dataUrl, width: block.width, alt: block.alt || '' });
          break;
        case 'qrcode':
          operations.push({ type: 'qrcode', value: block.value, width: block.width || 96 });
          break;
        case 'barcode':
          operations.push({ type: 'barcode', value: block.value, width: block.width || 128, symbology: block.symbology || 'code128' });
          break;
        default:
          throw new TypeError('Jenis blok tidak didukung layout thermal: ' + block.type);
      }
    }
  }
  visit(document.blocks);
  if (Number.isInteger(options.feedBeforeCut) && options.feedBeforeCut > 0) {
    operations.push({ type: 'feed', lines: Math.min(options.feedBeforeCut, 20) });
  }
  if (options.cut === true) operations.push({ type: 'cut', mode: options.cutMode === 'partial' ? 'partial' : 'full' });
  return Object.freeze({ profile, operations: Object.freeze(operations) });
}
