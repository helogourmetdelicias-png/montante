import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { brandKey } from '@/lib/brand-commission';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const inputSchema = z.object({ brand: z.string().trim().min(1).max(80), rate: z.number().finite().min(0).max(100).refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001) }).strict();
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });
  if (!['owner', 'admin'].includes(session.user.role)) return NextResponse.json({ error: 'Acesso restrito à gestão.' }, { status: 403 });
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: 'Informe marca e percentual de 0 a 100, com até duas casas decimais.' }, { status: 400 });
  const rule = await prisma.brandCommission.upsert({ where: { tenant_id_brand_key: { tenant_id: session.user.tenantId, brand_key: brandKey(input.data.brand) } },
    create: { tenant_id: session.user.tenantId, brand_key: brandKey(input.data.brand), ...input.data }, update: input.data });
  return NextResponse.json({ brand: rule.brand, rate: rule.rate.toFixed(2) });
}
