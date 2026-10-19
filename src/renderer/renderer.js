// Fase 2: UI editor/preview awal. Data struk contoh tetap lokal; model dokumen penuh masuk Fase 3.
const statusText = document.getElementById('status-text');
const statusVersion = document.getElementById('status-version');
const appMeta = document.getElementById('app-meta');
const paperButtons = [...document.querySelectorAll('[data-paper]')];
const designPaper = document.getElementById('design-paper');
const receiptPreview = document.getElementById('receipt-preview');
const previewStage = document.getElementById('preview-stage');
const zoomValue = document.getElementById('zoom-value');
const zoomStatus = document.getElementById('zoom-status');
const paperChip = document.getElementById('paper-chip');
const canvasWidthLabel = document.getElementById('canvas-width-label');
const previewDimensions = document.getElementById('preview-dimensions');
const previewStatus = document.getElementById('preview-status');
const guideButton = document.getElementById('toggle-guides');

const sampleReceipt = Object.freeze({
  store: 'WARUNG CONTOH',
  items: [
    { name: 'Teh hangat', price: 5000 },
    { name: 'Nasi goreng', price: 15000 },
  ],
  footer: 'Terima kasih!',
});
const state = { paper: 58, zoom: 100, guides: false };
const currency = new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
});

function setStatus(message) {
  statusText.textContent = message;
}

function renderReceipt() {
  const columns = state.paper === 58 ? 32 : 42;
  const money = (amount) => currency.format(amount).replace('IDR', 'Rp').replace(/\u00a0/g, ' ').trim();
  const lines = [];
  const line = (className, children) => {
    const element = document.createElement('div');
    element.className = 'receipt-line' + (className ? ' ' + className : '');
    for (const child of children) element.append(child);
    return element;
  };
  const text = (value, className = '') => {
    const node = document.createElement('span');
    if (className) node.className = className;
    node.textContent = value;
    return node;
  };
  const strong = (value, className = '') => {
    const node = document.createElement('b');
    if (className) node.className = className;
    node.textContent = value;
    return node;
  };
  lines.push(line('center', [strong(sampleReceipt.store)]));
  lines.push(line('rule', [text('-'.repeat(columns))]));
  let total = 0;
  for (const item of sampleReceipt.items) {
    total += item.price;
    lines.push(line('', [text(item.name), text(money(item.price), 'right')]));
  }
  lines.push(line('rule', [text('-'.repeat(columns))]));
  lines.push(line('', [strong('Total'), strong(money(total), 'right')]));
  lines.push(line('center receipt-thanks', [text(sampleReceipt.footer)]));
  receiptPreview.replaceChildren(...lines);
  receiptPreview.classList.remove('zoom-60', 'zoom-70', 'zoom-80', 'zoom-90', 'zoom-100', 'zoom-110', 'zoom-120', 'zoom-130', 'zoom-140', 'zoom-150');
  receiptPreview.classList.add('zoom-' + state.zoom);
  receiptPreview.dataset.paper = String(state.paper);
  designPaper.dataset.paper = String(state.paper);
  previewStage.classList.toggle('show-guides', state.guides);
  document.getElementById('editor-surface').classList.toggle('show-guides', state.guides);
  paperButtons.forEach((button) => {
    const active = Number(button.dataset.paper) === state.paper;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  zoomValue.textContent = state.zoom + '%';
  zoomStatus.textContent = 'Zoom ' + state.zoom + '%';
  paperChip.textContent = state.paper + ' mm';
  canvasWidthLabel.textContent = state.paper + ' mm';
  previewDimensions.textContent = state.paper + ' mm · ' + columns + ' kolom';
  previewStatus.textContent = 'Preview diperbarui';
}

function setPaper(width) {
  if (width !== 58 && width !== 80) return;
  state.paper = width;
  renderReceipt();
  setStatus('Lebar kertas diubah ke ' + width + ' mm.');
}

function setZoom(value) {
  state.zoom = Math.min(150, Math.max(60, value));
  renderReceipt();
  setStatus('Zoom preview ' + state.zoom + '%.');
}

paperButtons.forEach((button) => {
  button.addEventListener('click', () => setPaper(Number(button.dataset.paper)));
});
document.getElementById('zoom-out').addEventListener('click', () => setZoom(state.zoom - 10));
document.getElementById('zoom-in').addEventListener('click', () => setZoom(state.zoom + 10));
document.getElementById('zoom-fit').addEventListener('click', () => setZoom(100));
guideButton.addEventListener('click', () => {
  state.guides = !state.guides;
  guideButton.setAttribute('aria-pressed', String(state.guides));
  guideButton.textContent = 'Panduan: ' + (state.guides ? 'aktif' : 'mati');
  renderReceipt();
  setStatus(state.guides ? 'Panduan ukuran ditampilkan.' : 'Panduan ukuran disembunyikan.');
});

async function boot() {
  renderReceipt();
  try {
    const ver = await window.trs.getVersion();
    if (ver.ok) {
      const label = 'v' + ver.value;
      statusVersion.textContent = label;
      appMeta.textContent = label;
    }
    const dir = await window.trs.getUserDataDir();
    if (dir.ok) console.info('User data dir:', dir.value);
    setStatus('Siap · bekerja offline');
  } catch (err) {
    console.error(err);
    setStatus('UI siap; metadata aplikasi tidak tersedia.');
  }
}
boot();
