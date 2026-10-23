import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { getClosingIssues } from '../../src/lib/cash-register/pending';

const { db, auth } = vi.hoisted(() => ({
  db: {
    paymentAttempt: { findFirst: vi.fn(), updateMany: vi.fn() },
    sale: { findFirst: vi.fn(), updateMany: vi.fn() },
    cashRegisterSession: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
  auth: vi.fn(),
}));
vi.mock('@/auth', () => ({ auth }));
vi.mock('@/lib/prisma', () => ({ prisma: db }));
import { POST } from '../../src/app/api/sales/[id]/payments/[attemptId]/confirm/route';

const confirm = () => POST(new Request('http://localhost/confirm', { method: 'POST' }), {
  params: Promise.resolve({ id: 'sale-a', attemptId: 'attempt-a' }),
});

beforeEach(() => {
  vi.resetAllMocks();
  auth.mockResolvedValue({ user: { tenantId: 'tenant-a', id: 'operator-a' } });
  db.paymentAttempt.findFirst.mockResolvedValue({ id: 'attempt-a', sale_id: 'sale-a', provider: 'pix_manual', status: 'PENDING', method: 'PIX' });
  db.sale.findFirst.mockResolvedValue({ id: 'sale-a', cash_register_session_id: 'register-a' });
  db.cashRegisterSession.findFirst.mockResolvedValue({ id: 'register-a' });
  db.paymentAttempt.updateMany.mockResolvedValue({ count: 1 });
  db.sale.updateMany.mockResolvedValue({ count: 1 });
  db.$transaction.mockImplementation(async callback => callback(db));
});

describe('confirmação manual de Pix recuperada pelo histórico', () => {
  it('conclui somente após confirmação explícita e consulta loja, operador e caixa', async () => {
    expect((await confirm()).status).toBe(200);
    expect(db.paymentAttempt.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'attempt-a', sale_id: 'sale-a', tenant_id: 'tenant-a' } }));
    expect(db.cashRegisterSession.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'register-a', tenant_id: 'tenant-a', user_id: 'operator-a', status: 'OPEN' } }));
    expect(db.sale.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'completed', expires_at: null }) }));
  });
  it('não permite confirmação manual de cobrança online', async () => {
    db.paymentAttempt.findFirst.mockResolvedValue({ provider: 'mercadopago', sale_id: 'sale-a' });
    expect((await confirm()).status).toBe(409);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('rejeita caixa fechado ou de outro operador', async () => {
    db.cashRegisterSession.findFirst.mockResolvedValue(null);
    expect((await confirm()).status).toBe(409);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('rejeita venda expirada ou cancelada durante a confirmação', async () => {
    db.sale.findFirst.mockResolvedValueOnce({ cash_register_session_id: 'register-a' }).mockResolvedValueOnce(null);
    expect((await confirm()).status).toBe(409);
    expect(db.paymentAttempt.updateMany).not.toHaveBeenCalled();
  });
  it('não escreve novamente em confirmação repetida', async () => {
    db.paymentAttempt.findFirst.mockResolvedValue({ provider: 'pix_manual', sale_id: 'sale-a', status: 'APPROVED' });
    expect(await (await confirm()).json()).toMatchObject({ replayed: true });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('exige autenticação', async () => {
    auth.mockResolvedValue(null);
    expect((await confirm()).status).toBe(401);
    expect(db.paymentAttempt.findFirst).not.toHaveBeenCalled();
  });
});

it('bloqueia pendentes, ignora Pix manual abandonado e mantém cobrança online ativa', async () => {
  const findMany = vi.fn().mockResolvedValue([
    { id: 'pending', sale_number: 1, status: 'pending', total_amount: new Prisma.Decimal(10), payment_attempts: [{ provider: 'pix_manual' }] },
    { id: 'cancelled-manual', sale_number: 2, status: 'cancelled', total_amount: new Prisma.Decimal(10), payment_attempts: [{ provider: 'pix_manual' }] },
    { id: 'cancelled-online', sale_number: 3, status: 'cancelled', total_amount: new Prisma.Decimal(10), payment_attempts: [{ provider: 'pagbank' }] },
  ]);
  const issues = await getClosingIssues({ sale: { findMany } } as never, 'tenant-a', 'register-a');
  expect(issues.map(issue => issue.id)).toEqual(['pending', 'cancelled-online']);
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenant_id: 'tenant-a', cash_register_session_id: 'register-a' }) }));
});
