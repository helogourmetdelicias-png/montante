import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isHttpImageUrl(value: string) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

const brandSchema = z.object({
  logoUrl: z.string().trim().url().max(2048).refine(isHttpImageUrl).or(z.literal('')),
});

/** Updates only the authenticated tenant's public brand image URL. */
export async function POST(request: Request) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return NextResponse.json({ error: 'Entre na sua conta para atualizar a marca.' }, { status: 401 });
  if (!['owner', 'admin'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Somente responsáveis e administradores podem alterar a marca.' }, { status: 403 });
  }

  const parsed = brandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Informe um endereço público válido para a logo.' }, { status: 400 });

  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: { logo_url: parsed.data.logoUrl || null },
    select: { logo_url: true },
  });
  return NextResponse.json({ logoUrl: tenant.logo_url });
}
