import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDriverPrintHtml, buildThermalDriverHtml } from '../src/printer/driver-print.js';

// --- Test buildDriverPrintHtml (sudah ada, tidak diubah) ---

test('driver print document uses selected paper width and embeds local receipt markup', () => {
  const html = buildDriverPrintHtml('<div class="receipt-line">Total 20.000</div>', 80);
  assert.ok(html.includes('@page { margin: 0; }'));
  assert.match(html, /width: 72mm/);
  assert.match(html, /Total 20\.000/);
  assert.match(html, /<body>/);
});

test('driver print document rejects invalid widths, oversized and executable markup', () => {
  assert.throws(() => buildDriverPrintHtml('<div>ok</div>', 70), /Lebar kertas/);
  assert.throws(() => buildDriverPrintHtml('<script>alert(1)</script>', 58), /markup/);
  assert.throws(() => buildDriverPrintHtml('<img src="https://example.com/x.png">', 58), /resource/);
  assert.throws(() => buildDriverPrintHtml('x'.repeat(2_000_001), 58), /tidak valid/);
});

// --- Test buildThermalDriverHtml (fungsi baru untuk jalur driver thermal) ---

test('buildThermalDriverHtml rejects invalid layout and paper width', () => {
  assert.throws(() => buildThermalDriverHtml(null, 58), /thermalLayout/);
  assert.throws(() => buildThermalDriverHtml({}, 58), /thermalLayout/);
  assert.throws(() => buildThermalDriverHtml({ operations: [] }, 70), /Lebar kertas/);
});

test('buildThermalDriverHtml renders text, rule, feed, and cut operations into pre-formatted HTML', () => {
  const layout = {
    profile: { effectiveColumns: 32 },
    operations: [
      { type: 'text', text: 'Toko SAMPEAN', align: 'left', bold: false, italic: false, underline: false },
      { type: 'text', text: 'Top tas merah Jumbo', align: 'left', bold: false },
      { type: 'rule', style: 'solid', character: '-', width: 32 },
      { type: 'text', text: 'Total', align: 'right', bold: true },
      { type: 'feed', lines: 2 },
      { type: 'cut', mode: 'full' },
    ]
  };
  const html = buildThermalDriverHtml(layout, 58);
  assert.match(html, /@page \{ margin: 0;/, 'harus menyertakan CSS @page dengan margin 0');
  assert.match(html, /48mm/, 'lebar body harus 48mm untuk kertas 58mm');
  assert.match(html, /<pre>/, 'harus menggunakan tag <pre>');
  assert.match(html, /Courier New/, 'harus menggunakan font monospace Courier New');
  assert.match(html, /Toko SAMPEAN/, 'konten teks harus ada');
  assert.match(html, /--------------------------------/, 'rule 32 karakter harus ada');
  assert.match(html, /Total/, 'teks Total harus ada');
  assert.match(html, /font-weight:bold/, 'teks bold harus memiliki style bold');
});

test('buildThermalDriverHtml applies center and right alignment with correct padding', () => {
  const layout = {
    profile: { effectiveColumns: 32 },
    operations: [
      { type: 'text', text: 'TENGAH', align: 'center', bold: false },
      { type: 'text', text: 'KANAN', align: 'right', bold: false },
    ]
  };
  const html = buildThermalDriverHtml(layout, 58);
  // Center: 'TENGAH' panjang 6, kolom 32, pad = floor((32-6)/2) = 13 spasi di kiri
  assert.match(html, /\s{13}TENGAH/, 'teks tengah harus diberi 13 spasi padding kiri');
  // Right: 'KANAN' panjang 5, kolom 32, pad = 27 spasi di kiri
  assert.match(html, /\s{27}KANAN/, 'teks kanan harus diberi 27 spasi padding kiri');
});

test('buildThermalDriverHtml escapes HTML special characters in text content', () => {
  const layout = {
    profile: { effectiveColumns: 32 },
    operations: [
      { type: 'text', text: 'Harga <diskon> & bonus 10%', align: 'left', bold: false },
    ]
  };
  const html = buildThermalDriverHtml(layout, 58);
  assert.match(html, /Harga &lt;diskon&gt; &amp; bonus 10%/, 'karakter HTML harus di-escape');
  assert.doesNotMatch(html, /<diskon>/, 'tag HTML tidak boleh lolos tanpa escape');
});

test('buildThermalDriverHtml produces wider body for 80mm paper', () => {
  const layout = { profile: { effectiveColumns: 48 }, operations: [] };
  const html = buildThermalDriverHtml(layout, 80);
  assert.match(html, /72mm/, 'lebar body harus 72mm untuk kertas 80mm');
});

test('buildThermalDriverHtml renders image, qrcode, and barcode elements', () => {
  const layout = {
    profile: { effectiveColumns: 32 },
    operations: [
      { type: 'image', dataUrl: 'data:image/png;base64,iVBORw0KGgo=', width: 120, alt: 'Logo toko' },
      { type: 'qrcode', dataUrl: 'data:image/png;base64,iVBORw0KGqr=', width: 96, value: 'INV-123' },
      { type: 'barcode', svg: '<svg class="barcode-test"></svg>', value: '123456' }
    ]
  };
  const html = buildThermalDriverHtml(layout, 58);
  assert.match(html, /<div id="receipt-container"/, 'harus memiliki #receipt-container');
  assert.match(html, /data:image\/png;base64,iVBORw0KGgo=/, 'dataUrl gambar harus ada di img src');
  assert.match(html, /data:image\/png;base64,iVBORw0KGqr=/, 'dataUrl QR harus ada di img src');
  assert.match(html, /<svg class="barcode-test"><\/svg>/, 'SVG barcode harus ter-render');
  assert.match(html, /white-space:\s*pre;/, 'harus menggunakan white-space: pre agar baris monospace tidak wrap');
});

