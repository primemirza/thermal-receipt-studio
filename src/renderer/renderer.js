// Renderer — ES module murni. Hanya memakai window.trs dari preload.
const statusText = document.getElementById('status-text');
const statusVersion = document.getElementById('status-version');
const appMeta = document.getElementById('app-meta');

function setStatus(msg) { statusText.textContent = msg; }

async function boot() {
  setStatus('Memuat…');
  const ver = await window.trs.getVersion();
  const dir = await window.trs.getUserDataDir();
  if (ver.ok) {
    statusVersion.textContent = 'v' + ver.value;
    appMeta.textContent = 'v' + ver.value;
  } else {
    statusVersion.textContent = 'versi tidak tersedia';
  }
  if (dir.ok) {
    console.info('User data dir:', dir.value);
  }
  setStatus('Fondasi siap — Thermal Receipt Studio berjalan offline.');
}

boot().catch((err) => {
  console.error(err);
  setStatus('Gagal memuat fondasi: ' + err.message);
});
