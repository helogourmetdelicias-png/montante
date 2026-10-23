import { auth } from '@/auth';
import { runSerializableTransaction } from '@/lib/database/transactions';
import { prisma } from '@/lib/prisma';
import { cancelSaleAndRestore, releaseExpiredSales } from '@/lib/sales/reservations';
import { cancelProviderOrdersForSale } from '@/lib/sales/provider-order-lifecycle';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const cancelSaleSchema = z.object({ cashRefunded: z.boolean().optional() }).default({});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return NextResponse.json({ error: 'Entre na sua conta para cancelar a venda.' }, { status: 401 });
  const parsed = cancelSaleSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Dados de cancelamento inválidos.' }, { status: 400 });

  try {
    const providerState = await cancelProviderOrdersForSale(tenantId, params.id);
    if (providerState === 'not_found') return NextResponse.json({ error: 'Venda não encontrada nesta loja.' }, { status: 404 });
    if (providerState === 'payment_received') {
      return NextResponse.json({ error: 'O provedor informou pagamento aprovado; a venda precisa de conciliação.' }, { status: 409 });
    }
    if (providerState === 'still_pending') {
      return NextResponse.json({ error: 'A cobrança continua ativa no gateway. O estoque foi mantido reservado para evitar venda duplicada.' }, { status: 409 });
    }

    const result = await runSerializableTransaction(async (tx) => {
      const now = new Date();
      await releaseExpiredSales(tx, tenantId, now);
      // Ajustado pela auditoria: verificar se há cobrança pagbank ou pagarme ainda pendente de conciliação
      if (await tx.paymentAttempt.findFirst({ where: { tenant_id: tenantId, sale_id: params.id, provider: { in: ['pagbank', 'pagarme'] }, status: { in: ['CREATED', 'PENDING', 'APPROVED'] } }, select: { id: true } })) return { state: 'provider_pending' as const };
      const sale = await tx.sale.findFirst({
        where: { id: params.id, tenant_id: tenantId },
        select: { status: true },
      });
      if (!sale) return { state: 'not_found' as const };
      if (sale.status !== 'pending' && sale.status !== 'cancelled') return { state: 'not_pending' as const };
      const cashPaid = await tx.paymentAttempt.aggregate({
        where: { tenant_id: tenantId, sale_id: params.id, provider: 'cash', status: 'APPROVED' },
        _sum: { amount: true },
      });
      if (cashPaid._sum.amount?.greaterThan(0) && !parsed.data.cashRefunded) {
        return { state: 'cash_refund_required' as const, cashToReturn: cashPaid._sum.amount.toFixed(2) };
      }
      if (cashPaid._sum.amount?.greaterThan(0) && parsed.data.cashRefunded) {
        await tx.paymentAttempt.updateMany({
          where: { tenant_id: tenantId, sale_id: params.id, provider: 'cash', status: 'APPROVED' },
          data: { status: 'REFUNDED' },
        });
      }
      return cancelSaleAndRestore(tx, tenantId, params.id);
    });

    // Ajustado pela auditoria: mensagem genérica cobrindo provedores de pagamento pendente
    if (result.state === 'provider_pending') return NextResponse.json({ error: 'A cobrança no provedor ainda precisa ser conciliada. O estoque continua reservado.' }, { status: 409 });
    if (result.state === 'cash_refund_required') {
      return NextResponse.json({
        error: 'A venda recebeu uma parcela em dinheiro. Devolva esse valor ao cliente antes de cancelar.',
        cashRefundRequired: true,
        cashToReturn: result.cashToReturn,
      }, { status: 409 });
    }
    if (result.state === 'not_found') return NextResponse.json({ error: 'Venda não encontrada nesta loja.' }, { status: 404 });
    if (result.state === 'not_pending') return NextResponse.json({ error: 'Somente vendas pendentes podem ser canceladas.' }, { status: 409 });
    return NextResponse.json({ status: 'cancelled', stockRestored: true });
  } catch (error) {
    console.error('Falha ao cancelar venda:', error);
    return NextResponse.json({ error: 'Não foi possível cancelar a venda.' }, { status: 500 });
  }
}
