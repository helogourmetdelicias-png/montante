import type { PaymentChannel, PaymentMethod, PaymentProvider } from './gateway-adapter';

export type ProviderIntegrationState = 'available' | 'planned';

export type PaymentProviderDefinition = {
  id: PaymentProvider;
  label: string;
  state: ProviderIntegrationState;
  available: { methods: PaymentMethod[]; channels: PaymentChannel[] };
  planned: { methods: PaymentMethod[]; channels: PaymentChannel[] };
  requiresMerchantAuthorization: boolean;
};

/** Capabilities shown to tenants. A planned option must not be enabled for real charges yet. */
export const PAYMENT_PROVIDER_CATALOG: PaymentProviderDefinition[] = [
  {
    id: 'mercadopago',
    label: 'Mercado Pago',
    state: 'available',
    available: { methods: ['pix'], channels: ['online'] },
    planned: { methods: ['credit_card', 'debit_card'], channels: ['online', 'terminal'] },
    requiresMerchantAuthorization: true,
  },
  {
    id: 'pagarme',
    label: 'Pagar.me (Stone)',
    state: 'available',
    available: { methods: ['pix'], channels: ['online'] },
    planned: { methods: ['credit_card', 'debit_card'], channels: ['terminal'] },
    requiresMerchantAuthorization: true,
  },
  {
    id: 'stone_ton',
    label: 'Stone / Ton (API direta)',
    state: 'planned',
    available: { methods: [], channels: [] },
    planned: { methods: ['credit_card', 'debit_card'], channels: ['terminal'] },
    requiresMerchantAuthorization: true,
  },
  {
    id: 'asaas',
    label: 'Asaas',
    state: 'planned',
    available: { methods: [], channels: [] },
    planned: { methods: ['pix', 'credit_card'], channels: ['online'] },
    requiresMerchantAuthorization: true,
  },
  {
    id: 'pagbank',
    label: 'PagBank',
    state: 'planned',
    available: { methods: [], channels: [] },
    planned: { methods: ['pix', 'credit_card', 'debit_card'], channels: ['online', 'terminal'] },
    requiresMerchantAuthorization: true,
  },
  {
    id: 'pix_manual',
    label: 'Pix manual / outro',
    state: 'available',
    available: { methods: ['pix'], channels: ['online'] },
    planned: { methods: [], channels: [] },
    requiresMerchantAuthorization: false,
  },
  {
    id: 'external_terminal',
    label: 'Maquininha externa (registro manual)',
    state: 'available',
    available: { methods: ['credit_card', 'debit_card'], channels: ['external_terminal'] },
    planned: { methods: [], channels: [] },
    requiresMerchantAuthorization: false,
  },
];

export function getProviderDefinition(provider: PaymentProvider) {
  return PAYMENT_PROVIDER_CATALOG.find((definition) => definition.id === provider);
}

export function isCapabilityAvailable(
  provider: PaymentProvider,
  method: PaymentMethod,
  channel: PaymentChannel
) {
  const definition = getProviderDefinition(provider);
  return Boolean(
    definition?.available.methods.includes(method) &&
      definition.available.channels.includes(channel)
  );
}
