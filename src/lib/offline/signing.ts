import { createHmac, timingSafeEqual } from 'node:crypto';

export const OFFLINE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function secret() {
  const value = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!value) throw new Error('AUTH_SECRET ausente.');
  return value;
}

export function signOffline(value: unknown) {
  return createHmac('sha256', secret()).update(`montante-offline-v1:${JSON.stringify(value)}`).digest('hex');
}

export function verifyOffline(value: unknown, signature: string) {
  const expected = Buffer.from(signOffline(value), 'hex');
  const received = Buffer.from(signature, 'hex');
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function ticketValue(tenantId: string, userId: string, preparedAt: string) {
  return { tenantId, userId, preparedAt };
}

export function productValue(ticket: string, id: string, price: string, sellByFraction: boolean) {
  return { ticket, id, price, sellByFraction };
}
