import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { compare, hash } from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { type User } from '@prisma/client';
import { sendSecurityCode, assertEmailConfigured } from './email';
import { RequestError } from './request';

export const FLOW_COOKIE = 'montante-auth-flow';
export const DEVICE_COOKIE = 'montante-device';
export const COOKIE_OPTIONS = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/' };
export const opaqueToken = () => randomBytes(32).toString('hex');
export const validOpaqueToken = (token: string) => /^[a-f0-9]{64}$/.test(token);
export function secretHash(value: string) {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new RequestError('Autenticação indisponível.', 503);
  return createHmac('sha256', secret).update(value).digest('hex');
}
export function cookieValue(request: Request, name: string) {
  const match = (request.headers.get('cookie') ?? '').split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`));
  return match?.slice(name.length + 1) ?? '';
}
function sameHash(a: string | null, b: string) { return !!a && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b)); }
export const credentialHash = (user: Pick<User, 'password_hash' | 'auth_version'>) => secretHash(`${user.password_hash}:${user.auth_version}`);

/** Database-backed buckets work across serverless instances and never store raw IPs. */
export async function throttle(scope: string, identity: string, limit = 8, duration = 15 * 60000) {
  const bucket = Math.floor(Date.now() / duration);
  const key = secretHash(`${scope}:${identity}:${bucket}`);
  const row = await prisma.authThrottle.upsert({ where: { key }, create: { key, count: 1, expires_at: new Date((bucket + 1) * duration) }, update: { count: { increment: 1 } } });
  if (row.count > limit) throw new RequestError('Muitas tentativas. Aguarde alguns minutos e tente novamente.', 429);
}
export async function throttleRequest(request: Request, scope: string, email: string) {
  await throttle(`${scope}:email`, email.toLowerCase());
  await throttle(`${scope}:ip`, request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown', 80);
}

export async function findLoginUsers(email: string, password: string) {
  const users = await prisma.user.findMany({ where: { email: { equals: email, mode: 'insensitive' }, is_active: true, tenant: { is_active: true } }, include: { tenant: { select: { id: true, slug: true, name: true } } }, take: 21 });
  if (users.length > 20) throw new RequestError('Procure o responsável do sistema para revisar as contas deste e-mail.', 409);
  const matches = [];
  // Also do bcrypt work for missing accounts to reduce timing differences.
  if (!users.length) await compare(password, '$2a$12$Q2pt9.55bZ/gR4EJHvHnIe9Oxs0ooOWeS5dWkED5xQTMUhjTqkYgG');
  for (const user of users) if (user.password_hash && await compare(password, user.password_hash)) matches.push(user);
  return matches;
}

export async function issueChallenge(user: User, purpose: 'login' | 'reset', flow: string) {
  assertEmailConfigured();
  const code = String(randomInt(100000, 1000000));
  const challenge = await prisma.authChallenge.create({ data: { user_id: user.id, purpose, flow_hash: secretHash(flow), credential_hash: credentialHash(user), code_hash: secretHash(code), expires_at: new Date(Date.now() + 10 * 60000) } });
  try { await sendSecurityCode(user.email, code, purpose); }
  catch (error) { await prisma.authChallenge.update({ where: { id: challenge.id }, data: { consumed_at: new Date() } }); throw error; }
  // Expired authentication artifacts contain no usable credentials and can be pruned.
  await prisma.authThrottle.deleteMany({ where: { expires_at: { lt: new Date(Date.now() - 86400000) } } });
  await prisma.authChallenge.deleteMany({ where: { expires_at: { lt: new Date(Date.now() - 86400000) } } });
  await prisma.trustedDevice.deleteMany({ where: { expires_at: { lt: new Date() } } });
  return challenge.id;
}

export async function issueTicket(user: User, flow: string, purpose = 'ticket') {
  const ticket = opaqueToken();
  await prisma.authChallenge.create({ data: { user_id: user.id, purpose, token_hash: secretHash(ticket), flow_hash: secretHash(flow), credential_hash: credentialHash(user), expires_at: new Date(Date.now() + 2 * 60000) } });
  return ticket;
}

export async function isTrustedDevice(user: User, device: string) {
  if (!user.email_verified || !validOpaqueToken(device)) return false;
  return !!await prisma.trustedDevice.findFirst({ where: { user_id: user.id, token_hash: secretHash(device), auth_version: user.auth_version, expires_at: { gt: new Date() } } });
}

export async function verifyChallenge(id: string, code: string, flow: string) {
  const invalid = () => new RequestError('Código inválido ou expirado. Solicite um novo código.', 400);
  const now = new Date();
  const challenge = await prisma.authChallenge.findFirst({ where: { id, consumed_at: null, expires_at: { gt: now }, attempts: { lt: 5 }, purpose: { in: ['login', 'reset'] } }, include: { user: { include: { tenant: { select: { is_active: true } } } } } });
  if (!challenge || !validOpaqueToken(flow) || !sameHash(challenge.flow_hash, secretHash(flow))) throw invalid();
  const user = challenge.user;
  if (!user.is_active || !user.tenant.is_active || !sameHash(challenge.credential_hash, credentialHash(user))) throw invalid();
  const reserved = await prisma.authChallenge.updateMany({ where: { id, consumed_at: null, attempts: { lt: 5 }, expires_at: { gt: now } }, data: { attempts: { increment: 1 } } });
  if (!reserved.count || !sameHash(challenge.code_hash, secretHash(code))) throw invalid();
  const claimed = await prisma.authChallenge.updateMany({ where: { id, consumed_at: null, expires_at: { gt: now } }, data: { consumed_at: now } });
  if (!claimed.count) throw invalid();
  return { user, purpose: challenge.purpose };
}

/** Only a verified, browser-bound, single-use proof may reach Auth.js. */
export async function consumeLoginTicket(raw: string, flow: string) {
  if (!validOpaqueToken(raw) || !validOpaqueToken(flow)) return null;
  return prisma.$transaction(async tx => {
    const now = new Date();
    const ticket = await tx.authChallenge.findFirst({ where: { token_hash: secretHash(raw), purpose: 'ticket', consumed_at: null, expires_at: { gt: now }, flow_hash: secretHash(flow) }, include: { user: { include: { tenant: { select: { slug: true, is_active: true } } } } } });
    if (!ticket || !ticket.user.email_verified || !ticket.user.is_active || !ticket.user.tenant.is_active || !sameHash(ticket.credential_hash, credentialHash(ticket.user))) return null;
    const claimed = await tx.authChallenge.updateMany({ where: { id: ticket.id, consumed_at: null, expires_at: { gt: now } }, data: { consumed_at: now } });
    return claimed.count === 1 ? ticket.user : null;
  });
}

export async function resetPassword(ticketValue: string, flow: string, password: string, tenantChoice?: string) {
  if (!validOpaqueToken(ticketValue) || !validOpaqueToken(flow)) throw new RequestError('A autorização expirou. Solicite outro código.');
  const passwordHash = await hash(password, 12);
  await prisma.$transaction(async tx => {
    const now = new Date();
    const ticket = await tx.authChallenge.findFirst({ where: { token_hash: secretHash(ticketValue), purpose: 'reset-ticket', consumed_at: null, expires_at: { gt: now }, flow_hash: secretHash(flow) }, include: { user: true } });
    if (!ticket || !sameHash(ticket.credential_hash, credentialHash(ticket.user))) throw new RequestError('A autorização expirou. Solicite outro código.');
    const users = await tx.user.findMany({ where: { email: { equals: ticket.user.email, mode: 'insensitive' }, is_active: true, tenant: { is_active: true } } });
    const target = tenantChoice ? users.find(user => user.tenant_id === tenantChoice) : users.length === 1 ? users[0] : null;
    if (!target) throw new RequestError('Escolha a loja da conta que deseja atualizar.');
    const claimed = await tx.authChallenge.updateMany({ where: { id: ticket.id, consumed_at: null }, data: { consumed_at: now } });
    if (!claimed.count) throw new RequestError('A autorização expirou.');
    await tx.user.update({ where: { id: target.id }, data: { password_hash: passwordHash, auth_version: { increment: 1 }, email_verified: now } });
    await tx.trustedDevice.deleteMany({ where: { user_id: target.id } });
    await tx.authChallenge.updateMany({ where: { user_id: target.id, consumed_at: null }, data: { consumed_at: now } });
  });
}
