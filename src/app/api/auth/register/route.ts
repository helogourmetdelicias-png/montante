import { NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { registerSchema } from '@/lib/validations/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const parsed = registerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Confira os campos do cadastro.', details: parsed.error.flatten() }, { status: 400 });
  }

  const input = parsed.data;
  const email = input.email.trim().toLowerCase();
  const slug = input.tenantSlug.trim().toLowerCase();
  const passwordHash = await hash(input.password, 12);

  try {
    const tenant = await prisma.tenant.create({
      data: {
        name: input.tenantName.trim(),
        slug,
        email,
        cnpj: input.cnpj?.trim() || null,
        users: {
          create: {
            name: input.name.trim(),
            email,
            password_hash: passwordHash,
            role: 'owner',
          },
        },
      },
      select: { id: true, slug: true },
    });

    return NextResponse.json({ tenantSlug: tenant.slug }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'Este identificador de loja ou CNPJ já está cadastrado.' }, { status: 409 });
    }
    console.error('Falha ao criar cadastro inicial de loja.');
    return NextResponse.json({ error: 'Não foi possível concluir o cadastro agora. Tente novamente.' }, { status: 500 });
  }
}
