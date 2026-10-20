import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { operatorSchema, pinSchema } from '@/lib/operators';
import { hash } from 'bcryptjs';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });
  const manager = ['owner', 'admin'].includes(session.user.role);
  const users = await prisma.user.findMany({ where: { tenant_id: session.user.tenantId, ...(manager ? {} : { is_active: true, pin_hash: { not: null } }) }, orderBy: { name: 'asc' }, select: { id: true, name: true, role: true, is_active: true, ...(manager ? { email: true } : {}) } });
  return NextResponse.json({ users }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });
  if (!['owner', 'admin'].includes(session.user.role)) return NextResponse.json({ error: 'Acesso restrito ao administrador.' }, { status: 403 });
  const input = operatorSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: 'Confira nome, e-mail, senha (8 a 72 caracteres) e PIN de 6 números.' }, { status: 400 });
  const { name, email, password, pin } = input.data;
  try {
    if (await prisma.user.findFirst({ where: { tenant_id: session.user.tenantId, email: { equals: email, mode: 'insensitive' } }, select: { id: true } })) return NextResponse.json({ error: 'E-mail já cadastrado nesta loja.' }, { status: 409 });
    const [password_hash, pin_hash] = await Promise.all([hash(password, 12), hash(pin, 12)]);
    await prisma.user.create({ data: { tenant_id: session.user.tenantId, name, email, password_hash, pin_hash, role: 'staff' } });
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') return NextResponse.json({ error: 'E-mail já cadastrado nesta loja.' }, { status: 409 });
    return NextResponse.json({ error: 'Não foi possível cadastrar o operador.' }, { status: 500 });
  }
}

const updateSchema = z.union([
  z.object({ action: z.literal('my-pin'), pin: pinSchema, password: z.string().min(6).max(72) }),
  z.object({ action: z.literal('status'), userId: z.string().cuid(), active: z.boolean() }),
  z.object({ action: z.literal('credentials'), userId: z.string().cuid(), password: z.string().min(8).max(72), pin: pinSchema }),
]);

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Confira os dados informados.' }, { status: 400 });
  const input = parsed.data;
  if (input.action === 'my-pin') {
    const user = await prisma.user.findFirst({ where: { id: session.user.id, tenant_id: session.user.tenantId, is_active: true } });
    const { compare } = await import('bcryptjs');
    if (!user?.password_hash || !await compare(input.password, user.password_hash)) return NextResponse.json({ error: 'Senha atual incorreta.' }, { status: 403 });
    await prisma.user.update({ where: { id: user.id }, data: { pin_hash: await hash(input.pin, 12), pin_failures: 0, pin_locked_until: null } });
    return NextResponse.json({ success: true });
  }
  if (!['owner', 'admin'].includes(session.user.role)) return NextResponse.json({ error: 'Acesso restrito ao administrador.' }, { status: 403 });
  const target = await prisma.user.findFirst({ where: { id: input.userId, tenant_id: session.user.tenantId, role: 'staff' }, select: { id: true } });
  if (!target) return NextResponse.json({ error: 'Operador não encontrado.' }, { status: 404 });
  if (input.action === 'status') {
    await prisma.user.updateMany({ where: { id: target.id, tenant_id: session.user.tenantId, role: 'staff' }, data: { is_active: input.active } });
  } else {
    const [password_hash, pin_hash] = await Promise.all([hash(input.password, 12), hash(input.pin, 12)]);
    await prisma.user.updateMany({ where: { id: target.id, tenant_id: session.user.tenantId, role: 'staff' }, data: { password_hash, pin_hash, pin_failures: 0, pin_locked_until: null } });
  }
  return NextResponse.json({ success: true });
}
