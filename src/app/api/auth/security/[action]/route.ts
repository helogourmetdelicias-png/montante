import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { assertSameOrigin, RequestError } from '@/lib/security/request';
import { assertEmailConfigured } from '@/lib/security/email';
import { COOKIE_OPTIONS, FLOW_COOKIE, cookieValue, credentialHash, findLoginUsers, issueChallenge, issueTicket, opaqueToken, resetPassword, secretHash, throttle, throttleRequest, validOpaqueToken, verifyChallenge } from '@/lib/security/auth-flow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
const emailField = z.string().trim().email().max(254).transform(value => value.toLowerCase());
const startSchema = z.object({ email: emailField, password: z.string().min(6).max(72), tenantChoice: z.string().max(100).optional() }).strict();
const verifySchema = z.object({ challengeId: z.string().min(20).max(100), code: z.string().regex(/^\d{6}$/) }).strict();
const resendSchema = z.object({ challengeId: z.string().min(20).max(100) }).strict();
const resetSchema = z.object({ ticket: z.string().length(64), password: z.string().min(8).max(72), confirmPassword: z.string(), tenantChoice: z.string().max(100).optional() }).strict().refine(input => input.password === input.confirmPassword);
const response = (body: unknown) => NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
function withFlow(body: unknown, flow: string) {
  const result = response(body);
  result.cookies.set(FLOW_COOKIE, flow, { ...COOKIE_OPTIONS, maxAge: 15 * 60 });
  return result;
}

export async function POST(request: Request, context: { params: Promise<{ action: string }> }) {
  try {
    assertSameOrigin(request);
    const { action } = await context.params;
    const body = await request.json().catch(() => null);
    const flow = cookieValue(request, FLOW_COOKIE);
    if (action === 'start') {
      const input = startSchema.safeParse(body);
      if (!input.success) throw new RequestError('Informe um e-mail e uma senha válidos.');
      await throttleRequest(request, 'login', input.data.email);
      const users = await findLoginUsers(input.data.email, input.data.password);
      const user = input.data.tenantChoice ? users.find(user => user.tenant_id === input.data.tenantChoice || user.tenant.slug === input.data.tenantChoice) : users.length === 1 ? users[0] : null;
      if (!user && users.length > 1 && !input.data.tenantChoice) return response({ stores: users.map(user => ({ id: user.tenant_id, name: user.tenant.name })) });
      if (!user) throw new RequestError('E-mail ou senha incorretos.', 401);
      const nextFlow = opaqueToken();
      
      // Marca email como verificado se ainda não foi (2FA removido)
      if (!user.email_verified) {
        await prisma.user.update({
          where: { id: user.id },
          data: { email_verified: new Date() }
        });
      }
      
      // Retorna ticket direto sem verificação
      return withFlow({ ticket: await issueTicket(user, nextFlow) }, nextFlow);
    }
    if (action === 'forgot') {
      const input = z.object({ email: emailField }).strict().safeParse(body);
      if (!input.success) throw new RequestError('Informe um e-mail válido.');
      assertEmailConfigured();
      await throttleRequest(request, 'reset', input.data.email);
      const user = await prisma.user.findFirst({ where: { email: { equals: input.data.email, mode: 'insensitive' }, is_active: true, tenant: { is_active: true } }, orderBy: { id: 'asc' } });
      const nextFlow = opaqueToken();
      let challengeId = opaqueToken();
      if (user) { try { challengeId = await issueChallenge(user, 'reset', nextFlow); } catch { console.error('auth.reset_email_failed'); } }
      return withFlow({ challengeId, message: 'Se este e-mail estiver cadastrado, você receberá um código de recuperação.' }, nextFlow);
    }
    if (action === 'verify') {
      const input = verifySchema.safeParse(body);
      if (!input.success) throw new RequestError('Digite o código de seis números.');
      await throttle('verify-flow', flow, 30);
      const { user, purpose } = await verifyChallenge(input.data.challengeId, input.data.code, flow);
      if (purpose === 'reset') {
        const stores = await prisma.user.findMany({ where: { email: { equals: user.email, mode: 'insensitive' }, is_active: true, tenant: { is_active: true } }, select: { tenant: { select: { id: true, name: true } } }, take: 21 });
        return response({ resetTicket: await issueTicket(user, flow, 'reset-ticket'), stores: stores.map(row => row.tenant) });
      }
      throw new RequestError('Solicite uma nova recuperação de senha.');
    }
    if (action === 'resend') {
      const input = resendSchema.safeParse(body);
      if (!input.success || !validOpaqueToken(flow)) throw new RequestError('Solicite um novo acesso.');
      const current = await prisma.authChallenge.findFirst({ where: { id: input.data.challengeId, flow_hash: secretHash(flow), consumed_at: null, purpose: 'reset' }, include: { user: { include: { tenant: { select: { is_active: true } } } } } });
      if (!current || !current.user.is_active || !current.user.tenant.is_active || current.credential_hash !== credentialHash(current.user)) throw new RequestError('Solicite um novo acesso.');
      if (Date.now() - current.created_at.getTime() < 60000) throw new RequestError('Aguarde um minuto antes de reenviar.', 429);
      await throttleRequest(request, 'resend', current.user.email);
      await prisma.authChallenge.update({ where: { id: current.id }, data: { consumed_at: new Date() } });
      return response({ challengeId: await issueChallenge(current.user, 'reset', flow) });
    }
    if (action === 'reset') {
      const input = resetSchema.safeParse(body);
      if (!input.success) throw new RequestError('Use uma senha de 8 a 72 caracteres e confirme-a.');
      await throttle('reset-finish', flow, 10);
      await resetPassword(input.data.ticket, flow, input.data.password, input.data.tenantChoice);
      return response({ success: true });
    }
    return NextResponse.json({ error: 'Recurso não encontrado.' }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof RequestError ? error.message : 'Não foi possível concluir esta etapa. Tente novamente.' }, { status: error instanceof RequestError ? error.status : 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
