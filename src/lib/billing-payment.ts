export function matchesBillingPayment(payment: { status?: string; currency_id?: string; transaction_amount?: number; external_reference?: string }, invoice: { id: string; amount_due: { toString(): string } }) {
  return payment.status === 'approved' && payment.currency_id === 'BRL' &&
    payment.external_reference === invoice.id && Number.isFinite(payment.transaction_amount) &&
    Math.round(payment.transaction_amount! * 100) === Math.round(Number(invoice.amount_due.toString()) * 100);
}
export async function billingMercadoPago(path: string, init?: RequestInit) {
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();
  if (!token) throw new Error('Recebimento SaaS não configurado.');
  const response = await fetch(`https://api.mercadopago.com${path}`, { ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init?.headers },
    cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Mercado Pago: HTTP ${response.status}`);
  return response.json();
}
