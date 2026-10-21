import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  validateRawPrinterTarget, normalizeRawJob, printerErrorMessage, sendRawTcp
} from '../src/printer/printer-transport.js';

test('raw printer target accepts hostnames/IPs and validates port bounds', () => {
  assert.deepEqual(validateRawPrinterTarget('192.168.1.50', 9100), { host: '192.168.1.50', port: 9100 });
  assert.deepEqual(validateRawPrinterTarget('printer.local'), { host: 'printer.local', port: 9100 });
  for (const host of ['', ' printer', 'http://printer', 'printer/name', 'a'.repeat(254)]) {
    assert.throws(() => validateRawPrinterTarget(host), /Alamat printer/);
  }
  for (const port of [0, -1, 65536, 9100.5, '9100']) {
    assert.throws(() => validateRawPrinterTarget('printer.local', port), /Port printer/);
  }
});

test('raw jobs must contain 1 byte to 8 MiB and only valid byte values', () => {
  assert.deepEqual([...normalizeRawJob([0, 27, 64])], [0, 27, 64]);
  assert.throws(() => normalizeRawJob([]), /Ukuran job/);
  assert.throws(() => normalizeRawJob([256]), /Byte cetak/);
  assert.throws(() => normalizeRawJob('ESC/POS'), /byte array/);
});

test('printer errors map to actionable Indonesian messages', () => {
  assert.match(printerErrorMessage({ code: 'ECONNREFUSED' }), /menolak koneksi/);
  assert.match(printerErrorMessage({ code: 'ETIMEDOUT' }), /habis/);
  assert.match(printerErrorMessage({ code: 'ENETUNREACH' }), /tidak dapat dijangkau/);
});

test('raw TCP transport writes bytes and reports successful completion', async () => {
  class FakeSocket extends EventEmitter {
    setTimeout(value) { this.timeout = value; }
    end(bytes, callback) { this.bytes = Buffer.from(bytes); queueMicrotask(() => { callback?.(); this.emit('close', false); }); }
    destroy(error) { this.destroyed = true; if (error) this.emit('error', error); }
  }
  const socket = new FakeSocket();
  const result = await sendRawTcp('printer.local', 9100, Uint8Array.from([27, 64, 10]), { connect: () => { queueMicrotask(() => socket.emit('connect')); return socket; } });
  assert.deepEqual([...socket.bytes], [27, 64, 10]);
  assert.deepEqual(result, { bytesSent: 3, host: 'printer.local', port: 9100 });
});

test('raw TCP transport reports connection errors without leaking raw error text', async () => {
  class FakeSocket extends EventEmitter {
    setTimeout() {}
    destroy(error) { queueMicrotask(() => this.emit('error', error)); }
  }
  const socket = new FakeSocket();
  const pending = sendRawTcp('printer.local', 9100, [27, 64], { connect: () => { queueMicrotask(() => socket.emit('error', Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }))); return socket; } });
  await assert.rejects(pending, /Printer menolak koneksi/);
});
