import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import { MEDIA_PURPOSES, IMAGE_MAX_BYTES, type MediaPurpose } from '@/lib/media/types';
import { saveImage } from '@/lib/media/storage';
import { assertSameOrigin, boundedFormData, RequestError } from '@/lib/security/request';
import { throttle } from '@/lib/security/auth-flow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });
  try {
    assertSameOrigin(request);
    await throttle('image-upload', `${session.user.tenantId}:${session.user.id}`, 20, 60000);
    const form = await boundedFormData(request, IMAGE_MAX_BYTES);
    const purpose = String(form.get('purpose')) as MediaPurpose;
    if (!MEDIA_PURPOSES.includes(purpose)) throw new RequestError('Tipo de imagem inválido.');
    if (['product', 'logo', 'screensaver'].includes(purpose) && !['owner', 'admin'].includes(session.user.role)) throw new RequestError('Acesso restrito ao responsável da loja.', 403);
    const file = form.get('file');
    if (!file || typeof file === 'string') throw new RequestError('Selecione uma imagem.');
    const url = await saveImage(session.user.id, session.user.tenantId, purpose, Buffer.from(await file.arrayBuffer()), file.type);
    return NextResponse.json({ url }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof RequestError ? error.message : 'Não foi possível enviar a imagem.' }, { status: error instanceof RequestError ? error.status : 500 });
  }
}
