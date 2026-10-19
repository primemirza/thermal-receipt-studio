import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('Fase 2 menyediakan kontrol kertas, zoom, dan panduan yang dapat diakses', () => {
  const html = read('src/renderer/index.html');
  for (const id of ['zoom-out', 'zoom-in', 'zoom-fit', 'toggle-guides', 'receipt-preview', 'design-paper', 'status-text']) {
    assert.ok(html.includes(`id="${id}"`), `kontrol ${id} tersedia`);
  }
  assert.match(html, /data-paper="58"/);
  assert.match(html, /data-paper="80"/);
  assert.match(html, /aria-pressed="true"/);
});

test('renderer menghubungkan lebar kertas dan zoom dengan render preview', () => {
  const js = read('src/renderer/renderer.js');
  assert.match(js, /function renderReceipt\(\)/);
  assert.match(js, /function setPaper\(width\)/);
  assert.match(js, /function setZoom\(value\)/);
  assert.match(js, /receiptPreview\.replaceChildren\(\.\.\.lines\)/);
  assert.match(js, /data-paper/);
  assert.match(js, /zoom-' \+ state\.zoom/);
  assert.match(js, /toggle-guides/);
});

test('UI tetap offline dan tidak memuat skrip atau stylesheet remote', () => {
  const html = read('src/renderer/index.html');
  assert.ok(!html.includes('http://') && !html.includes('https://'));
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /script-src 'self'/);
  assert.match(html, /stylesheet" href="\.\/app\.css"/);
});

test('gaya editor dan preview mendukung ukuran kertas dan tingkat zoom', () => {
  const css = read('src/renderer/app.css');
  assert.match(css, /\.design-paper\[data-paper="80"\]/);
  for (const zoom of [60, 70, 80, 90, 100, 110, 120, 130, 140, 150]) {
    assert.ok(css.includes(`.receipt-preview.zoom-${zoom}`), `zoom ${zoom}% tersedia`);
  }
  assert.match(css, /@media \(max-width: 900px\)/);
});
