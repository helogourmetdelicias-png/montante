import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { createServiceOrderSchema, updateServiceOrderSchema, canTransitionServiceOrder } from '../../src/lib/service-orders/validation';
import { completeServiceOrder } from '../../src/lib/service-orders/complete';
import { BUSINESS_NICHES, getNicheCategories } from '../../src/lib/business-niche';
const { db, auth } = vi.hoisted(() => ({ db: { serviceOrder: { findFirst: vi.fn() } }, auth: vi.fn() }));
vi.mock('@/auth', () => ({ auth }));
vi.mock('@/lib/prisma', () => ({ prisma: db }));
import { GET } from '../../src/app/api/service-orders/[id]/route';
const input = { clientName: 'Cliente Teste', clientPhone: '(21) 99999-9999', deviceType: 'Notebook', deviceBrandModel: 'Modelo teste', reportedDefect: 'Não liga', aestheticCondition: 'Riscos na tampa', laborTotal: 80, parts: [], photoUrls: [] };
beforeEach(() => { vi.resetAllMocks(); auth.mockResolvedValue({ user: { tenantId: 'tenant-a', id: 'operator' } }); });
describe('ordens de serviço', () => {
  it('inclui os novos nichos com categorias sem alterar os anteriores', () => {
    expect(BUSINESS_NICHES).toContain('PHONE_REPAIR'); expect(BUSINESS_NICHES).toContain('IT_SUPPORT');
    expect(getNicheCategories('PHONE_REPAIR')).toContain('Baterias'); expect(getNicheCategories('IT_SUPPORT')).toContain('Memórias');
  });
  it('aceita mão de obra sem peças e rejeita campos de outra loja e totais enviados', () => {
    expect(createServiceOrderSchema.safeParse(input).success).toBe(true);
    expect(createServiceOrderSchema.safeParse({ ...input, tenantId: 'other' }).success).toBe(false);
    expect(createServiceOrderSchema.safeParse({ ...input, grandTotal: 0.01 }).success).toBe(false);
  });
  it('rejeita precisão monetária incorreta, valores negativos e fotos sem HTTPS', () => {
    for (const laborTotal of [-1, 10.999, NaN, Infinity]) expect(createServiceOrderSchema.safeParse({ ...input, laborTotal }).success).toBe(false);
    for (const url of ['javascript:alert(1)', 'http://example.com/photo.jpg']) expect(createServiceOrderSchema.safeParse({ ...input, photoUrls: [url] }).success).toBe(false);
  });
  it('não permite concluir por edição, exige versão e impede reabrir encerradas', () => {
    expect(updateServiceOrderSchema.safeParse({ ...input, version: 1, status: 'COMPLETED' }).success).toBe(false);
    expect(updateServiceOrderSchema.safeParse({ ...input, status: 'READY' }).success).toBe(false);
    expect(canTransitionServiceOrder('COMPLETED', 'READY')).toBe(false);
    expect(canTransitionServiceOrder('CANCELLED', 'IN_PROGRESS')).toBe(false);
    expect(canTransitionServiceOrder('IN_PROGRESS', 'READY')).toBe(true);
  });
  it('consulta usa somente a loja da sessão e resolve parâmetros assíncronos', async () => {
    db.serviceOrder.findFirst.mockResolvedValue(null);
    expect((await GET(new Request('https://test.invalid/api/service-orders/other'), { params: Promise.resolve({ id: 'other' }) })).status).toBe(404);
    expect(db.serviceOrder.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'other', tenant_id: 'tenant-a' } }));
  });
  it('não consulta banco sem sessão', async () => {
    auth.mockResolvedValue(null);
    expect((await GET(new Request('https://test.invalid'), { params: Promise.resolve({ id: 'order' }) })).status).toBe(401);
    expect(db.serviceOrder.findFirst).not.toHaveBeenCalled();
  });
});

function completionFixture({ status = 'READY', paid = '100', stock = true, claimed = 1, saleTotal = '100' } = {}) {
  return {
    serviceOrder: { findFirst: vi.fn().mockResolvedValue({ id: 'order', status, version: 2, grand_total: new Prisma.Decimal(100), parts: [{ product_id: 'part', quantity: new Prisma.Decimal(2) }] }), updateMany: vi.fn().mockResolvedValue({ count: claimed }) },
    sale: { findFirst: vi.fn().mockResolvedValue({ total_amount: new Prisma.Decimal(saleTotal) }) },
    paymentAttempt: { aggregate: vi.fn().mockResolvedValue({ _sum: { amount: new Prisma.Decimal(paid) } }) },
    product: { updateMany: vi.fn().mockResolvedValue({ count: stock ? 1 : 0 }) },
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'part', is_active: true, stock_quantity: new Prisma.Decimal(stock ? 2 : 0) }]),
  };
}
it('baixa a peça na conclusão paga e remove a senha', async () => {
  const tx = completionFixture();
  await completeServiceOrder(tx as never, 'tenant-a', 'order', 'sale', new Date());
  expect(tx.product.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenant_id: 'tenant-a', stock_quantity: { gte: new Prisma.Decimal(2) } }), data: { stock_quantity: { decrement: new Prisma.Decimal(2) } } }));
  expect(tx.serviceOrder.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED', device_password_encrypted: null }) }));
});
it.each([{ status: 'COMPLETED' }, { paid: '99.99' }, { claimed: 0 }, { saleTotal: '99' }])('não baixa estoque em condição inválida %j', async options => {
  const tx = completionFixture(options);
  await expect(completeServiceOrder(tx as never, 'tenant-a', 'order', 'sale', new Date())).rejects.toThrow();
  expect(tx.product.updateMany).not.toHaveBeenCalled();
});
it('falha em estoque insuficiente para que a transação de pagamento seja revertida', async () => {
  const tx = completionFixture({ stock: false });
  await expect(completeServiceOrder(tx as never, 'tenant-a', 'order', 'sale', new Date())).rejects.toThrow(/Estoque insuficiente/);
});
it('permite preservar aprovação online enquanto aguarda reposição sem baixa parcial', async () => {
  const tx = completionFixture({ stock: false });
  expect(await completeServiceOrder(tx as never, 'tenant-a', 'order', 'sale', new Date(), true)).toBe(false);
  expect(tx.serviceOrder.updateMany).not.toHaveBeenCalled();
  expect(tx.product.updateMany).not.toHaveBeenCalled();
});
