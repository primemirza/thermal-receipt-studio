const ALIGNMENTS = new Set(['left', 'center', 'right']);

/**
 * ESC 3 n: Atur jarak antar baris ke n dots.
 * Gunakan nilai 0 (rapat) sebelum gambar raster agar tidak ada spasi putih berlebih
 * di atas/bawah gambar yang terjadi akibat line-spacing default printer (≈ 30 dots).
 */
const ESC_LINE_SPACING_TIGHT = [0x1b, 0x33, 0x00]; // ESC 3 0  → 0 dots

/**
 * ESC 2: Kembalikan jarak antar baris ke nilai bawaan printer (~1/6 inch ≈ 30 dots).
 * Wajib dipanggil setelah blok gambar agar teks berikutnya tidak bertumpuk.
 */
const ESC_LINE_SPACING_DEFAULT = [0x1b, 0x32]; // ESC 2

function setTextStyle(encoder, operation) {
  if (typeof encoder.bold === 'function') encoder.bold(operation.bold === true);
  if (typeof encoder.italic === 'function') encoder.italic(operation.italic === true);
  if (typeof encoder.underline === 'function') encoder.underline(operation.underline === true);
  if (typeof encoder.size === 'function') {
    const size = operation.size === 'large' || operation.size === 'double' ? 2 : 1;
    encoder.size(size);
  }
  const align = ALIGNMENTS.has(operation.align) ? operation.align : 'left';
  if (typeof encoder.align === 'function') encoder.align(align);
}

async function toImage(imageOperation, resolveImage) {
  if (typeof resolveImage !== 'function') {
    throw new TypeError('Gambar memerlukan resolveImage untuk mengubah data URL menjadi input gambar encoder.');
  }
  const image = await resolveImage(imageOperation.dataUrl, imageOperation);
  if (!image) throw new TypeError('Resolver gambar tidak menghasilkan input yang valid.');
  return image;
}

/**
 * Convert a deterministic thermal layout into the documented ReceiptPrinterEncoder v4 API.
 * EncoderClass is injected so the layout and mapping stay testable without Electron or a printer.
 */
export async function encodeThermalLayout(layout, EncoderClass, options = {}) {
  if (!layout?.profile || !Array.isArray(layout.operations)) throw new TypeError('Layout thermal tidak valid.');
  if (typeof EncoderClass !== 'function') throw new TypeError('Konstruktor ReceiptPrinterEncoder wajib diberikan.');

  const encoderOptions = {
    language: options.language || 'esc-pos',
    columns: layout.profile.columns,
    feedBeforeCut: 0
  };
  if (options.printer) encoderOptions.printer = options.printer;
  const encoder = new EncoderClass(encoderOptions);
  encoder.initialize();

  for (const operation of layout.operations) {
    switch (operation.type) {
      case 'text':
        setTextStyle(encoder, operation);
        encoder.line(operation.text);
        break;
      case 'rule': {
        setTextStyle(encoder, { align: 'left' });
        const character = (operation.character || '-').slice(0, 1);
        encoder.line(character.repeat(Math.max(1, Math.min(layout.profile.effectiveColumns, operation.width || layout.profile.effectiveColumns))));
        break;
      }
      case 'feed':
        for (let line = 0; line < Math.max(0, Math.min(20, operation.lines || 0)); line += 1) encoder.newline();
        break;
      case 'qrcode':
        // Tight line spacing agar tidak ada jarak putih berlebih di sekitar kode QR
        if (typeof encoder.raw === 'function') encoder.raw(ESC_LINE_SPACING_TIGHT);
        encoder.align('center').qrcode(operation.value, { model: 2, size: 5 });
        encoder.newline();
        // Kembalikan ke line spacing default untuk konten berikutnya
        if (typeof encoder.raw === 'function') encoder.raw(ESC_LINE_SPACING_DEFAULT);
        break;
      case 'barcode':
        // Tight line spacing agar tidak ada jarak putih berlebih di sekitar barcode
        if (typeof encoder.raw === 'function') encoder.raw(ESC_LINE_SPACING_TIGHT);
        encoder.align('center').barcode(operation.value, operation.symbology || 'code128', { width: 2, height: 64 });
        encoder.newline();
        // Kembalikan ke line spacing default untuk konten berikutnya
        if (typeof encoder.raw === 'function') encoder.raw(ESC_LINE_SPACING_DEFAULT);
        break;
      case 'image': {
        const imageData = await toImage(operation, options.resolveImage);
        // Tight line spacing: hilangkan jarak putih atas/bawah akibat default line-spacing printer.
        // Ini adalah teknik yang sama dengan yang dipakai di AplikasiStruk (receiptEscPos.js).
        if (typeof encoder.raw === 'function') encoder.raw(ESC_LINE_SPACING_TIGHT);
        // Kirim gambar ke encoder. operation.width sudah dikonversi ke printer dots
        // oleh thermal-layout.js (screenPxToPrinterDots) agar ukuran proporsional dengan desain.
        encoder.align('center').image(imageData, { width: operation.width });
        encoder.newline();
        // Kembalikan ke line spacing default untuk konten berikutnya
        if (typeof encoder.raw === 'function') encoder.raw(ESC_LINE_SPACING_DEFAULT);
        break;
      }
      case 'cut':
        encoder.cut(operation.mode === 'partial' ? 'partial' : 'full');
        break;
      default:
        throw new TypeError('Operasi layout tidak didukung encoder: ' + operation.type);
    }
  }
  return encoder.encode();
}
