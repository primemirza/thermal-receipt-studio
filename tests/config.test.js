// Tes fondasi Fase 1 — dapat dijalankan dengan `node --test` di Linux/macOS/Windows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('package.json valid dan memakai ES modules', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.main, 'src/main/bootstrap.cjs');
  for (const s of ['start', 'test', 'dist:win']) assert.ok(pkg.scripts[s], `skrip ${s} ada`);
});

test('konfigurasi electron-builder menargetkan portable win x64 (bukan NSIS/MSI)', () => {
  const pkg = JSON.parse(read('package.json'));
  const b = pkg.build;
  assert.ok(b, 'blok build ada');
  assert.deepEqual(b.win.target, ['portable']);
  assert.match(pkg.scripts['dist:win'], /--win portable --x64/);
  assert.match(b.portable.artifactName, /portable-x64/);
  const targets = JSON.stringify(b).toLowerCase();
  assert.ok(!targets.includes('"nsis"'), 'tanpa target NSIS');
  assert.ok(!targets.includes('"msi"'), 'tanpa target MSI');
});

test('tidak ada dependensi React/Vite/CDN pada fondasi', () => {
  const pkg = JSON.parse(read('package.json'));
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const banned of ['react', 'vite', 'vue', 'svelte', 'next']) {
    assert.ok(!(banned in allDeps), `${banned} tidak dipakai`);
  }
  const html = read('src/renderer/index.html');
  assert.ok(!/https?:\/\//.test(html.replace(/http-equiv/g, '')), 'HTML tidak memuat resource jarak jauh');
});

test('keamanan Electron dikonfigurasi pada main process', () => {
  const main = read('src/main/main.js');
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /mainWindow\.webContents\.setWindowOpenHandler\(\(\) => \(\{ action: 'deny' \}\)\)/);
  assert.match(main, /will-navigate/);
});

test('preload hanya mengekspos API terbatas via contextBridge', () => {
  const preload = read('src/preload/preload.cjs');
  assert.match(preload, /contextBridge\.exposeInMainWorld\('trs'/);
  assert.ok(!/require\(['"]fs['"]\)/.test(preload), 'preload tidak mengekspos fs');
});

test('CSP ketat ada di index.html', () => {
  const html = read('src/renderer/index.html');
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /default-src 'none'/);
  assert.match(html, /script-src 'self'/);
});

test('IPC membatasi channel terdaftar dan memvalidasi title window', async () => {
  // Simulasi handler validasi payload tanpa Electron: ekstrak aturan dari source.
  const main = read('src/main/main.js');
  assert.match(main, /ALLOWED_CHANNELS\s*=\s*new Set\(\['app:getVersion',\s*'app:getUserDataDir',\s*'document:open',\s*'document:save',\s*'window:setTitle'\]\)/);
  assert.match(main, /case 'window:setTitle':[\s\S]*?mainWindow\?\.setTitle\(title\)/);
});

test('aset renderer tersedia lokal (offline-safe)', () => {
  for (const f of ['src/renderer/index.html', 'src/renderer/renderer.js', 'src/renderer/app.css']) {
    assert.ok(fs.existsSync(path.join(root, f)), `${f} ada`);
  }
});
