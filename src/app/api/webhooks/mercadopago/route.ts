import { PaymentAttemptStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import { decryptCredentials } from '@/lib/encryption';
import { MercadoPagoGateway } from '@/lib/payment/gateway-adapter';
import { isValidMercadoPagoWebhookSignature } from '@/lib/payment/mercadopago-webhook';
import { prisma } from '@/lib/prisma';
import { applyPaymentResult } from '@/lib/sales/payment-result';
import { runSerializableTransaction } from '@/lib/database/transactions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Verifies and reconciles Mercado Pago Order events without trusting their payload status. */
export async function POST(request: Request) {
  const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    console.error('mercadopago.webhook.configuration_missing');
    return NextResponse.json({ error: 'Webhook Mercado Pago não configurado.' }, { status: 503 });
  }

  const url = new URL(request.url);
  const externalOrderId = url.searchParams.get('data.id')?.trim() ?? '';
  const requestId = request.headers.get('x-request-id');
  const isSignatureValid = isValidMercadoPagoWebhookSignature({
    signature: request.headers.get('x-signature'),
    requestId,
    dataId: externalOrderId,
    secret: webhookSecret,
  });
  if (!isSignatureValid) {
    console.warn('mercadopago.webhook.signature_rejected');
    return NextResponse.json({ error: 'Assinatura do webhook inválida.' }, { status: 401 });
  }

  const eventType = url.searchParams.get('type') ?? url.searchParams.get('topic');
  if (eventType !== 'order') return NextResponse.json({ received: true, ignored: true });
  if (!externalOrderId) return NextResponse.json({ error: 'Identificador da Order ausente.' }, { status: 400 });

  let paymentAttemptId: string | null = null;
  try {
    const attempt = await prisma.paymentAttempt.findFirst({
      where: { provider: 'mercadopago', external_order_id: externalOrderId },
      include: {
        gateway_config: { select: { encrypted_credentials: true } },
        sale: { select: { status: true } },
      },
    });
    paymentAttemptId = attempt?.id ?? null;

    // Unknown resources belong to another integration; acknowledge valid events to avoid endless retries.
    if (!attempt) return NextResponse.json({ received: true, ignored: true });
    if (attempt.status === PaymentAttemptStatus.APPROVED) {
      return NextResponse.json({ received: true, replayed: true, status: 'approved', saleStatus: attempt.sale.status });
    }
    if (attempt.method !== 'PIX' || attempt.channel !== 'ONLINE' || !attempt.gateway_config?.encrypted_credentials) {
      return NextResponse.json({ received: true, ignored: true });
    }

    const credentials = decryptCredentials(attempt.gateway_config.encrypted_credentials);
    const accessToken = credentials.access_token;
    if (typeof accessToken !== 'string' || !accessToken.trim()) {
      throw new Error('Credencial de acesso do Mercado Pago ausente.');
    }

    // Confirm the current provider state; the notification body itself is not payment evidence.
    const providerStatus = await new MercadoPagoGateway(accessToken).checkStatus(externalOrderId);
    if (providerStatus !== 'approved') {
      return NextResponse.json({ received: true, applied: false, providerStatus });
    }

    const result = await runSerializableTransaction(async (tx) => {
      const currentAttempt = await tx.paymentAttempt.findFirst({
        where: {
          id: attempt.id,
          tenant_id: attempt.tenant_id,
          status: { in: [PaymentAttemptStatus.CREATED, PaymentAttemptStatus.PENDING] },
        },
        select: { id: true, sale_id: true, method: true, external_order_id: true },
      });
      if (!currentAttempt) {
        const current = await tx.paymentAttempt.findUnique({ where: { id: attempt.id }, select: { status: true } });
        return {
          replayed: current?.status === PaymentAttemptStatus.APPROVED,
          status: current?.status.toLowerCase() ?? 'unknown',
          saleStatus: attempt.sale.status,
        };
      }

      const applied = await applyPaymentResult(tx, {
        tenantId: attempt.tenant_id,
        saleId: currentAttempt.sale_id,
        attemptId: currentAttempt.id,
        method: currentAttempt.method.toLowerCase(),
        result: { status: 'approved', externalId: currentAttempt.external_order_id ?? externalOrderId },
      });
      const sale = await tx.sale.findFirst({
        where: { id: currentAttempt.sale_id, tenant_id: attempt.tenant_id },
        select: { status: true },
      });
      return { replayed: false, status: applied.attempt.status.toLowerCase(), saleStatus: sale?.status ?? 'unknown' };
    });

    console.info('mercadopago.webhook.order_processed', {
      paymentAttemptId: attempt.id,
      replayed: result.replayed,
      attemptStatus: result.status,
      saleStatus: result.saleStatus,
    });
    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    console.error('mercadopago.webhook.processing_failed', {
      paymentAttemptId,
      error: error instanceof Error ? error.message : 'unknown_error',
    });
    return NextResponse.json({ error: 'Não foi possível processar a notificação do Mercado Pago.' }, { status: 500 });
  }
}
