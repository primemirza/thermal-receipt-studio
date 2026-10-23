// Preload API — CommonJS (preload script), contextIsolation aktif.
// Mengekspos API SANGAT TERBATAS; renderer tidak pernah menyentuh IPC mentah.
const { contextBridge, ipcRenderer } = require('electron');

async function invoke(channel, args = []) {
  // Validasi ringan di sisi preload; validasi otoritatif ada di main process.
  if (typeof channel !== 'string') return { ok: false, error: 'INVALID_CHANNEL' };
  try {
    return await ipcRenderer.invoke('trs:invoke', { channel, args });
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

contextBridge.exposeInMainWorld('trs', {
  getVersion: () => invoke('app:getVersion'),
  getUserDataDir: () => invoke('app:getUserDataDir'),
  openDocument: () => invoke('document:open'),
  saveDocument: (document, mode = 'save') => invoke('document:save', [document, mode]),
  setWindowTitle: (title) => invoke('window:setTitle', [title]),
  listPrinters: () => invoke('printer:list'),
  printViaDriver: (receiptMarkup, paperWidthMm, printerName = '') => invoke('printer:driver', [receiptMarkup, paperWidthMm, printerName]),
  printRawTcp: (bytes, host, port = 9100) => invoke('printer:raw', [Array.from(bytes), host, port]),
  reprintLastJob: () => invoke('printer:reprint'),
  getPreferences: () => invoke('prefs:getAll'),
  setPreference: (key, value) => invoke('prefs:set', [key, value]),
  getPrinterProfile: () => invoke('printerProfile:get'),
  savePrinterProfile: (profile) => invoke('printerProfile:save', [profile]),
  getRecentFiles: () => invoke('recentFiles:list'),
  saveRecoverySnapshot: (document, filePath = null) => invoke('recovery:save', [document, filePath]),
  getRecoverySnapshot: () => invoke('recovery:get'),
  clearRecoverySnapshot: () => invoke('recovery:clear'),
});
