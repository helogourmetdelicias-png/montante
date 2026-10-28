import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isMediaPath } from '@/lib/media/types';
import { assertImageOwnership } from '@/lib/media/storage';
import { assertSameOrigin, RequestError } from '@/lib/security/request';

const schema = z.object({ minutes: z.number().int().refine(value => [0, 2, 5, 10, 15, 30].includes(value)), imageUrl: z.string().max(200).refine(value => !value || isMediaPath(value)) }).strict().refine(value => !value.minutes || value.imageUrl, 'Selecione uma imagem para ativar a proteção de tela.');
export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });
  const tenant = await prisma.tenant.findUnique({ where: { id: session.user.tenantId }, select: { screensaver_minutes: true, screensaver_url: true } });
  return NextResponse.json({ minutes: tenant?.screensaver_minutes ?? 0, imageUrl: tenant?.screensaver_url ?? '' }, { headers: { 'Cache-Control': 'private, no-store' } });
}
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });
  if (!['owner', 'admin'].includes(session.user.role)) return NextResponse.json({ error: 'Acesso restrito ao responsável da loja.' }, { status: 403 });
  try {
    assertSameOrigin(request);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new RequestError('Confira a imagem e o tempo de inatividade.');
    await assertImageOwnership([parsed.data.imageUrl], session.user.tenantId, 'screensaver');
    await prisma.tenant.update({ where: { id: session.user.tenantId }, data: { screensaver_minutes: parsed.data.minutes, screensaver_url: parsed.data.imageUrl || null } });
    return NextResponse.json(parsed.data);
  } catch (error) { return NextResponse.json({ error: error instanceof RequestError ? error.message : 'Não foi possível salvar a proteção de tela.' }, { status: error instanceof RequestError ? error.status : 500 }); }
}
