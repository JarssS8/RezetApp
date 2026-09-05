/**
 * Reduce una foto capturada a un lado largo máximo antes de decodificarla o
 * subirla — una foto de móvil típica (3000×4000px+) es innecesariamente
 * lenta/cara para esto; el zxing decodifica un código de barras igual de
 * bien a 1024px, y Gemini paga menos tokens por una imagen más pequeña.
 */
export async function resizeImageFile(
  file: File,
  maxDim: number,
): Promise<{ blob: Blob; dataUrl: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  ctx.drawImage(bitmap, 0, 0, width, height);

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.85),
  );
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return { blob, dataUrl };
}

/** Blob -> base64 sin el prefijo `data:...;base64,`, para mandar a una Edge Function. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
