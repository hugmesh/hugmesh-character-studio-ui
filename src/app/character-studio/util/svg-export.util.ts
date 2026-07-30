/**
 * Rasterize a composed character SVG to a PNG Blob (B0 §1.4). The PNG is what the
 * avatar-export path posts to the BFF — A3 moderation runs on raster bytes, and
 * the existing `ProfileController` avatar endpoint accepts PNG (ImageSniffer), so
 * the SVG-driven creator keeps the moderated avatar gate working unchanged.
 *
 * Renders the SVG via an `<img>` onto an offscreen `<canvas>` then `toBlob`. The
 * SVG here is the COMPOSED, pack-authored (or already-sanitized) document — never
 * raw user input.
 */
export async function svgToPngBlob(svg: string, size = 512): Promise<Blob> {
  const url = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  const img = new Image();
  img.width = size;
  img.height = size;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('SVG failed to load for rasterization'));
    img.src = url;
  });
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2D canvas context unavailable');
  }
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(img, 0, 0, size, size);
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      b => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))),
      'image/png',
    ),
  );
}
