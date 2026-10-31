import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('printer operations are whitelisted in main and exposed only through named preload methods', () => {
  const main = read('src/main/main.js');
  const preload = read('src/preload/preload.cjs');
  assert.match(main, /'printer:list'/);
  assert.match(main, /'printer:driver'/);
  assert.match(main, /'printer:reprint'/);
  assert.match(main, /getPrintersAsync/);
  assert.match(preload, /listPrinters: \(\) => invoke\('printer:list'\)/);
  assert.doesNotMatch(preload, /exposeInMainWorld\([^)]*ipcRenderer/);
});

test('printer UI uses driver-only mode with toolbar dropdown (TCP mode removed)', () => {
  const renderer = read('src/renderer/renderer.js');
  const html = read('src/renderer/index.html');
  // Dropdown printer ada di toolbar
  assert.match(html, /id="toolbar-printer-device"/);
  assert.match(html, /toolbar-printer-select/);
  // Jalur cetak driver tetap ada
  assert.match(renderer, /encodeThermalLayout\(layoutPlain, ReceiptPrinterEncoder/);
  assert.match(renderer, /printViaDriver/);
  assert.match(renderer, /doPrintViaDriver/);
  // TCP mode sudah dihapus
  assert.doesNotMatch(html, /raw-escpos-confirm/);
  assert.doesNotMatch(html, /Raw ESC\/POS via TCP\/IP/);
});

test('toolbar print button is an icon button and dialog buttons have icons with high-contrast hover', () => {
  const html = read('src/renderer/index.html');
  const css = read('src/renderer/app.css');
  assert.match(html, /<button type="button" class="icon-button" id="printer-button"[^>]*>[\s\S]*?<svg[^>]*class="toolbar-icon"/);
  assert.match(html, /id="printer-print-button"[^>]*class="[^"]*btn-with-icon/);
  assert.match(html, /id="printer-reprint-button"[^>]*class="[^"]*btn-with-icon/);
  assert.match(html, /id="printer-dialog-cancel"[^>]*class="[^"]*btn-with-icon/);
  assert.match(css, /\.primary-action:hover[^{]*{[^}]*color:\s*#ffffff/);
  assert.match(css, /\.text-button:hover[^{]*{[^}]*color:\s*#004f9e/);
});
