import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { runSerializableTransaction } from '@/lib/database/transactions';

export const pinSchema = z.string().regex(/^\d{6}$/, 'O PIN deve ter 6 números.');
export const operatorSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(72),
  pin: pinSchema,
});

export async function verifyOperatorPin(tenantId: string, userId: string, pin: string) {
  if (!pinSchema.safeParse(pin).success) return null;
  return runSerializableTransaction(async tx => {
    const user = await tx.user.findFirst({ where: { id: userId, tenant_id: tenantId, is_active: true, tenant: { is_active: true } } });
    if (!user?.pin_hash || (user.pin_locked_until && user.pin_locked_until > new Date())) return null;
    if (!await bcrypt.compare(pin, user.pin_hash)) {
      const failures = user.pin_locked_until ? 1 : user.pin_failures + 1;
      await tx.user.update({ where: { id: user.id }, data: {
        pin_failures: failures,
        pin_locked_until: failures >= 5 ? new Date(Date.now() + 15 * 60_000) : null,
      } });
      return null;
    }
    await tx.user.update({ where: { id: user.id }, data: { pin_failures: 0, pin_locked_until: null } });
    return user;
  });
}
