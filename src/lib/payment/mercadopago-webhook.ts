import { createHmac, timingSafeEqual } from 'node:crypto';

type MercadoPagoSignatureInput = {
  signature: string | null;
  requestId: string | null;
  dataId: string | null;
  secret: string;
};

/** Validates Mercado Pago's HMAC-SHA256 manifest for an Order notification. */
export function isValidMercadoPagoWebhookSignature({ signature, requestId, dataId, secret }: MercadoPagoSignatureInput) {
  if (!signature || !requestId?.trim() || !dataId?.trim() || !secret.trim()) return false;

  const fields = new Map<string, string[]>();
  for (const part of signature.split(',')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key === 'ts' || key === 'v1') fields.set(key, [...(fields.get(key) ?? []), value]);
  }

  const timestamps = fields.get('ts') ?? [];
  const hashes = fields.get('v1') ?? [];
  if (timestamps.length !== 1 || hashes.length !== 1 || !/^\d+$/.test(timestamps[0]) || !/^[a-f\d]{64}$/i.test(hashes[0])) {
    return false;
  }

  // Mercado Pago requires the resource ID in lowercase inside the signed manifest.
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId.trim()};ts:${timestamps[0]};`;
  const expected = createHmac('sha256', secret).update(manifest).digest();
  const received = Buffer.from(hashes[0], 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}
