import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decryptCredentials } from '@/lib/encryption';
import { getPaymentSettingsAccess } from '@/lib/payment/settings-auth';
import { testPagarMeConnection } from '@/lib/payment/pagarme-connection';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Tests only the authenticated store's saved Pagar.me credential, without creating payments. */
export async function POST() {
  const access = await getPaymentSettingsAccess();
  if (!access.authorized) return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: access.status });
  const config = await prisma.paymentGatewayConfig.findUnique({ where: { tenant_id_provider: { tenant_id: access.tenantId, provider: 'pagarme' } }, select: { encrypted_credentials: true, environment: true } });
  if (!config?.encrypted_credentials) return NextResponse.json({ error: 'Salve a chave do Pagar.me antes de testar.' }, { status: 400 });
  let key: string;
  try {
    const credentials = decryptCredentials(config.encrypted_credentials);
    if (typeof credentials.api_key !== 'string' || !credentials.api_key.trim()) return NextResponse.json({ error: 'A configuração salva não contém uma chave Pagar.me. Salve-a novamente.' }, { status: 400 });
    key = credentials.api_key.trim();
  } catch {
    return NextResponse.json({ error: 'O servidor não conseguiu abrir a credencial protegida. A configuração ENCRYPTION_KEY precisa ser verificada antes de salvar a chave novamente.' }, { status: 409 });
  }
  const result = await testPagarMeConnection(key);
  const keyEnvironment = key.startsWith('sk_test_') ? 'sandbox' : key.startsWith('sk_') ? 'production' : null;
  return NextResponse.json({ ...result, ...(keyEnvironment && keyEnvironment !== config.environment ? { environmentWarning: `A chave tem formato de ${keyEnvironment === 'sandbox' ? 'teste' : 'produção'}, mas a loja está marcada como ${config.environment === 'sandbox' ? 'Sandbox' : 'Produção'}. O Pagar.me define o ambiente pela chave, não por essa seleção.` } : {}) }, { headers: { 'Cache-Control': 'private, no-store' } });
}
