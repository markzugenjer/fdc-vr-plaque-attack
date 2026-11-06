import qrcode from 'qrcode-generator';

/** Draw a QR code for `url` into a canvas 2D context, in the square (x, y, size). */
export function drawQR(c, url, x, y, size, { dark = '#2e2340', light = '#ffffff' } = {}) {
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 2;
  const cell = size / (n + quiet * 2);
  c.fillStyle = light;
  c.fillRect(x, y, size, size);
  c.fillStyle = dark;
  for (let r = 0; r < n; r++) {
    for (let col = 0; col < n; col++) {
      if (qr.isDark(r, col)) c.fillRect(Math.floor(x + (col + quiet) * cell), Math.floor(y + (r + quiet) * cell), Math.ceil(cell), Math.ceil(cell));
    }
  }
}
