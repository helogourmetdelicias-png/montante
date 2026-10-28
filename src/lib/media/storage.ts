import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { prisma } from '@/lib/prisma';
import { IMAGE_MAX_BYTES, mediaId, type MediaPurpose } from './types';
import { RequestError } from '@/lib/security/request';

export const IMAGE_BUCKET = 'montante-images';
export function imageStorage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new RequestError('O armazenamento de imagens ainda não foi configurado.', 503);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }).storage;
}

export async function normalizeImage(bytes: Buffer, mime: string) {
  if (!bytes.length || bytes.length > IMAGE_MAX_BYTES) throw new RequestError('Envie uma imagem de até 3 MB.', 413);
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) throw new RequestError('Use imagens PNG, JPG ou WebP.');
  try {
    const image = sharp(bytes, { limitInputPixels: 24000000, animated: false });
    const metadata = await image.metadata();
    if (!metadata.format || !['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages ?? 1) > 1) throw new Error('Invalid image');
    // Re-encoding validates the bytes, removes EXIF/location, and preserves proportions.
    return await image.rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).toBuffer();
  } catch { throw new RequestError('Não foi possível ler a imagem. Use um arquivo PNG, JPG ou WebP válido.'); }
}

export async function saveImage(userId: string, tenantId: string, purpose: MediaPurpose, bytes: Buffer, mime: string) {
  const data = await normalizeImage(bytes, mime);
  const storage = imageStorage();
  const bucket = await storage.getBucket(IMAGE_BUCKET);
  if (bucket.error) throw new RequestError('O armazenamento de imagens ainda não está disponível.', 503);
  if (bucket.data.public) throw new RequestError('O armazenamento precisa estar configurado como privado.', 503);
  const path = `${tenantId}/${purpose}/${randomUUID()}.webp`;
  const uploaded = await storage.from(IMAGE_BUCKET).upload(path, data, { contentType: 'image/webp', upsert: false, cacheControl: '0' });
  if (uploaded.error) throw new RequestError('Não foi possível enviar a imagem agora.', 503);
  try {
    const asset = await prisma.mediaAsset.create({ data: { tenant_id: tenantId, user_id: userId, purpose, storage_path: path, mime_type: 'image/webp', size: data.length } });
    return `/api/media/${asset.id}`;
  } catch (error) { await storage.from(IMAGE_BUCKET).remove([path]); throw error; }
}

export async function assertImageOwnership(values: string[], tenantId: string, purpose: MediaPurpose, userId?: string) {
  const ids = [...new Set(values.filter(Boolean).map(value => mediaId(value)))];
  if (ids.some(id => id === null)) throw new RequestError('Selecione uma imagem enviada para esta loja.');
  if (!ids.length) return;
  const count = await prisma.mediaAsset.count({ where: { id: { in: ids as string[] }, tenant_id: tenantId, purpose, ...(purpose === 'avatar' ? { user_id: userId } : {}) } });
  if (count !== ids.length) throw new RequestError('Imagem não encontrada nesta loja.', 403);
}
