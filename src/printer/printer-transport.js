import net from 'node:net';

export const DEFAULT_RAW_PRINTER_PORT = 9100;
export const DEFAULT_PRINTER_TIMEOUT_MS = 5000;
export const MAX_RAW_JOB_BYTES = 8 * 1024 * 1024;

export function validateRawPrinterTarget(host, port = DEFAULT_RAW_PRINTER_PORT) {
  if (typeof host !== 'string' || host.trim() !== host || host.length < 1 || host.length > 253 ||
      /[\s/\\]/.test(host) || host.includes('://')) {
    throw new TypeError('Alamat printer harus berupa hostname atau alamat IP, tanpa protokol.');
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new TypeError('Port printer harus berupa bilangan 1–65535.');
  }
  return { host, port };
}

export function normalizeRawJob(bytes) {
  if (!(bytes instanceof Uint8Array) && !Buffer.isBuffer(bytes) && !Array.isArray(bytes)) {
    throw new TypeError('Data cetak harus berupa byte array.');
  }
  if (bytes.length < 1 || bytes.length > MAX_RAW_JOB_BYTES) {
    throw new RangeError('Ukuran job cetak harus 1 byte sampai 8 MiB.');
  }
  if (Array.isArray(bytes) && bytes.some(byte => !Number.isInteger(byte) || byte < 0 || byte > 255)) {
    throw new TypeError('Byte cetak harus berupa bilangan 0–255.');
  }
  return Buffer.from(bytes);
}

export function printerErrorMessage(error) {
  const code = error?.code;
  if (code === 'ECONNREFUSED') return 'Printer menolak koneksi. Periksa alamat, port, dan status printer.';
  if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT') return 'Waktu koneksi ke printer habis. Periksa jaringan dan status printer.';
  if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH' || code === 'EADDRNOTAVAIL') return 'Printer tidak dapat dijangkau dari komputer ini.';
  if (code === 'EPIPE' || code === 'ECONNRESET') return 'Koneksi terputus sebelum job cetak selesai.';
  return 'Job cetak gagal: ' + String(error?.message || error || 'kesalahan tidak diketahui');
}

export function sendRawTcp(host, port, bytes, options = {}) {
  const target = validateRawPrinterTarget(host, port);
  const payload = normalizeRawJob(bytes);
  const timeoutMs = options.timeoutMs ?? DEFAULT_PRINTER_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60000) {
    return Promise.reject(new RangeError('Timeout harus 100–60000 ms.'));
  }
  const connect = options.connect ?? net.createConnection;
  return new Promise((resolve, reject) => {
    let settled = false;
    const socket = connect({ host: target.host, port: target.port });
    const finish = error => {
      if (settled) return;
      settled = true;
      socket.setTimeout?.(0);
      if (error) reject(Object.assign(new Error(printerErrorMessage(error)), { code: error.code || 'PRINT_FAILED' }));
      else resolve({ bytesSent: payload.length, host: target.host, port: target.port });
    };
    socket.setTimeout?.(timeoutMs);
    socket.once('connect', () => socket.end(payload, error => finish(error)));
    socket.once('timeout', () => {
      const error = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
      finish(error);
      socket.destroy();
    });
    socket.once('error', finish);
    socket.once('close', hadError => {
      if (hadError && !settled) finish(Object.assign(new Error('connection closed'), { code: 'ECONNRESET' }));
    });
  });
}
