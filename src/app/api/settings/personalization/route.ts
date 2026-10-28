import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isMediaPath } from '@/lib/media/types';
import { assertImageOwnership } from '@/lib/media/storage';
import { assertSameOrigin, RequestError } from '@/lib/security/request';

const field = z.string().max(200).refine(value => !value || isMediaPath(value)).optional();
const schema = z.object({ avatarUrl: field, logoUrl: field }).strict().refine(value => Object.keys(value).length > 0);
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });
  try {
    assertSameOrigin(request);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new RequestError('Selecione uma imagem válida.');
    if (parsed.data.logoUrl !== undefined && !['owner', 'admin'].includes(session.user.role)) throw new RequestError('Acesso restrito ao responsável da loja.', 403);
    await assertImageOwnership([parsed.data.avatarUrl ?? ''], session.user.tenantId, 'avatar', session.user.id);
    await assertImageOwnership([parsed.data.logoUrl ?? ''], session.user.tenantId, 'logo');
    await prisma.$transaction([
      ...(parsed.data.avatarUrl !== undefined ? [prisma.user.update({ where: { id: session.user.id }, data: { avatar_url: parsed.data.avatarUrl || null } })] : []),
      ...(parsed.data.logoUrl !== undefined ? [prisma.tenant.update({ where: { id: session.user.tenantId }, data: { logo_url: parsed.data.logoUrl || null } })] : []),
    ]);
    return NextResponse.json({ success: true });
  } catch (error) { return NextResponse.json({ error: error instanceof RequestError ? error.message : 'Não foi possível salvar as imagens.' }, { status: error instanceof RequestError ? error.status : 500 }); }
}
