// Bootstrap CommonJS — entry point `main` package.json.
// Alasan: Chromium melakukan check "root tanpa --no-sandbox" SEBELUM modul ESM user
// dieksekusi, sehingga appendSwitch() di main.js (ESM) terlalu terlambat pada runner
// Linux/root (mis. container workspace). Pada Windows produksi (non-root) tidak ada
// dampak; switch hanya ditambahkan bila uid==0 atau TRS_FORCE_NO_SANDBOX=1.
if (typeof process.getuid === 'function' && process.getuid() === 0) {
  if (!process.argv.includes('--no-sandbox')) {
    process.argv.push('--no-sandbox');
  }
}
if (process.env.TRS_FORCE_NO_SANDBOX === '1' && !process.argv.includes('--no-sandbox')) {
  process.argv.push('--no-sandbox');
}
import('./main.js').catch((err) => {
  console.error('TRS_BOOTSTRAP_FAIL', err);
  process.exit(1);
});
