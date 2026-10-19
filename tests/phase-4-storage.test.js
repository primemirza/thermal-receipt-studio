import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSampleDocument, validateDocument } from '../src/renderer/document-model.js';
import { createZip, readZip, serializeTrstudio, parseTrstudio } from '../src/main/trstudio-archive.js';

test('.trstudio round-trip mempertahankan model dokumen tanpa kehilangan data', () => {
  const original = createSampleDocument();
  original.title = 'Struk uji';
  original.blocks[0].text = 'TOKO UJI';
  const bytes = serializeTrstudio(original, new Date('2026-10-20T00:00:00.000Z'));
  const loaded = parseTrstudio(bytes, validateDocument);
  assert.deepEqual(loaded.document, original);
  assert.equal(loaded.manifest.app, 'thermal-receipt-studio');
  assert.equal(loaded.manifest.formatVersion, 1);
  const entries = readZip(bytes);
  assert.ok(entries['manifest.json']);
  assert.ok(entries['document.json']);
});

test('arsip ZIP menolak nama path traversal dan arsip terpotong', () => {
  assert.throws(() => createZip({ '../outside.txt': 'no' }), /tidak aman/);
  const bytes = serializeTrstudio(createSampleDocument());
  assert.throws(() => readZip(bytes.subarray(0, 10)), /Ukuran arsip tidak valid/);
  const broken = Buffer.from(bytes);
  broken[0] = 0;
  assert.throws(() => readZip(broken), /Header lokal ZIP rusak|Struktur ZIP tidak lengkap|Entri ZIP rusak/);
});

test('parser menolak manifest yang tidak cocok dan dokumen yang tidak valid', () => {
  const wrong = createZip({
    'manifest.json': JSON.stringify({ app: 'other', formatVersion: 1, document: 'document.json', assets: [] }),
    'document.json': JSON.stringify(createSampleDocument())
  });
  assert.throws(() => parseTrstudio(wrong, validateDocument), /Manifest/);
  const invalidDoc = createSampleDocument();
  invalidDoc.paperWidthMm = 76;
  assert.throws(() => parseTrstudio(serializeTrstudio(invalidDoc), validateDocument), /Lebar kertas/);
});

test('IPC file hanya membuka dialog, memvalidasi dokumen dan menyimpan atomik', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const main = fs.readFileSync(path.join(root, 'src/main/main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'src/preload/preload.cjs'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'src/renderer/renderer.js'), 'utf8');
  assert.match(main, /showOpenDialog/);
  assert.match(main, /showSaveDialog/);
  assert.match(main, /validateDocument\(document\)/);
  assert.match(main, /writeFileSync\(tempPath/);
  assert.match(main, /renameSync\(tempPath, filePath\)/);
  assert.match(preload, /openDocument/);
  assert.match(preload, /saveDocument/);
  for (const id of ['new-document-button', 'open-document-button', 'save-document-button', 'save-as-document-button']) {
    assert.ok(renderer.includes(id), 'renderer menghubungkan ' + id);
  }
});
