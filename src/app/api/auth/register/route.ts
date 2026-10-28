import { NextResponse } from 'next/server';
import { addBillingMonths, TRIAL_MONTHS } from '@/lib/billing';
import { hash } from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { registerSchema } from '@/lib/validations/auth';
import { assertSameOrigin, RequestError } from '@/lib/security/request';
import { throttle } from '@/lib/security/auth-flow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await throttle('registration-ip', request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown', 5);
  } catch (error) { 
    return NextResponse.json({ 
      error: error instanceof RequestError ? error.message : 'Cadastro indisponível agora.' 
    }, { 
      status: error instanceof RequestError ? error.status : 503 
    }); 
  }
  const parsed = registerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Confira os campos do cadastro.', details: parsed.error.flatten() }, { status: 400 });
  }

  const input = parsed.data;
  const email = input.email.trim().toLowerCase();
  const slug = input.tenantSlug.trim().toLowerCase();
  const passwordHash = await hash(input.password, 12);

  try {
    const createdAt = new Date();
    const trialEnd = addBillingMonths(createdAt, TRIAL_MONTHS);
    const tenant = await prisma.tenant.create({
      data: {
        created_at: createdAt,
        subscription: { create: { trial_ends_at: trialEnd, next_billing_at: trialEnd } },
        name: input.tenantName.trim(),
        niche: input.niche ?? null,
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
      select: { id: true, slug: true, users: true },
    });

    
    // Marca email como verificado automaticamente (sem 2FA)
    await prisma.user.update({
      where: { id: tenant.users[0].id },
      data: { email_verified: new Date() }
    });
    
    return NextResponse.json({ 
      tenantSlug: tenant.slug,
      message: 'Conta criada com sucesso' 
    }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'Este identificador de loja ou CNPJ já está cadastrado.' }, { status: 409 });
    }
    console.error('Falha ao criar cadastro inicial de loja.');
    return NextResponse.json({ error: 'Não foi possível concluir o cadastro agora. Tente novamente.' }, { status: 500 });
  }
}
