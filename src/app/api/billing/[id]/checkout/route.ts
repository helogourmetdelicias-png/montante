import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { billingMercadoPago } from '@/lib/billing-payment';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  if (!['owner', 'admin'].includes(session.user.role)) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });
  const invoice = await prisma.billingRecord.findFirst({ where: { id: params.id, tenant_id: session.user.tenantId } });
  if (!invoice) return NextResponse.json({ error: 'Cobrança não encontrada.' }, { status: 404 });
  if (invoice.status === 'paid') return NextResponse.redirect(new URL('/assinatura', request.url), 303);
  const base = process.env.SAAS_BILLING_URL?.replace(/\/$/, '');
  if (!base?.startsWith('https://') || !process.env.SAAS_MERCADOPAGO_WEBHOOK_SECRET?.trim()) return NextResponse.json({ error: 'Recebimento SaaS ainda não configurado.' }, { status: 503 });
  try {
    let checkout = invoice.checkout_url;
    if (!checkout) {
      const preference = await billingMercadoPago('/checkout/preferences', { method: 'POST', body: JSON.stringify({
        external_reference: invoice.id,
        items: [{ id: invoice.id, title: `Montante — ${invoice.plan_tier}`, quantity: 1, currency_id: 'BRL', unit_price: Number(invoice.amount_due) }],
        back_urls: { success: `${base}/assinatura`, pending: `${base}/assinatura`, failure: `${base}/assinatura` },
        notification_url: `${base}/api/webhooks/billing?source_news=webhooks`,
      }) });
      checkout = preference.init_point;
      if (!checkout || !new URL(checkout).hostname.endsWith('.mercadopago.com.br')) throw new Error('Checkout inválido.');
      await prisma.billingRecord.update({ where: { id: invoice.id }, data: { checkout_url: checkout } });
    }
    return NextResponse.redirect(checkout!, 303);
  } catch { return NextResponse.json({ error: 'Não foi possível abrir o pagamento. Tente novamente.' }, { status: 502 }); }
}
