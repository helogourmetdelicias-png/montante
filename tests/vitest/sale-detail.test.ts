import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Prisma } from '@prisma/client';
const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock('@/auth', () => ({ auth: async () => ({ user: { tenantId: 'tenant-a', id: 'operator-a' } }) }));
vi.mock('@/lib/prisma', () => ({ prisma: { sale: { findFirst } } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }), notFound: () => { throw new Error('NOT_FOUND'); }, redirect: vi.fn() }));
import SaleDetail from '../../src/app/vendas/[id]/page';

beforeEach(() => {
  findFirst.mockResolvedValue({
    id: 'sale-a', sale_number: 1, status: 'pending', tenant: { name: 'Loja de teste' },
    total_amount: new Prisma.Decimal('25.90'), discount_amount: new Prisma.Decimal(0),
    created_at: new Date(), expires_at: new Date(Date.now() + 60000), items: [],
    cash_register_session: { status: 'OPEN', user_id: 'operator-a', user: { name: 'Operador' } },
    payment_attempts: [{ id: 'attempt-a', provider: 'pix_manual', status: 'PENDING', method: 'PIX', amount: new Prisma.Decimal('25.90') }],
  });
});

it('histórico exibe confirmação e cancelamento para venda pendente', async () => {
  const html = renderToStaticMarkup(await SaleDetail({ params: Promise.resolve({ id: 'sale-a' }), searchParams: Promise.resolve({}) }));
  expect(html).toContain('Confirmar recebimento');
  expect(html).toContain('Cancelar venda');
  expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'sale-a', tenant_id: 'tenant-a' } }));
});

it('comprovante embutido não mostra controles de operação', async () => {
  const html = renderToStaticMarkup(await SaleDetail({ params: Promise.resolve({ id: 'sale-a' }), searchParams: Promise.resolve({ embedded: '1' }) }));
  expect(html).not.toContain('Confirmar recebimento');
  expect(html).not.toContain('Cancelar venda');
});
