/**
 * Menghasilkan halaman HTML cetak dari operasi thermal layout (array baris monospace).
 * Digunakan oleh jalur driver Windows agar output identik dengan jalur raw ESC/POS TCP.
 *
 * @param {import('../layout/thermal-layout.js').ThermalLayout} thermalLayout
 *   Objek layout dari createThermalLayout: { profile, operations }.
 * @param {number} [paperWidthMm=58] Lebar kertas: 58 atau 80.
 * @returns {string} HTML siap cetak.
 */
export function buildThermalDriverHtml(thermalLayout, paperWidthMm = 58) {
  if (!thermalLayout || typeof thermalLayout !== 'object' || !Array.isArray(thermalLayout.operations)) {
    throw new TypeError('thermalLayout harus berupa objek dengan properti operations.');
  }
  if (![58, 80].includes(paperWidthMm)) throw new TypeError('Lebar kertas harus 58 atau 80 mm.');

  const columns = thermalLayout.profile?.effectiveColumns ?? (paperWidthMm === 58 ? 32 : 48);
  // Sesuaikan margin dan printable width untuk kompatibilitas XPrinter Driver
  // Mengurangi body width dan margin untuk memberi ruang driver printer thermal
  const bodyWidthMm = paperWidthMm === 58 ? 57 : 79;
  const printableWidthMm = paperWidthMm === 58 ? 49 : 73;
  const marginSideMm = paperWidthMm === 58 ? 4 : 3;

  const items = [];
  let currentPreLines = [];

  function flushPre() {
    if (currentPreLines.length > 0) {
      items.push('<pre>' + currentPreLines.join('\n') + '</pre>');
      currentPreLines = [];
    }
  }

  for (const op of thermalLayout.operations) {
    if (op.type === 'text') {
      let text = op.text ?? '';
      const len = Array.from(text).length;
      if (op.align === 'center' && len < columns) {
        const pad = Math.floor((columns - len) / 2);
        text = ' '.repeat(pad) + text;
      } else if (op.align === 'right' && len < columns) {
        text = ' '.repeat(columns - len) + text;
      }
      let style = '';
      if (op.bold) style += 'font-weight:bold;';
      if (op.italic) style += 'font-style:italic;';
      if (op.underline) style += 'text-decoration:underline;';
      if (op.size === 'double-height' || op.size === 'double' || op.size === 'large') {
        style += 'font-size:1.35em;line-height:1.2;';
      }
      if (style) {
        currentPreLines.push('<span style="' + style + '">' + escapeHtml(text) + '</span>');
      } else {
        currentPreLines.push(escapeHtml(text));
      }
    } else if (op.type === 'rule') {
      const char = (op.character || '-').slice(0, 1);
      const count = op.width ?? columns;
      currentPreLines.push(escapeHtml(char.repeat(count)));
    } else if (op.type === 'feed') {
      const n = Math.max(1, Math.min(20, op.lines || 1));
      for (let i = 0; i < n; i++) currentPreLines.push('');
    } else if (op.type === 'image') {
      flushPre();
      if (op.dataUrl) {
        const w = op.width ? `${op.width}px` : '100%';
        items.push('<div class="thermal-media"><img src="' + escapeHtml(op.dataUrl) + '" style="max-width:100%;width:' + escapeHtml(w) + ';height:auto;display:block;margin:0 auto;" alt="' + escapeHtml(op.alt || '') + '" /></div>');
      }
    } else if (op.type === 'qrcode') {
      flushPre();
      if (op.dataUrl) {
        const w = op.width ? `${op.width}px` : '96px';
        items.push('<div class="thermal-media"><img src="' + escapeHtml(op.dataUrl) + '" style="max-width:100%;width:' + escapeHtml(w) + ';height:auto;display:block;margin:0 auto;" alt="QR Code" /></div>');
      }
    } else if (op.type === 'barcode') {
      flushPre();
      if (op.svg) {
        items.push('<div class="thermal-media" style="text-align:center;">' + op.svg + '</div>');
      }
    } else if (op.type === 'cut') {
      currentPreLines.push('');
    }
  }
  flushPre();

  return '<!doctype html><html lang="id"><head><meta charset="utf-8">' +
    '<style>' +
    '@page { margin: 0; }' +
    '* { box-sizing: border-box; }' +
    'html, body { margin: 0; padding: 0; background: #ffffff; color: #000000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }' +
    'body { width: ' + bodyWidthMm + 'mm; padding: 0 ' + marginSideMm + 'mm; }' +
    '#receipt-container { width: ' + printableWidthMm + 'mm; margin: 0 auto; padding: 1mm 0; }' +
    '#receipt-container pre { margin: 0; padding: 0; font: 2.45mm/1.3 "Courier New", monospace; white-space: pre; color: #000000; }' +
    '.thermal-media { margin: 1mm 0; text-align: center; }' +
    '.thermal-media svg { max-width: 100%; height: auto; }' +
    '@media print { html, body { background: #ffffff !important; color: #000000 !important; } }' +
    '</style></head><body>' +
    '<div id="receipt-container">' +
    items.join('') +
    '</div></body></html>';
}

/** Escape karakter HTML dalam konten teks agar aman dimasukkan ke tag HTML. */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function buildDriverPrintHtml(receiptMarkup, paperWidthMm = 58) {
  if (typeof receiptMarkup !== 'string' || receiptMarkup.length < 1 || receiptMarkup.length > 2_000_000) {
    throw new TypeError('Konten struk untuk driver tidak valid atau terlalu besar.');
  }
  if (![58, 80].includes(paperWidthMm)) throw new TypeError('Lebar kertas harus 58 atau 80 mm.');
  // Markup is generated by the local renderer. Reject executable/remote content before
  // moving it into a dedicated hidden print window.
  if (/<\s*(script|iframe|object|embed|form|video|audio)\b/i.test(receiptMarkup) ||
      /\son[a-z]+\s*=/i.test(receiptMarkup) ||
      /(?:src|href)\s*=\s*["']\s*(?:https?:|file:|javascript:|\/\/)/i.test(receiptMarkup)) {
    throw new TypeError('Konten struk berisi markup atau resource yang tidak diizinkan.');
  }
  const width = paperWidthMm === 58 ? '48mm' : '72mm';
  return '<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' +
    '@page { margin: 0; }' +
    '* { box-sizing: border-box; } html, body { margin: 0; padding: 0; background: white; color: black; }' +
    'body { width: ' + width + '; padding: 2mm; font: 10pt/1.35 Consolas, "Courier New", monospace; }' +
    '.receipt-preview { width: 100% !important; padding: 0 !important; margin: 0 !important; border: 0 !important; box-shadow: none !important; background: white !important; color: black !important; font: inherit !important; }' +
    'img, svg { max-width: 100%; } .receipt-line { break-inside: avoid; }' +
    '</style></head><body><div class="receipt-preview">' + receiptMarkup + '</div></body></html>';
}
