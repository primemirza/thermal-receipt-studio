import test from 'node:test';
import assert from 'node:assert/strict';
import { createSampleDocument } from '../src/renderer/document-model.js';
import { createThermalLayout, createThermalProfile, wrapText } from '../src/layout/thermal-layout.js';
import { encodeThermalLayout } from '../src/encoder/receipt-printer-encoder.js';

class FakeEncoder {
  constructor(options) { this.options = options; this.calls = []; FakeEncoder.last = this; }
  initialize() { this.calls.push(['initialize']); return this; }
  bold(value) { this.calls.push(['bold', value]); return this; }
  italic(value) { this.calls.push(['italic', value]); return this; }
  underline(value) { this.calls.push(['underline', value]); return this; }
  align(value) { this.calls.push(['align', value]); return this; }
  line(value) { this.calls.push(['line', value]); return this; }
  newline() { this.calls.push(['newline']); return this; }
  qrcode(value, options) { this.calls.push(['qrcode', value, options]); return this; }
  barcode(value, type, options) { this.calls.push(['barcode', value, type, options]); return this; }
  image(value, options) { this.calls.push(['image', value, options]); return this; }
  cut(value) { this.calls.push(['cut', value]); return this; }
  encode() { this.calls.push(['encode']); return Uint8Array.from([27, 64, 10]); }
}

test('profiles expose deterministic 58 mm and 80 mm column widths', () => {
  assert.equal(createThermalProfile(58).columns, 32);
  assert.equal(createThermalProfile(80).columns, 48);
  assert.equal(createThermalProfile(58, { margins: { left: 12, right: 24 } }).effectiveColumns, 29);
  assert.throws(() => createThermalProfile(70), /58 atau 80/);
});

test('wrapText wraps words and hard-wraps long tokens without losing content', () => {
  assert.deepEqual(wrapText('Nasi goreng spesial', 8), ['Nasi', 'goreng', 'spesial']);
  assert.deepEqual(wrapText('ABCDEFGHIJ', 4), ['ABCD', 'EFGH', 'IJ']);
  assert.deepEqual(wrapText('a\nb', 4), ['a', 'b']);
});

test('layout uses document paper width, explicit totals, nested sections and text styles', () => {
  const doc = createSampleDocument();
  doc.paperWidthMm = 58;
  doc.blocks = [
    { id: 'section', type: 'section', name: 'Header', children: [
      { id: 'heading', type: 'text', text: 'WARUNG CONTOH', align: 'center', bold: true },
      { id: 'item', type: 'item', name: 'Nasi goreng', price: 15000 },
      { id: 'total', type: 'total', label: 'Total', amount: 20000, bold: true }
    ] }
  ];
  const layout = createThermalLayout(doc, { feedBeforeCut: 2, cut: true });
  assert.equal(layout.profile.effectiveColumns, 32);
  assert.deepEqual(layout.operations.filter(item => item.type === 'text').map(item => item.text), [
    'WARUNG CONTOH',
    'Nasi goreng'.padEnd(25) + ' 15.000',
    'Total'.padEnd(25) + ' 20.000'
  ]);
  assert.equal(layout.operations.at(-2).type, 'feed');
  assert.deepEqual(layout.operations.at(-1), { type: 'cut', mode: 'full' });
});

test('layout covers rules, spacers, tables, columns, image, QR and barcode objects', () => {
  const doc = createSampleDocument();
  doc.blocks = [
    { id: 'rule', type: 'rule', style: 'double', character: '=' },
    { id: 'space', type: 'spacer', height: 2 },
    { id: 'table', type: 'table', headers: ['Qty', 'Item'], rows: [['2', 'Teh']], cellAlignments: [['right', 'left'], ['right', 'left']] },
    { id: 'columns', type: 'columns', columns: ['Kiri', 'Kanan'], columnAlignments: ['left', 'right'] },
    { id: 'image', type: 'image', dataUrl: 'data:image/png;base64,AA==', width: 64 },
    { id: 'qr', type: 'qrcode', value: 'https://example.test' },
    { id: 'barcode', type: 'barcode', value: '123456' }
  ];
  const layout = createThermalLayout(doc);
  assert.deepEqual(layout.operations.map(item => item.type), ['rule', 'feed', 'text', 'text', 'text', 'image', 'qrcode', 'barcode']);
  assert.equal(layout.operations[0].character, '=');
  assert.equal(layout.operations[1].lines, 2);
  assert.equal(layout.operations[5].dataUrl, 'data:image/png;base64,AA==');
});

test('encoder adapter maps layout operations to documented encoder methods', async () => {
  const layout = {
    profile: { columns: 32, effectiveColumns: 32 },
    operations: [
      { type: 'text', text: 'Hello', align: 'center', bold: true, italic: false, underline: false },
      { type: 'rule', character: '-', width: 32 },
      { type: 'feed', lines: 2 },
      { type: 'qrcode', value: 'qr' },
      { type: 'barcode', value: '123', symbology: 'code128' },
      { type: 'image', dataUrl: 'data:image/png;base64,AA==', width: 64 },
      { type: 'cut', mode: 'partial' }
    ]
  };
  const result = await encodeThermalLayout(layout, FakeEncoder, { resolveImage: dataUrl => ({ dataUrl }) });
  assert.deepEqual(Array.from(result), [27, 64, 10]);
  assert.deepEqual(FakeEncoder.last.options.columns, 32);
  assert.deepEqual(FakeEncoder.last.calls.filter(call => ['line', 'qrcode', 'barcode', 'image', 'cut'].includes(call[0])).map(call => call[0]), [
    'line', 'line', 'qrcode', 'barcode', 'image', 'cut'
  ]);
  assert.equal(FakeEncoder.last.calls.filter(call => call[0] === 'newline').length, 5);
});

test('encoder adapter requires image resolver and rejects unknown operations', async () => {
  await assert.rejects(() => encodeThermalLayout({
    profile: { columns: 32, effectiveColumns: 32 },
    operations: [{ type: 'image', dataUrl: 'data:image/png;base64,AA==', width: 32 }]
  }, FakeEncoder), /resolveImage/);
  await assert.rejects(() => encodeThermalLayout({
    profile: { columns: 32, effectiveColumns: 32 },
    operations: [{ type: 'unknown' }]
  }, FakeEncoder), /tidak didukung encoder/);
});


test('vendored ReceiptPrinterEncoder v4 produces a real ESC/POS byte stream', async () => {
  // The browser bundle references the platform ImageData constructor at module initialization.
  // Electron renderer provides it natively; Node unit tests use this minimal import-time polyfill.
  globalThis.ImageData ??= class ImageData {
    constructor(dataOrWidth, widthOrHeight, height) {
      if (typeof dataOrWidth === 'number') {
        this.width = dataOrWidth;
        this.height = widthOrHeight;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
      } else {
        this.data = dataOrWidth;
        this.width = widthOrHeight;
        this.height = height;
      }
    }
  };
  const { default: ReceiptPrinterEncoder } = await import('../src/renderer/vendor/receipt-printer-encoder.mjs');
  const layout = {
    profile: { columns: 32, effectiveColumns: 32 },
    operations: [
      { type: 'text', text: 'THERMAL RECEIPT', align: 'center', bold: true, italic: false, underline: false },
      { type: 'rule', character: '-', width: 32 },
      { type: 'text', text: 'Total                 20.000', align: 'left', bold: true, italic: false, underline: false },
      { type: 'qrcode', value: 'https://example.test' },
      { type: 'barcode', value: '123456', symbology: 'code128' },
      { type: 'cut', mode: 'partial' }
    ]
  };
  const bytes = await encodeThermalLayout(layout, ReceiptPrinterEncoder);
  assert.ok(bytes instanceof Uint8Array);
  assert.ok(bytes.length > 10);
  assert.deepEqual(Array.from(bytes.slice(0, 2)), [0x1b, 0x40]);
});
