import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { BUSINESS_NICHES } from '@/lib/business-niche';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const nicheSchema = z.object({ niche: z.enum(BUSINESS_NICHES) }).strict();

export async function PATCH(request: Request) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return NextResponse.json({ error: 'Entre na sua conta para configurar a loja.' }, { status: 401 });
  if (!['owner', 'admin'].includes(session.user.role)) return NextResponse.json({ error: 'Somente responsáveis e administradores podem escolher o nicho.' }, { status: 403 });
  const input = nicheSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: 'Selecione um dos nichos disponíveis.' }, { status: 400 });
  try {
    const tenant = await prisma.tenant.update({ where: { id: tenantId }, data: { niche: input.data.niche }, select: { niche: true } });
    return NextResponse.json(tenant, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2025') return NextResponse.json({ error: 'Loja não encontrada.' }, { status: 404 });
    return NextResponse.json({ error: 'Não foi possível salvar o nicho. Tente novamente.' }, { status: 500 });
  }
}
