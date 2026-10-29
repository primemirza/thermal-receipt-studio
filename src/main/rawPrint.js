import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { app } from 'electron';

function scriptPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', 'src', 'main', 'printRaw.ps1');
  }
  return path.join(__dirname, 'printRaw.ps1');
}

function tempFilePath() {
  return path.join(app.getPath('temp'), `thermal-receipt-studio-escpos-${Date.now()}.bin`);
}

export function printRawBuffer({ printerName, buffer }) {
  if (!printerName) return Promise.reject(new Error('PrinterName kosong'));
  if (!Buffer.isBuffer(buffer)) return Promise.reject(new Error('Buffer ESC/POS tidak valid'));

  const filePath = tempFilePath();
  fs.writeFileSync(filePath, buffer);

  const psArgs = [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    scriptPath(),
    '-PrinterName',
    printerName,
    '-FilePath',
    filePath,
  ];

  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', psArgs, { windowsHide: true });

    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d.toString()));

    child.on('error', (err) => {
      try { fs.unlinkSync(filePath); } catch {}
      reject(err);
    });

    child.on('close', (code) => {
      try { fs.unlinkSync(filePath); } catch {}

      if (code === 0) return resolve();
      reject(new Error(stderr || `PowerShell gagal (exit code ${code})`));
    });
  });
}
