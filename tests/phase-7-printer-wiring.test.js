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
  assert.match(main, /getPrintersAsync/);
  assert.match(main, /printRawBuffer/);
  assert.doesNotMatch(main, /'printer:raw'/);
  assert.doesNotMatch(main, /'printer:reprint'/);
  assert.match(preload, /listPrinters: \(\) => invoke\('printer:list'\)/);
  assert.match(preload, /printViaDriver: \(/);
  assert.doesNotMatch(preload, /printRawTcp/);
  assert.doesNotMatch(preload, /reprintLastJob/);
  assert.doesNotMatch(preload, /exposeInMainWorld\([^)]*ipcRenderer/);
});

test('printer UI uses toolbar dropdown and direct print without dialog', () => {
  const renderer = read('src/renderer/renderer.js');
  const html = read('src/renderer/index.html');
  // Dropdown printer ada di toolbar
  assert.match(html, /id="toolbar-printer-device"/);
  // Jalur cetak driver tetap ada
  assert.match(renderer, /encodeThermalLayout\(layoutPlain, ReceiptPrinterEncoder/);
  assert.match(renderer, /printViaDriver/);
  // Dialog cetak dan mode TCP sudah dihapus
  assert.doesNotMatch(html, /id="printer-dialog"/);
  assert.doesNotMatch(html, /printer-mode/);
  assert.doesNotMatch(html, /raw-escpos-confirm/);
  assert.doesNotMatch(renderer, /printerDialog/);
  assert.doesNotMatch(renderer, /printRawTcp/);
});

test('toolbar print button is an icon button with high-contrast hover', () => {
  const html = read('src/renderer/index.html');
  const css = read('src/renderer/app.css');
  assert.match(html, /<button type="button" class="icon-button" id="printer-button"[^>]*>[\s\S]*?<svg[^>]*class="toolbar-icon"/);
  assert.match(css, /\.primary-action:hover[^{]*{[^}]*color:\s*#ffffff/);
});
