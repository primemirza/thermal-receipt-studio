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
  assert.match(main, /'printer:raw'/);
  assert.match(main, /'printer:reprint'/);
  assert.match(main, /getPrintersAsync/);
  assert.match(main, /webContents\.print/);
  assert.match(preload, /listPrinters: \(\) => invoke\('printer:list'\)/);
  assert.match(preload, /printRawTcp: \(bytes, host, port = 9100\)/);
  assert.doesNotMatch(preload, /exposeInMainWorld\([^)]*ipcRenderer/);
});

test('printer UI warns and requires explicit ESC/POS confirmation before raw printing', () => {
  const renderer = read('src/renderer/renderer.js');
  const html = read('src/renderer/index.html');
  assert.match(renderer, /raw-escpos-confirm/);
  assert.match(renderer, /encodeThermalLayout\(layout, ReceiptPrinterEncoder/);
  assert.match(html, /Raw ESC\/POS via TCP\/IP/);
  assert.match(html, /id="raw-escpos-confirm"/);
});
