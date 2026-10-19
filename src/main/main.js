// Thermal Receipt Studio — main process (FASE 1: fondasi minimal)
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { validateDocument } from '../renderer/document-model.js';
import { parseTrstudio, serializeTrstudio } from './trstudio-archive.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Keamanan dasar (wajib sesuai ADR/§9) ---
// Chromium menolak berjalan sebagai root tanpa --no-sandbox (kasus khusus runner Linux/root;
// pada Windows produksi pengguna tidak berjalan sebagai root). Deteksi dilakukan lewat argv
// karena pengecekan getuid() di dalam app ESM terbukti terlalu terlambat untuk check Chromium
// awal (lihat log smoke CI: FATAL electron_main_delegate.cc sebelum switch diterapkan).
if (typeof process.getuid === 'function' && process.getuid() === 0) {
  app.commandLine.appendSwitch('no-sandbox');
}

// Lokasi data pengguna terpisah dari lokasi aplikasi (aplikasi portable tidak boleh
// menulis ke direktorinya sendiri). Dipakai kembali oleh Fase 8 (SQLite/recovery).
function userDataDir() {
  return path.join(app.getPath('appData'), 'ThermalReceiptStudio');
}

let mainWindow = null;
const currentFiles = new Map();
const MAX_DOCUMENT_JSON_BYTES = 10 * 1024 * 1024;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Thermal Receipt Studio',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // Renderer diisolasi; preload CJS kecil berjalan dengan require electron terbatas.
      // Catatan: `sandbox:false` diperlukan agar preload dapat memakai ipcRenderer via require
      // pada Electron modern tanpa memaparkan Node API ke halaman web. Permukaan API tetap
      // hanya `window.trs` (dua fungsi) yang didefinisikan contextBridge.
      sandbox: false,
      webSecurity: true,
      spellcheck: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Blokir navigasi keluar & window baru (pertahanan berlapis).
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:')) e.preventDefault();
  });
  mainWindow.setWindowOpenHandler(() => ({ action: 'deny' }));

  mainWindow.on('closed', () => { mainWindow = null; });
}

// Single instance
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // --- IPC tervalidasi (API sangat terbatas pada Fase 1) ---
  const ALLOWED_CHANNELS = new Set(['app:getVersion', 'app:getUserDataDir', 'document:open', 'document:save']);

  ipcMain.handle('trs:invoke', async (event, payload) => {
    // Payload divalidasi ketat; renderer tidak pernah memanggil channel secara bebas.
    if (typeof payload !== 'object' || payload === null) {
      return { ok: false, error: 'INVALID_PAYLOAD' };
    }
    const { channel, args } = payload;
    if (typeof channel !== 'string' || !ALLOWED_CHANNELS.has(channel)) {
      return { ok: false, error: 'CHANNEL_NOT_ALLOWED' };
    }
    if (!Array.isArray(args) || args.length !== 0) {
      return { ok: false, error: 'INVALID_ARGS' };
    }
    switch (channel) {
      case 'app:getVersion':
        return { ok: true, value: app.getVersion() };
      case 'app:getUserDataDir': {
        const dir = userDataDir();
        try { fs.mkdirSync(dir, { recursive: true }); } catch { /* dilaporkan */ }
        return { ok: true, value: dir };
      }
      default:
        return { ok: false, error: 'UNHANDLED' };
    }
  });

  app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

// --- Mode smoke untuk CI (TRS_SMOKE=1): buka jendela, verifikasi, lalu keluar dengan kode 0 ---
if (process.env.TRS_SMOKE === '1') {
  app.whenReady().then(() => {
    setTimeout(() => {
      const wins = BrowserWindow.getAllWindows();
      if (wins.length === 1 && !wins[0].isDestroyed()) {
        console.log('TRS_SMOKE_OK window-title=' + JSON.stringify(wins[0].getTitle()));
        app.exit(0);
      } else {
        console.error('TRS_SMOKE_FAIL no usable window');
        app.exit(1);
      }
    }, 4000);
  });
}
