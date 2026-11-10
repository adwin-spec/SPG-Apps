import { api } from '@/lib/api';

/** Perkecil foto di HP (hemat kuota) dan cetak merek, nama SPG, tanggal & jam agar foto lama sulit dipakai ulang. */
export async function prepare(file: File, stamp: string, max = 1280, quality = 0.8): Promise<Blob> {
  let src: ImageBitmap | HTMLImageElement;
  try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { src = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('File bukan gambar')); i.src = URL.createObjectURL(file); }); }
  const k = Math.min(1, max / Math.max(src.width, src.height));
  const c = document.createElement('canvas'); c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
  const g = c.getContext('2d')!; g.drawImage(src, 0, 0, c.width, c.height);
  const fs = Math.max(12, Math.round(c.width / 40)); g.font = `600 ${fs}px sans-serif`;
  g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, c.height - fs * 1.9, c.width, fs * 1.9);
  g.fillStyle = '#fff'; g.fillText(stamp, fs * 0.6, c.height - fs * 0.6);
  return await new Promise((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error('Gagal memproses foto'))), 'image/jpeg', quality));
}

export async function uploadPhoto(file: File, stamp: string): Promise<{ id: string }> {
  const fd = new FormData(); fd.append('file', await prepare(file, stamp), 'foto.jpg');
  return api<{ id: string }>('/photos', { method: 'POST', body: fd });
}
