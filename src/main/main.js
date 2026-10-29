// Thermal Receipt Studio — main process (FASE 1: fondasi minimal)
import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { validateDocument } from '../renderer/document-model.js';
import { parseTrstudio, serializeTrstudio } from './trstudio-archive.js';
import { sendRawTcp } from '../printer/printer-transport.js';
import { buildThermalDriverHtml } from '../printer/driver-print.js';
import { openDatabase } from './db/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Keamanan dasar (wajib sesuai ADR/§9) ---
// Chromium menolak berjalan sebagai root tanpa --no-sandbox (kasus khusus runner Linux/root;
// pada Windows produksi pengguna tidak berjalan sebagai root). Deteksi dilakukan lewat argv
// karena pengecekan getuid() di dalam app ESM terbukti terlalu terlambat untuk check Chromium
// awal (lihat log smoke CI: FATAL electron_main_delegate.cc sebelum switch diterapkan).
if (typeof process.getuid === 'function' && process.getuid() === 0) {
  app.commandLine.appendSwitch('no-sandbox');
}
// Cegah Chromium background throttling agar jendela cetak melakukan full layout & painting
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-background-timer-throttling');

// Lokasi data pengguna terpisah dari lokasi aplikasi (aplikasi portable tidak boleh
// menulis ke direktorinya sendiri). Dipakai kembali oleh Fase 8 (SQLite/recovery).
function userDataDir() {
  return path.join(app.getPath('appData'), 'ThermalReceiptStudio');
}

let mainWindow = null;
const currentFiles = new Map();
const MAX_DOCUMENT_JSON_BYTES = 10 * 1024 * 1024;
let lastPrintJob = null;
let dbInstance = null;

export function getDb() {
  if (!dbInstance) {
    const dir = userDataDir();
    try { fs.mkdirSync(dir, { recursive: true }); } catch {}
    const dbPath = path.join(dir, 'studio.db');
    dbInstance = openDatabase(dbPath);
  }
  return dbInstance;
}

async function printViaDriver(thermalLayout, paperWidthMm, printerName) {
  // thermalLayout adalah objek plain { profile, operations } yang telah di-serialize di renderer.
  // Dirender menjadi HTML monospace agar output identik dengan jalur raw ESC/POS TCP.
  const html = buildThermalDriverHtml(thermalLayout, paperWidthMm);
  if (typeof printerName !== 'string' || printerName.length > 512) throw new TypeError('Nama printer tidak valid.');

  // Tulis HTML ke file sementara di folder temp agar Chromium dapat memuatnya secara utuh
  const tmpDir = path.join(app.getPath('temp'), 'trs-print');
  let tmpFile = null;
  try { fs.mkdirSync(tmpDir, { recursive: true }); } catch {}
  try {
    tmpFile = path.join(tmpDir, 'receipt-' + randomUUID() + '.html');
    fs.writeFileSync(tmpFile, html, 'utf8');
  } catch { tmpFile = null; }

  // Jendela cetak tersembunyi (hidden).
  // Catatan penting: JANGAN posisikan di luar batas desktop (seperti x:-99999) karena
  // Windows DWM / Chromium compositor akan mengabaikan rendering raster untuk koordinat out-of-bounds.
  const printWindow = new BrowserWindow({
    width: 480,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false, // Mencegah Chromium menonaktifkan rendering saat jendela hidden
      webSecurity: false,
    },
  });

  try {
    if (tmpFile) {
      await printWindow.loadFile(tmpFile);
    } else {
      await printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    }

    // Tunggu font, gambar ter-decode, dan frame selesai di-render
    await printWindow.webContents.executeJavaScript(`
      (async () => {
        if (document.fonts?.ready) await document.fonts.ready;
        await Promise.all(Array.from(document.images, img => img.decode().catch(() => {})));
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      })()
    `);

    // Jeda singkat memastikan raster paint buffer siap dikirim ke Windows print spooler
    await new Promise(r => setTimeout(r, 150));

    // Kirim job cetak ke Windows Print Spooler.
    // PENTING: Jangan mengirim custom pageSize mikron ke driver printer termal fisik Windows!
    // Driver printer termal fisik (POS-58, POS-80, Epson, Xprinter, dsb.) menolak custom DEVMODE
    // mikron yang tidak terdaftar di form printer, menyebabkan driver membuang konten dan hanya
    // mengeksekusi cut/feed ~1 cm kosong. Tanpa custom pageSize, driver menggunakan ukuran form
    // bawaan roll printer dan mencetak seluruh konten struk hingga selesai.
    const result = await new Promise((resolve, reject) => {
      const printOptions = {
        silent: true,
        printBackground: true,
        ...(printerName ? { deviceName: printerName } : {}),
        color: false, // Monokrom murni untuk printer termal
        margins: { marginType: 'none' },
        scaleFactor: 100,
      };

      printWindow.webContents.print(printOptions, (success, failureReason) => {
        if (success) {
          resolve({ success: true, printerName: printerName || 'default' });
        } else {
          // Fallback jika printerName spesifik tidak dapat diakses: coba ke default printer
          if (printerName) {
            const fallbackOptions = { ...printOptions };
            delete fallbackOptions.deviceName;
            printWindow.webContents.print(fallbackOptions, (fallbackSuccess, fallbackReason) => {
              if (fallbackSuccess) {
                resolve({ success: true, printerName: 'default' });
              } else {
                reject(new Error('Driver printer gagal mencetak: ' + String(failureReason || fallbackReason || 'alasan tidak tersedia')));
              }
            });
          } else {
            reject(new Error('Driver printer gagal mencetak: ' + String(failureReason || 'alasan tidak tersedia')));
          }
        }
      });
    });
    lastPrintJob = { mode: 'driver', thermalLayout, paperWidthMm, printerName };
    return result;
  } finally {
    if (!printWindow.isDestroyed()) printWindow.close();
    if (tmpFile) { try { fs.rmSync(tmpFile, { force: true }); } catch {} }
  }
}

function getAppIconPath() {
  const candidates = [
    path.join(__dirname, 'assets', 'thermal_receipt_studio.ico'),
    path.join(__dirname, 'assets', 'icon.ico'),
    path.join(__dirname, 'assets', 'thermal_receipt_studio.png'),
    path.join(__dirname, '../renderer/thermal_receipt_studio.png'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

function createWindow() {
  const iconPath = getAppIconPath();
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Thermal Receipt Studio',
    show: false,
    icon: iconPath,
    autoHideMenuBar: true,
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

  mainWindow.once('ready-to-show', () => {
    if (iconPath && fs.existsSync(iconPath)) {
      try { mainWindow.setIcon(iconPath); } catch {}
    }
    mainWindow.show();
  });

  // Blokir navigasi keluar & window baru (pertahanan berlapis).
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:')) e.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

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

  // --- IPC tervalidasi (API sangat terbatas pada Fase 1 & 8) ---
  const ALLOWED_CHANNELS = new Set([
    'app:getVersion', 'app:getUserDataDir', 'document:open', 'document:save', 'window:setTitle',
    'printer:list', 'printer:driver', 'printer:raw', 'printer:reprint',
    'prefs:getAll', 'prefs:set', 'printerProfile:get', 'printerProfile:save',
    'recentFiles:list', 'recovery:save', 'recovery:get', 'recovery:clear'
  ]);

  ipcMain.handle('trs:invoke', async (event, payload) => {
    // Payload divalidasi ketat; renderer tidak pernah memanggil channel secara bebas.
    if (typeof payload !== 'object' || payload === null) {
      return { ok: false, error: 'INVALID_PAYLOAD' };
    }
    const { channel, args } = payload;
    if (typeof channel !== 'string' || !ALLOWED_CHANNELS.has(channel)) {
      return { ok: false, error: 'CHANNEL_NOT_ALLOWED' };
    }
    const expectedArgs = ({
      'document:save': 2,
      'window:setTitle': 1,
      'printer:driver': 3,
      'printer:raw': 3,
      'prefs:set': 2,
      'printerProfile:save': 1,
      'recovery:save': 2,
    })[channel] ?? 0;
    if (!Array.isArray(args) || args.length !== expectedArgs) {
      return { ok: false, error: 'INVALID_ARGS' };
    }
    switch (channel) {
      case 'app:getVersion':
        return { ok: true, value: app.getVersion() };
      case 'printer:list': {
        try {
          const printers = await mainWindow?.webContents.getPrintersAsync();
          return { ok: true, value: (printers || []).map(printer => ({ name: printer.name, displayName: printer.displayName || printer.name, isDefault: Boolean(printer.isDefault), status: printer.status ?? 0 })) };
        } catch (err) { return { ok: false, error: 'PRINTER_ENUMERATION_FAILED', message: String(err?.message || err) }; }
      }
      case 'printer:driver': {
        try {
          const [receiptMarkup, paperWidthMm, printerName] = args;
          const result = await printViaDriver(receiptMarkup, paperWidthMm, printerName);
          return { ok: true, value: result };
        } catch (err) { return { ok: false, error: 'DRIVER_PRINT_FAILED', message: String(err?.message || err) }; }
      }
      case 'printer:raw': {
        try {
          const [bytes, host, port] = args;
          const result = await sendRawTcp(host, port, bytes);
          lastPrintJob = { mode: 'raw', bytes: Array.from(bytes), host, port };
          return { ok: true, value: result };
        } catch (err) { return { ok: false, error: err?.code || 'RAW_PRINT_FAILED', message: String(err?.message || err) }; }
      }
      case 'printer:reprint': {
        if (!lastPrintJob) return { ok: false, error: 'NO_PREVIOUS_PRINT', message: 'Belum ada job cetak untuk dicetak ulang.' };
        try {
          if (lastPrintJob.mode === 'raw') {
            const result = await sendRawTcp(lastPrintJob.host, lastPrintJob.port, lastPrintJob.bytes);
            return { ok: true, value: result };
          }
          const result = await printViaDriver(lastPrintJob.receiptMarkup, lastPrintJob.paperWidthMm, lastPrintJob.printerName);
          return { ok: true, value: result };
        } catch (err) { return { ok: false, error: 'REPRINT_FAILED', message: String(err?.message || err) }; }
      }
      case 'app:getUserDataDir': {
        const dir = userDataDir();
        try { fs.mkdirSync(dir, { recursive: true }); } catch { /* dilaporkan */ }
        return { ok: true, value: dir };
      }

      case 'window:setTitle': {
        const [title] = args;
        if (typeof title !== 'string' || title.length > 512 || !/^Thermal Receipt Studio(?: - .+)?$/.test(title)) {
          return { ok: false, error: 'INVALID_TITLE' };
        }
        mainWindow?.setTitle(title);
        return { ok: true, value: true };
      }

      case 'document:open': {
        const picked = await dialog.showOpenDialog(mainWindow, { title: 'Buka dokumen struk', properties: ['openFile'], filters: [{ name: 'Thermal Receipt Studio', extensions: ['trstudio'] }] });
        if (picked.canceled || !picked.filePaths[0]) return { ok: true, value: null };
        try {
          const filePath = picked.filePaths[0];
          const parsed = parseTrstudio(fs.readFileSync(filePath), validateDocument);
          currentFiles.set(event.sender.id, filePath);
          try {
            getDb().addRecentFile(filePath, parsed.document.title || 'Tanpa Judul', parsed.document.paperWidthMm || 58);
          } catch {}
          return { ok: true, value: { document: parsed.document, path: filePath } };
        } catch (err) { return { ok: false, error: 'FILE_INVALID', message: String(err?.message || err) }; }
      }
      case 'document:save': {
        const [document, mode] = args;
        try {
          validateDocument(document);
          if (Buffer.byteLength(JSON.stringify(document), 'utf8') > MAX_DOCUMENT_JSON_BYTES) return { ok: false, error: 'DOCUMENT_TOO_LARGE' };
          if (!['save', 'saveAs'].includes(mode)) return { ok: false, error: 'INVALID_ARGS' };
          let filePath = mode === 'saveAs' ? null : currentFiles.get(event.sender.id);
          if (!filePath) {
            const picked = await dialog.showSaveDialog(mainWindow, { title: mode === 'saveAs' ? 'Simpan dokumen sebagai' : 'Simpan dokumen struk', defaultPath: 'Struk baru.trstudio', buttonLabel: 'Simpan', filters: [{ name: 'Thermal Receipt Studio', extensions: ['trstudio'] }] });
            if (picked.canceled || !picked.filePath) return { ok: true, value: null };
            filePath = picked.filePath.toLowerCase().endsWith('.trstudio') ? picked.filePath : picked.filePath + '.trstudio';
          }
          const bytes = serializeTrstudio(document);
          const tempPath = filePath + '.' + randomUUID() + '.tmp';
          try { fs.writeFileSync(tempPath, bytes, { flag: 'wx' }); fs.renameSync(tempPath, filePath); }
          catch (err) { try { fs.rmSync(tempPath, { force: true }); } catch {} throw err; }
          currentFiles.set(event.sender.id, filePath);
          try {
            getDb().addRecentFile(filePath, document.title || 'Tanpa Judul', document.paperWidthMm || 58);
            getDb().clearRecoverySnapshot();
          } catch {}
          return { ok: true, value: { path: filePath } };
        } catch (err) { return { ok: false, error: 'SAVE_FAILED', message: String(err?.message || err) }; }
      }
      case 'prefs:getAll': {
        try {
          return { ok: true, value: getDb().getAllPreferences() };
        } catch (err) { return { ok: false, error: 'DB_ERROR', message: String(err?.message || err) }; }
      }
      case 'prefs:set': {
        const [key, value] = args;
        try {
          getDb().setPreference(key, value);
          return { ok: true, value: true };
        } catch (err) { return { ok: false, error: 'DB_ERROR', message: String(err?.message || err) }; }
      }
      case 'printerProfile:get': {
        try {
          return { ok: true, value: getDb().getPrinterProfile('default') };
        } catch (err) { return { ok: false, error: 'DB_ERROR', message: String(err?.message || err) }; }
      }
      case 'printerProfile:save': {
        const [profile] = args;
        try {
          getDb().savePrinterProfile(profile);
          return { ok: true, value: true };
        } catch (err) { return { ok: false, error: 'DB_ERROR', message: String(err?.message || err) }; }
      }
      case 'recentFiles:list': {
        try {
          return { ok: true, value: getDb().getRecentFiles(10) };
        } catch (err) { return { ok: false, error: 'DB_ERROR', message: String(err?.message || err) }; }
      }
      case 'recovery:save': {
        const [doc, filePath] = args;
        try {
          getDb().saveRecoverySnapshot(doc, filePath);
          return { ok: true, value: true };
        } catch (err) { return { ok: false, error: 'DB_ERROR', message: String(err?.message || err) }; }
      }
      case 'recovery:get': {
        try {
          return { ok: true, value: getDb().getRecoverySnapshot() };
        } catch (err) { return { ok: false, error: 'DB_ERROR', message: String(err?.message || err) }; }
      }
      case 'recovery:clear': {
        try {
          getDb().clearRecoverySnapshot();
          return { ok: true, value: true };
        } catch (err) { return { ok: false, error: 'DB_ERROR', message: String(err?.message || err) }; }
      }
      default:
        return { ok: false, error: 'UNHANDLED' };
    }
  });

  app.whenReady().then(() => {
    // Hapus menu bar bawaan Electron; hotkeys (Ctrl+S/Z/Y/Shift+L/E/R) ditangani di renderer.
    Menu.setApplicationMenu(null);
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

// --- Smoke test CI: verify real renderer event flow, including double-click editing. ---
if (process.env.TRS_SMOKE === '1') {
  app.whenReady().then(() => {
    setTimeout(async () => {
      const wins = BrowserWindow.getAllWindows();
      if (wins.length !== 1 || wins[0].isDestroyed()) {
        console.error('TRS_SMOKE_FAIL no usable window');
        app.exit(1);
        return;
      }
      try {
        const result = await wins[0].webContents.executeJavaScript(`(() => {
          const target = document.querySelector('#design-paper [data-block-id="b-store"] [data-field="text"]');
          if (!target) return { ok: false, reason: 'editable sample text not found' };
          const paper = document.querySelector('#design-paper');
          const diagnostics = {
            connectedBefore: target.isConnected,
            targetTag: target.tagName,
            field: target.dataset.field,
            blockId: target.closest('[data-block-id]')?.dataset.blockId,
            designPaperFound: Boolean(paper),
            clickEvents: [],
            canvasReplacementsAfterFirstClick: 0,
            canvasReplacementStack: ''
          };
          const originalReplaceChildren = paper.replaceChildren.bind(paper);
          let canvasReplacementCount = 0;
          paper.replaceChildren = (...children) => {
            canvasReplacementCount += 1;
            diagnostics.canvasReplacementStack = new Error('design-paper replaced').stack;
            return originalReplaceChildren(...children);
          };
          const captureClick = event => {
            diagnostics.clickEvents.push({
              detail: event.detail,
              sameTarget: event.target === target,
              closestBlockId: event.target.closest?.('[data-block-id]')?.dataset.blockId || null
            });
          };
          document.addEventListener('click', captureClick, true);
          const dispatch = (type, detail) => target.dispatchEvent(new MouseEvent(type, {
            bubbles: true, cancelable: true, detail, view: window
          }));
          dispatch('click', 1);
          const attachedAfterFirstClick = target.isConnected;
          diagnostics.canvasReplacementsAfterFirstClick = canvasReplacementCount;
          dispatch('click', 2);
          const attachedAfterSecondClick = target.isConnected;
          dispatch('dblclick', 2);
          const editable = target.getAttribute('contenteditable') === 'true';
          const focused = document.activeElement === target;
          if (editable) {
            target.textContent = '__TRS_INLINE_EDIT_SMOKE__';
            target.dispatchEvent(new InputEvent('input', {
              bubbles: true, inputType: 'insertText', data: '__TRS_INLINE_EDIT_SMOKE__'
            }));
          }
          let preview = document.querySelector('#receipt-preview');
          const committedWhileEditing = preview?.textContent.includes('__TRS_INLINE_EDIT_SMOKE__') === true;
          // Simulate switching to another desktop window: blur alone must not exit edit mode.
          window.dispatchEvent(new Event('blur'));
          target.blur();
          const staysActiveAfterWindowBlur = target.getAttribute('contenteditable') === 'true';
          target.focus();
          target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
          const exitsOnEnter = target.getAttribute('contenteditable') === 'false';
          // Begin a second edit session and verify that an outside pointer action ends it.
          dispatch('click', 1);
          dispatch('click', 2);
          dispatch('dblclick', 2);
          const secondEditable = target.getAttribute('contenteditable') === 'true';
          if (secondEditable) {
            target.textContent = '__TRS_OUTSIDE_CLICK_SMOKE__';
            target.dispatchEvent(new InputEvent('input', {
              bubbles: true, inputType: 'insertText', data: '__TRS_OUTSIDE_CLICK_SMOKE__'
            }));
          }
          const outsideButton = document.querySelector('#toggle-guides');
          outsideButton?.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse'
          }));
          const exitsOnOutsideClick = target.getAttribute('contenteditable') === 'false';
          preview = document.querySelector('#receipt-preview');
          const committedAfterOutsideClick = preview?.textContent.includes('__TRS_OUTSIDE_CLICK_SMOKE__') === true;
          const modelStatus = document.querySelector('#status-text')?.textContent || '';
          const previewText = (preview?.textContent || '').slice(0, 500);
          document.removeEventListener('click', captureClick, true);
          return {
            ok: attachedAfterFirstClick && attachedAfterSecondClick && editable && focused &&
              committedWhileEditing && staysActiveAfterWindowBlur && exitsOnEnter &&
              secondEditable && exitsOnOutsideClick && committedAfterOutsideClick && canvasReplacementCount === 0,
            attachedAfterFirstClick, attachedAfterSecondClick, editable, focused, committedWhileEditing,
            staysActiveAfterWindowBlur, exitsOnEnter, secondEditable, exitsOnOutsideClick,
            committedAfterOutsideClick, modelStatus, previewText, ...diagnostics
          };
        })()`);
        if (!result?.ok) {
          console.error('TRS_SMOKE_FAIL inline-edit=' + JSON.stringify(result));
          app.exit(1);
          return;
        }
        console.log('TRS_SMOKE_OK window-title=' + JSON.stringify(wins[0].getTitle()));
        console.log('TRS_SMOKE_INLINE_EDIT_OK ' + JSON.stringify(result));
        app.exit(0);
      } catch (error) {
        console.error('TRS_SMOKE_FAIL runtime-edit-check=' + String(error?.stack || error));
        app.exit(1);
      }
    }, 4000);
  });
}