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

// GS ! n — Character Size command.
// byte n: bit4-6 = height multiplier (0=1×, 1=2×), bit0-2 = width multiplier (0=1×, 1=2×).
// Double-height only: n = 0x10 (height 2×, width 1×).
// Reset to normal:    n = 0x00.
const GS_CHAR_SIZE_DOUBLE_HEIGHT = [0x1D, 0x21, 0x10];
const GS_CHAR_SIZE_NORMAL        = [0x1D, 0x21, 0x00];

function setTextStyle(encoder, operation) {
  if (typeof encoder.bold === 'function') encoder.bold(operation.bold === true);
  if (typeof encoder.italic === 'function') encoder.italic(operation.italic === true);
  if (typeof encoder.underline === 'function') encoder.underline(operation.underline === true);
  if (typeof encoder.size === 'function') {
    // doubleHeight pakai raw GS! — tidak lewat encoder.size() karena library
    // hanya menerima angka skalar dan tidak mendukung width/height terpisah.
    if (operation.doubleHeight !== true) {
      const size = operation.size === 'large' || operation.size === 'double' ? 2 : 1;
      encoder.size(size);
    }
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
        if (operation.doubleHeight === true && typeof encoder.raw === 'function') {
          // Double-height: bangun seluruh baris sebagai raw bytes self-contained.
          // Ini menghindari konflik dengan internal state ReceiptPrinterEncoder
          // yang terjadi jika encoder.raw() disisipkan antara encoder.align() dan encoder.line().
          if (typeof encoder.bold === 'function') encoder.bold(operation.bold === true);
          if (typeof encoder.italic === 'function') encoder.italic(operation.italic === true);
          if (typeof encoder.underline === 'function') encoder.underline(operation.underline === true);
          if (typeof encoder.size === 'function') encoder.size(1);
          const ALIGN_BYTES = { left: 0x00, center: 0x01, right: 0x02 };
          const alignByte = ALIGN_BYTES[operation.align] ?? 0x00;
          const textBytes = [...new TextEncoder().encode(operation.text)];
          encoder.raw([
            0x1B, 0x61, alignByte,  // ESC a n — set alignment
            0x1D, 0x21, 0x10,       // GS ! 0x10 — double height, normal width
            ...textBytes,
            0x0A,                   // LF — newline
            0x1D, 0x21, 0x00,       // GS ! 0x00 — reset character size
            0x1B, 0x61, 0x00,       // ESC a 0 — reset alignment to left
          ]);
          // Sinkronkan internal state encoder: alignment kembali ke left setelah baris ini.
          if (typeof encoder.align === 'function') encoder.align('left');
        } else {
          setTextStyle(encoder, operation);
          encoder.line(operation.text);
        }
        break;
      case 'rule': {
        setTextStyle(encoder, { align: 'left' });
        const character = (operation.character || '-').slice(0, 1);
        const cols = layout.profile.effectiveColumns;
        // Gunakan marginLeft sebagai spasi kiri (sama seperti jalur teks lain).
        // Ini yang membuat alignment (center/right) pada blok garis berfungsi saat cetak fisik.
        const leftPad = operation.marginLeft > 0 ? ' '.repeat(Math.min(operation.marginLeft, cols - 1)) : '';
        const lineWidth = Math.max(1, Math.min(cols - leftPad.length, operation.width || cols));
        encoder.line(leftPad + character.repeat(lineWidth));
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
