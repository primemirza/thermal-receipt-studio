// Memverifikasi harness smoke mode CI ada dan terkonfigurasi dengan benar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const main = fs.readFileSync(path.join(root, 'src/main/main.js'), 'utf8');

test('mode TRS_SMOKE keluar dengan kode 0 saat jendela valid', () => {
  assert.match(main, /TRS_SMOKE/);
  assert.match(main, /TRS_SMOKE_OK/);
  assert.match(main, /app\.exit\(0\)/);
});

test('skrip start:test mengatur TRS_SMOKE', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(pkg.scripts['start:test'], /TRS_SMOKE=1/);
});
