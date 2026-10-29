import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { ensureDailyCashRegister } from '../../src/lib/cash-register/daily-session';

describe('optional daily cash register', () => {
  it('starts from zero and leaves yesterday open for optional reconciliation', async () => {
    const yesterday = { id: 'yesterday', tenant_id: 'store', user_id: 'operator', status: 'OPEN', opened_at: new Date('2026-10-28T15:00:00Z'), initial_amount: 100 };
    const findFirst = vi.fn(async ({ where }) => {
      expect(where.tenant_id).toBe('store');
      expect(where.user_id).toBe('operator');
      return yesterday.opened_at >= where.opened_at.gte && yesterday.opened_at < where.opened_at.lt ? yesterday : null;
    });
    const create = vi.fn(async ({ data }) => ({ id: 'today', ...data }));
    const tx = { cashRegisterSession: { findFirst, create } };
    const result = await ensureDailyCashRegister(tx as unknown as Prisma.TransactionClient, 'store', 'operator', new Date('2026-10-29T03:00:00Z'));
    expect(result.id).toBe('today');
    expect(create).toHaveBeenCalledWith({ data: { tenant_id: 'store', user_id: 'operator', initial_amount: 0, opened_at: new Date('2026-10-29T03:00:00Z') } });
    expect(yesterday.status).toBe('OPEN');
    expect(yesterday.initial_amount).toBe(100);
  });

  it('reuses today without replacing its manually supplied float', async () => {
    const current = { id: 'today', initial_amount: 50 };
    const tx = { cashRegisterSession: { findFirst: vi.fn().mockResolvedValue(current), create: vi.fn() } };
    expect(await ensureDailyCashRegister(tx as unknown as Prisma.TransactionClient, 'store', 'operator')).toBe(current);
    expect(tx.cashRegisterSession.create).not.toHaveBeenCalled();
  });

  it('requests a transaction retry if concurrent operations create the daily drawer', async () => {
    const tx = { cashRegisterSession: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockRejectedValue({ code: 'P2002' }) } };
    await expect(ensureDailyCashRegister(tx as unknown as Prisma.TransactionClient, 'store', 'operator')).rejects.toMatchObject({ code: 'P2034' });
  });
});
