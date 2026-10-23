import { NextResponse } from 'next/server';
import { PaymentAttemptStatus } from '@prisma/client';
import { getPaymentSettingsAccess } from '@/lib/payment/settings-auth';
import { prisma } from '@/lib/prisma';
import { runSerializableTransaction } from '@/lib/database/transactions';
import { applyPaymentResult } from '@/lib/sales/payment-result';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Simulates a successful provider callback for local/Sandbox validation only. */
export async function POST(_request: Request, context: { params: Promise<{ id: string; attemptId: string }> }) {
  const params = await context.params;
  if (process.env.NODE_ENV === 'production' || process.env.PAYMENTS_TEST_ENABLED !== 'true') {
    return NextResponse.json({ error: 'A simulação de pagamento está desativada.' }, { status: 404 });
  }

  const access = await getPaymentSettingsAccess();
  if (!access.authorized) {
    return NextResponse.json({ error: 'Acesso não autorizado. Entre com uma conta owner ou admin.' }, { status: access.status });
  }

  const attempt = await prisma.paymentAttempt.findFirst({
    where: {
      id: params.attemptId,
      sale_id: params.id,
      tenant_id: access.tenantId,
    },
    include: {
      gateway_config: { select: { provider: true, environment: true } },
      sale: { select: { status: true, expires_at: true } },
    },
  });
  if (!attempt) return NextResponse.json({ error: 'Tentativa de pagamento não encontrada nesta loja.' }, { status: 404 });
  if (attempt.provider !== 'mercadopago' || attempt.method !== 'PIX' ||
    attempt.gateway_config?.provider !== 'mercadopago' || attempt.gateway_config.environment !== 'sandbox') {
    return NextResponse.json({ error: 'A simulação aceita somente Pix do Mercado Pago Sandbox.' }, { status: 409 });
  }
  if (!attempt.external_order_id) {
    return NextResponse.json({ error: 'A tentativa ainda não possui uma Order Pix do provedor.' }, { status: 409 });
  }

  if (attempt.status === PaymentAttemptStatus.APPROVED) {
    if (!attempt.is_simulated) {
      return NextResponse.json({ error: 'O Mercado Pago já confirmou esta tentativa; não é possível simulá-la novamente.' }, { status: 409 });
    }
    const sale = await prisma.sale.findFirst({
      where: { id: attempt.sale_id, tenant_id: access.tenantId },
      select: { status: true },
    });
    return NextResponse.json({ status: 'approved', saleCompleted: sale?.status === 'completed', replayed: true });
  }
  if (attempt.status !== PaymentAttemptStatus.CREATED && attempt.status !== PaymentAttemptStatus.PENDING) {
    return NextResponse.json({ error: 'Somente cobranças pendentes podem ser aprovadas pela simulação.' }, { status: 409 });
  }
  if (attempt.sale.status !== 'pending' || (attempt.sale.expires_at && attempt.sale.expires_at <= new Date())) {
    return NextResponse.json({ error: 'A venda expirou ou já foi processada.' }, { status: 409 });
  }

  try {
    const result = await runSerializableTransaction(async (tx) => {
      const pendingAttempt = await tx.paymentAttempt.findFirst({
        where: {
          id: attempt.id,
          sale_id: attempt.sale_id,
          tenant_id: access.tenantId,
          status: { in: [PaymentAttemptStatus.CREATED, PaymentAttemptStatus.PENDING] },
        },
        select: { id: true, external_order_id: true, method: true },
      });
      if (!pendingAttempt || !pendingAttempt.external_order_id) return null;

      const applied = await applyPaymentResult(tx, {
        tenantId: access.tenantId,
        saleId: attempt.sale_id,
        attemptId: pendingAttempt.id,
        method: pendingAttempt.method.toLowerCase(),
        result: { status: 'approved', externalId: pendingAttempt.external_order_id },
      });
      await tx.paymentAttempt.update({
        where: { id: pendingAttempt.id },
        data: { is_simulated: true },
      });
      const sale = await tx.sale.findFirst({
        where: { id: attempt.sale_id, tenant_id: access.tenantId },
        select: { status: true },
      });
      return { attempt: applied.attempt, saleCompleted: sale?.status === 'completed' };
    });

    if (!result) return NextResponse.json({ error: 'A tentativa deixou de estar pendente.' }, { status: 409 });
    return NextResponse.json({
      status: result.attempt.status.toLowerCase(),
      saleCompleted: result.saleCompleted,
      simulated: true,
      message: result.saleCompleted
        ? 'Aprovação Sandbox simulada; venda concluída.'
        : 'Pix aprovado na simulação; a venda continua pendente porque ainda há saldo em aberto.',
    });
  } catch (error) {
    console.error('Falha ao simular aprovação Pix Sandbox:', error);
    return NextResponse.json({ error: 'Não foi possível simular a aprovação do Pix.' }, { status: 500 });
  }
}
