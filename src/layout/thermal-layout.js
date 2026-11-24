import { validateDocument } from '../renderer/document-model.js';

const DEFAULT_COLUMNS = Object.freeze({ 58: 32, 80: 48 });
const ALIGNMENTS = new Set(['left', 'center', 'right']);

/**
 * Lebar desain kanvas dalam piksel layar (96 DPI) untuk masing-masing ukuran kertas.
 * Nilai ini harus konsisten dengan konstanta yang dipakai di renderer.js (renderCanvas / renderPreview).
 */
const DESIGN_PAPER_WIDTH_PX = Object.freeze({ 58: 284, 80: 364 });

/**
 * Lebar area cetak printer thermal dalam dots (printer 203 DPI, area cetak efektif ~48 mm untuk 58 mm
 * dan ~72 mm untuk 80 mm). Digunakan untuk mengonversi lebar gambar dari piksel layar ke printer dots
 * agar gambar tercetak proporsional dengan ukurannya di desain.
 *   58 mm → ~48 mm × 8 dots/mm = 384 dots
 *   80 mm → ~72 mm × 8 dots/mm = 576 dots
 */
const PRINTABLE_WIDTH_DOTS = Object.freeze({ 58: 384, 80: 576 });

/**
 * Konversi lebar gambar/kode dari piksel layar ke printer dots secara proporsional.
 * @param {number} screenPx Lebar dalam piksel layar (dari block.width).
 * @param {number} paperWidthMm Lebar kertas (58 atau 80).
 * @returns {number} Lebar dalam printer dots, dibatasi maksimal lebar printable kertas.
 */
function screenPxToPrinterDots(screenPx, paperWidthMm) {
  const designPx = DESIGN_PAPER_WIDTH_PX[paperWidthMm] ?? DESIGN_PAPER_WIDTH_PX[58];
  const printableDots = PRINTABLE_WIDTH_DOTS[paperWidthMm] ?? PRINTABLE_WIDTH_DOTS[58];
  const dots = Math.round((screenPx / designPx) * printableDots);
  return Math.max(1, Math.min(dots, printableDots));
}

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
    for (let word of paragraph.split(/\s+/)) {
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

/**
 * Konversi px margin ke kolom karakter (Font A ~12px/kolom).
 * Berlaku untuk margin kiri/kanan blok maupun padding section.
 */
function pxToCols(px) {
  return Math.ceil((px || 0) / 12);
}

/**
 * Hasilkan teks dengan indentasi kiri dan perataan berbasis karakter.
 * Jika leftIndent > 0, semua alignment di-komputasi manual sebagai spasi
 * sehingga encoder ESC/POS cukup memakai align:'left'.
 */
function pushText(operations, text, block, width, leftIndent) {
  const indent = Math.max(0, leftIndent || 0);
  const align = ALIGNMENTS.has(block.align) ? block.align : 'left';
  for (const line of wrapText(text, width)) {
    let finalText = line;
    let finalAlign = align;
    if (indent > 0) {
      // Pre-komputasi alignment manual agar encoder cukup kirim align:left.
      const len = Array.from(line).length;
      let alignPad = 0;
      if (align === 'center') alignPad = Math.floor((width - len) / 2);
      else if (align === 'right') alignPad = Math.max(0, width - len);
      finalText = ' '.repeat(indent) + ' '.repeat(alignPad) + line;
      finalAlign = 'left';
    }
    operations.push({
      type: 'text',
      text: finalText,
      align: finalAlign,
      bold: block.bold === true,
      italic: block.italic === true,
      underline: block.underline === true,
      size: block.size || 'normal',
      doubleHeight: block.doubleHeight === true
    });
  }
}

/**
 * Layout tabel ke operasi teks.
 * @param {number} leftIndent Kolom indent kiri yang sudah dihitung dari margin/padding ancestor.
 */
function layoutTable(block, width, operations, leftIndent) {
  const indent = Math.max(0, leftIndent || 0);
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
  const noWrap = block.wrapText === false;
  rows.forEach((row, rowIndex) => {
    const alignments = block.cellAlignments?.[rowIndex] || [];
    const wrapped = row.map((cell, columnIndex) => {
      const colW = colWidths[columnIndex];
      if (noWrap) {
        // Potong teks agar hanya 1 baris sesuai lebar kolom (tidak di-wrap)
        const singleLine = String(cell ?? '').replace(/\r?\n/g, ' ');
        const truncated = singleLine.length > colW ? singleLine.slice(0, colW) : singleLine;
        return [padCell(truncated, colW, ALIGNMENTS.has(alignments[columnIndex]) ? alignments[columnIndex] : 'left')];
      }
      return wrapText(cell, colW).map(line =>
        padCell(line, colW, ALIGNMENTS.has(alignments[columnIndex]) ? alignments[columnIndex] : 'left')
      );
    });
    const height = Math.max(1, ...wrapped.map(cellLines => cellLines.length));
    // Baris header (rowIndex===0) hanya bold jika hasHeader === true
    const isHeaderRow = rowIndex === 0 && block.hasHeader === true;
    for (let lineIndex = 0; lineIndex < height; lineIndex += 1) {
      const rowText = wrapped.map(cellLines => cellLines[lineIndex] ?? ' '.repeat(colWidths[wrapped.indexOf(cellLines)] ?? 0)).join('');
      operations.push({
        type: 'text',
        text: (indent > 0 ? ' '.repeat(indent) : '') + rowText,
        align: 'left',
        bold: block.bold === true || isHeaderRow,
        italic: block.italic === true,
        underline: block.underline === true,
        size: block.size || 'normal',
        sourceType: 'table'
      });
    }
    if (isHeaderRow && block.border === 'horizontal') {
      operations.push({ type: 'rule', style: 'solid', character: '-', width: innerWidth, marginLeft: indent });
    }
  });
}

/**
 * Layout teks kolom ke operasi teks.
 * @param {number} leftIndent Kolom indent kiri yang sudah dihitung dari margin/padding ancestor.
 */
function layoutColumns(block, width, operations, leftIndent) {
  const indent = Math.max(0, leftIndent || 0);
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
      text: (indent > 0 ? ' '.repeat(indent) : '') + parts.join(' '.repeat(gap)),
      align: 'left',
      bold: block.bold === true,
      italic: block.italic === true,
      underline: block.underline === true,
      size: block.size || 'normal',
      sourceType: 'columns'
    });
  }
}

export function createThermalProfile(paperWidthMm, options = {}) {
  const columns = assertWidth(paperWidthMm, options.columns);
  const margins = options.margins || { left: 0, right: 0, top: 0, bottom: 0 };
  const leftPx = Number.isFinite(margins.left) ? margins.left : 0;
  const rightPx = Number.isFinite(margins.right) ? margins.right : 0;
  const topPx = Number.isFinite(margins.top) ? margins.top : 0;
  const bottomPx = Number.isFinite(margins.bottom) ? margins.bottom : 0;
  // The document model stores margins in CSS pixels; Font A is approximately 12 px per character.
  const marginColumns = Math.ceil(leftPx / 12) + Math.ceil(rightPx / 12);
  const effectiveColumns = Math.max(1, columns - marginColumns);
  // Convert vertical margins to feed lines (thermal printer line height ≈ Font A 12px).
  // Gunakan 12px per baris (konsisten dengan 1 baris teks thermal ≈ Font A 12px).
  // Ini mencegah margin kecil (mis. 12px) menghasilkan terlalu banyak feed (4 baris).
  const topFeedLines = Math.max(0, Math.ceil(topPx / 12));
  const bottomFeedLines = Math.max(0, Math.ceil(bottomPx / 12));
  return Object.freeze({
    paperWidthMm,
    columns,
    marginColumns,
    effectiveColumns,
    font: 'A',
    characterWidthPx: 12,
    topFeedLines,
    bottomFeedLines
  });
}

export function createThermalLayout(document, options = {}) {
  validateDocument(document);
  const profile = createThermalProfile(document.paperWidthMm, {
    columns: options.columns,
    margins: document.layout?.margins
  });
  const operations = [];

  // Convert px to feed lines (thermal printer line height ~3px per line)
  function pxToFeedLines(px) {
    return Math.max(0, Math.ceil((px || 0) / 3));
  }

  // Apply global top margin from profile
  if (profile.topFeedLines > 0) operations.push({ type: 'feed', lines: profile.topFeedLines });

  /**
   * Kunjungi blok secara rekursif.
   * @param {object[]} blocks Daftar blok yang dikunjungi.
   * @param {number} currentWidth Lebar kolom tersedia setelah margin/padding ancestor.
   * @param {number} currentLeftIndent Akumulasi indent kiri (kolom) dari ancestor.
   */
  function visit(blocks, currentWidth, currentLeftIndent) {
    for (const block of blocks) {
      // ── Margin atas blok sebagai feed lines ──
      if (block.margin) {
        const topLines = pxToFeedLines(block.margin.top);
        if (topLines > 0) operations.push({ type: 'feed', lines: topLines });
      }

      // ── Hitung lebar dan indent efektif blok ini ──
      const blockLeftCols  = block.margin ? pxToCols(block.margin.left)  : 0;
      const blockRightCols = block.margin ? pxToCols(block.margin.right) : 0;
      const blockWidth     = Math.max(1, currentWidth - blockLeftCols - blockRightCols);
      const blockLeftIndent = currentLeftIndent + blockLeftCols;

      switch (block.type) {
        case 'section': {
          // Padding section juga mempersempit area konten anak.
          const padLeftCols  = block.padding ? pxToCols(block.padding.left)  : 0;
          const padRightCols = block.padding ? pxToCols(block.padding.right) : 0;
          const childWidth      = Math.max(1, blockWidth - padLeftCols - padRightCols);
          const childLeftIndent = blockLeftIndent + padLeftCols;

          if (block.padding) {
            const padTopLines = pxToFeedLines(block.padding.top);
            if (padTopLines > 0) operations.push({ type: 'feed', lines: padTopLines });
          }

          visit(block.children, childWidth, childLeftIndent);

          if (block.padding) {
            const padBottomLines = pxToFeedLines(block.padding.bottom);
            if (padBottomLines > 0) operations.push({ type: 'feed', lines: padBottomLines });
          }
          break;
        }

        case 'text':
          pushText(operations, block.text, block, blockWidth, blockLeftIndent);
          break;

        case 'paragraph': {
          // Split on explicit newlines; each line is wrapped independently.
          const rawLines = (block.text || '').split('\n');
          for (const rawLine of rawLines) {
            pushText(operations, rawLine, block, blockWidth, blockLeftIndent);
          }
          break;
        }

        case 'dynamic':
          pushText(operations, block.text || '', block, blockWidth, blockLeftIndent);
          break;

        case 'item': {
          const price = formatAmount(block.price);
          const nameWidth = Math.max(1, blockWidth - Array.from(price).length - 1);
          const names = wrapText(block.name, nameWidth);
          const prefix = blockLeftIndent > 0 ? ' '.repeat(blockLeftIndent) : '';
          operations.push({
            type: 'text',
            text: prefix + padCell(names[0], nameWidth, 'left') + ' ' + price,
            align: 'left',
            bold: block.bold === true,
            italic: block.italic === true,
            underline: block.underline === true,
            size: block.size || 'normal',
            doubleHeight: block.doubleHeight === true,
            sourceType: 'item'
          });
          for (const line of names.slice(1)) {
            operations.push({
              type: 'text',
              text: prefix + line,
              align: 'left',
              bold: block.bold === true,
              italic: block.italic === true,
              underline: block.underline === true,
              sourceType: 'item'
            });
          }
          break;
        }

        case 'total': {
          const value = formatAmount(block.amount);
          const labelWidth = Math.max(1, blockWidth - Array.from(value).length - 1);
          const prefix = blockLeftIndent > 0 ? ' '.repeat(blockLeftIndent) : '';
          operations.push({
            type: 'text',
            text: prefix + padCell(block.label, labelWidth, 'left') + ' ' + value,
            align: 'left',
            bold: block.bold === true,
            italic: block.italic === true,
            underline: block.underline === true,
            size: block.size || 'normal',
            doubleHeight: block.doubleHeight === true,
            sourceType: 'total'
          });
          break;
        }

        case 'rule': {
          const character = block.character || (block.style === 'double' ? '=' : '-');
          // Hitung lebar garis berdasarkan persentase (block.width, 10–100%).
          const ruleWidthPct = block.width !== undefined ? block.width : 100;
          const ruleWidth = Math.max(1, Math.round(blockWidth * ruleWidthPct / 100));
          // Hitung marginLeft berdasarkan alignment.
          const ruleAlign = block.align || 'left';
          let ruleMLeft = blockLeftIndent;
          if (ruleAlign === 'center') ruleMLeft += Math.floor((blockWidth - ruleWidth) / 2);
          else if (ruleAlign === 'right') ruleMLeft += blockWidth - ruleWidth;
          operations.push({
            type: 'rule',
            style: block.style || 'solid',
            character,
            width: ruleWidth,
            marginLeft: ruleMLeft
          });
          break;
        }

        case 'spacer':
          operations.push({ type: 'feed', lines: block.height });
          break;

        case 'table':
          layoutTable(block, blockWidth, operations, blockLeftIndent);
          break;

        case 'columns':
          layoutColumns(block, blockWidth, operations, blockLeftIndent);
          break;

        case 'image':
          operations.push({
            type: 'image',
            dataUrl: block.dataUrl,
            // Konversi lebar dari piksel layar ke printer dots agar gambar tercetak
            // proporsional dengan ukurannya di desain kanvas.
            width: screenPxToPrinterDots(block.width, document.paperWidthMm),
            alt: block.alt || ''
          });
          break;

        case 'qrcode':
          operations.push({
            type: 'qrcode',
            value: block.value,
            width: screenPxToPrinterDots(block.width || 96, document.paperWidthMm)
          });
          break;

        case 'barcode':
          operations.push({
            type: 'barcode',
            value: block.value,
            width: screenPxToPrinterDots(block.width || 128, document.paperWidthMm),
            symbology: block.symbology || 'code128'
          });
          break;

        default:
          throw new TypeError('Jenis blok tidak didukung layout thermal: ' + block.type);
      }

      // ── Margin bawah blok sebagai feed lines ──
      if (block.margin) {
        const bottomLines = pxToFeedLines(block.margin.bottom);
        if (bottomLines > 0) operations.push({ type: 'feed', lines: bottomLines });
      }
    }
  }

  visit(document.blocks, profile.effectiveColumns, 0);

  // Apply global bottom margin from profile
  if (profile.bottomFeedLines > 0) operations.push({ type: 'feed', lines: profile.bottomFeedLines });

  if (Number.isInteger(options.feedBeforeCut) && options.feedBeforeCut > 0) {
    operations.push({ type: 'feed', lines: Math.min(options.feedBeforeCut, 20) });
  }
  if (options.cut === true) operations.push({ type: 'cut', mode: options.cutMode === 'partial' ? 'partial' : 'full' });
  return Object.freeze({ profile, operations: Object.freeze(operations) });
}
