import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { billingMercadoPago, matchesBillingPayment } from '@/lib/billing-payment';
import { isValidMercadoPagoWebhookSignature } from '@/lib/payment/mercadopago-webhook';
import { runSerializableTransaction } from '@/lib/database/transactions';
export async function POST(request: Request) {
  const secret = process.env.SAAS_MERCADOPAGO_WEBHOOK_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: 'Webhook não configurado.' }, { status: 503 });
  const url = new URL(request.url);
  const id = url.searchParams.get('data.id');
  if (!isValidMercadoPagoWebhookSignature({ signature: request.headers.get('x-signature'), requestId: request.headers.get('x-request-id'), dataId: id, secret })) return NextResponse.json({ error: 'Assinatura inválida.' }, { status: 401 });
  if (!id || !/^\d+$/.test(id)) return NextResponse.json({ received: true });
  try {
    const payment = await billingMercadoPago(`/v1/payments/${encodeURIComponent(id)}`);
    const invoice = await prisma.billingRecord.findUnique({ where: { id: String(payment.external_reference ?? '') } });
    if (!invoice || !matchesBillingPayment(payment, invoice)) return NextResponse.json({ received: true, applied: false });
    await runSerializableTransaction(async tx => {
      const fresh = await tx.billingRecord.findUniqueOrThrow({ where: { id: invoice.id } });
      if (fresh.status === 'paid') return;
      await tx.billingRecord.update({ where: { id: invoice.id }, data: { status: 'paid', paid_at: new Date(), external_payment_id: id } });
      const overdue = await tx.billingRecord.count({ where: { tenant_id: invoice.tenant_id, status: { in: ['pending', 'overdue'] }, paid_at: null, due_at: { lt: new Date() } } });
      await tx.tenantSubscription.updateMany({ where: { tenant_id: invoice.tenant_id, trial_ends_at: { lte: new Date() } }, data: { status: overdue ? 'OVERDUE' : 'ACTIVE' } });
    });
    return NextResponse.json({ received: true });
  } catch { return NextResponse.json({ error: 'Falha ao reconciliar pagamento.' }, { status: 500 }); }
}
