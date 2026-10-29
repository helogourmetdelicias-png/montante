import type { Prisma } from '@prisma/client';
import { businessDayRange } from './business-day';

/** Manual opening is optional. Never reuse another day's float or movements. */
export async function ensureDailyCashRegister(tx: Prisma.TransactionClient, tenantId: string, userId: string, now = new Date()) {
  const current = await tx.cashRegisterSession.findFirst({
    where: { tenant_id: tenantId, user_id: userId, status: 'OPEN', opened_at: businessDayRange(now) },
  });
  if (current) return current;
  try {
    return await tx.cashRegisterSession.create({
      data: { tenant_id: tenantId, user_id: userId, initial_amount: 0, opened_at: now },
    });
  } catch (cause) {
    // A concurrent first sale may create today's unique drawer. Retry the whole
    // serializable transaction so it can read that drawer from a fresh snapshot.
    if ((cause as { code?: string }).code === 'P2002') {
      throw Object.assign(new Error('Concurrent daily drawer creation'), { code: 'P2034' });
    }
    throw cause;
  }
}
