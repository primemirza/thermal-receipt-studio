import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDriverPrintHtml } from '../src/printer/driver-print.js';

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
