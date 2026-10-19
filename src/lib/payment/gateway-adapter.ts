/**
 * Adapter Pattern para gateway de pagamento.
 * Cada gateway implementa a mesma interface PaymentGateway.
 * O PDV sempre chama: getPaymentGateway(provider, credentials).charge(request)
 */

export type PaymentProvider = 'mercadopago' | 'stone_ton' | 'asaas' | 'pagbank' | 'pix_manual' | 'external_terminal';
export type PaymentMethod = 'pix' | 'credit_card' | 'debit_card';
export type PaymentChannel = 'online' | 'terminal' | 'external_terminal';

export interface ChargeRequest {
  /** Valor em centavos */
  amount: number;
  method: PaymentMethod;
  channel: PaymentChannel;
  /** Reutilize a mesma chave quando repetir a mesma tentativa de cobrança. */
  idempotencyKey?: string;
  description: string;
  customerName?: string;
  /** CPF ou CNPJ do cliente */
  customerDocument?: string;
  customerEmail?: string;
}

export interface ChargeResponse {
  provider: PaymentProvider;
  method: PaymentMethod;
  channel: PaymentChannel;
  externalId?: string;
  pixQrCode?: string;
  pixCopyPaste?: string;
  paymentUrl?: string;
  status: 'pending' | 'approved' | 'declined' | 'cancelled' | 'error';
  rawResponse?: unknown;
}

export interface PaymentGateway {
  provider: PaymentProvider;
  charge(request: ChargeRequest): Promise<ChargeResponse>;
  checkStatus(
    externalId: string
  ): Promise<'pending' | 'approved' | 'declined' | 'cancelled' | 'error'>;
}

// --- Implementações ---

export class PixManualGateway implements PaymentGateway {
  readonly provider: PaymentProvider = 'pix_manual';

  constructor(
    private readonly pixKey: string,
    private readonly pixKeyType: string
  ) {}

  async charge(request: ChargeRequest): Promise<ChargeResponse> {
    if (request.method !== 'pix' || request.channel !== 'online') {
      throw new Error('Pix manual suporta somente pagamentos Pix online.');
    }
    return {
      provider: 'pix_manual',
      method: 'pix',
      channel: 'online',
      status: 'pending',
      pixCopyPaste: this.pixKey,
    };
  }

  async checkStatus(
    _externalId: string
  ): Promise<'pending' | 'approved' | 'declined' | 'cancelled' | 'error'> {
    return 'pending';
  }
}

export class MercadoPagoGateway implements PaymentGateway {
  readonly provider: PaymentProvider = 'mercadopago';

  constructor(
    private readonly accessToken: string,
    private readonly apiBaseUrl = 'https://api.mercadopago.com'
  ) {
    if (!accessToken.trim()) throw new Error('Access token do Mercado Pago não configurado.');
  }

  async charge(request: ChargeRequest): Promise<ChargeResponse> {
    if (request.method !== 'pix' || request.channel !== 'online') {
      throw new Error('Este fluxo do Mercado Pago está preparado apenas para Pix online. Use a integração de terminal para pagamentos presenciais com cartão.');
    }
    if (!Number.isSafeInteger(request.amount) || request.amount < 1) {
      throw new Error('O valor da cobrança deve ser informado em centavos inteiros.');
    }
    const idempotencyKey = request.idempotencyKey ?? crypto.randomUUID();
    const orderReference = idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
    const response = await fetch(`${this.apiBaseUrl}/v1/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        type: 'online',
        total_amount: (request.amount / 100).toFixed(2),
        external_reference: orderReference,
        processing_mode: 'automatic',
        transactions: {
          payments: [{
            amount: (request.amount / 100).toFixed(2),
            payment_method: { id: 'pix', type: 'bank_transfer' },
          }],
        },
        payer: { email: request.customerEmail },
      }),
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const causeCodes = Array.isArray(data.cause)
        ? data.cause.map((cause: { code?: unknown }) => typeof cause.code === 'string' ? cause.code : '').filter(Boolean)
        : [];
      const errorCode = typeof data.error === 'string' ? data.error : causeCodes.join(',');
      throw new Error(`Mercado Pago Orders retornou erro ${response.status}${errorCode ? ` (${errorCode})` : ''}.`);
    }
    const payment = data.transactions?.payments?.[0];
    const paymentMethod = payment?.payment_method;
    return {
      provider: this.provider,
      method: 'pix',
      channel: 'online',
      externalId: String(data.id),
      pixQrCode: paymentMethod?.qr_code_base64,
      pixCopyPaste: paymentMethod?.qr_code,
      paymentUrl: paymentMethod?.ticket_url,
      status: ['processed', 'accredited'].includes(data.status) || ['processed', 'accredited'].includes(payment?.status)
        ? 'approved'
        : 'pending',
    };
  }

  async checkStatus(externalId: string): Promise<'pending' | 'approved' | 'declined' | 'cancelled' | 'error'> {
    const response = await fetch(`${this.apiBaseUrl}/v1/orders/${encodeURIComponent(externalId)}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Mercado Pago Orders retornou erro ${response.status} ao consultar order.`);
    const data = await response.json();
    const paymentStatus = data.transactions?.payments?.[0]?.status;
    if (['processed', 'accredited'].includes(data.status) || ['processed', 'accredited'].includes(paymentStatus)) return 'approved';
    if (['canceled', 'cancelled', 'expired', 'rejected', 'refunded', 'charged_back'].includes(data.status) ||
      ['canceled', 'cancelled', 'expired', 'rejected', 'refunded', 'charged_back'].includes(paymentStatus)) return 'cancelled';
    return 'pending';
  }

  /** Cancels only orders the provider still considers cancellable; conflicts are reconciled by status. */
  async cancelOrder(externalId: string): Promise<'cancelled' | 'approved' | 'pending'> {
    const response = await fetch(`${this.apiBaseUrl}/v1/orders/${encodeURIComponent(externalId)}/cancel`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': crypto.randomUUID(),
      },
      cache: 'no-store',
    });

    if (response.ok) return 'cancelled';
    if (response.status === 409) {
      const status = await this.checkStatus(externalId);
      return status === 'cancelled' ? 'cancelled' : status === 'approved' ? 'approved' : 'pending';
    }

    throw new Error(`Mercado Pago Orders retornou erro ${response.status} ao cancelar order.`);
  }
}

export class AsaasGateway implements PaymentGateway {
  readonly provider: PaymentProvider = 'asaas';

  constructor(
    private readonly apiKey: string,
    private readonly sandbox: boolean = false
  ) {}

  async charge(_request: ChargeRequest): Promise<ChargeResponse> {
    // TODO: implementar chamada à API do Asaas
    // Referência: https://docs.asaas.com/reference
    throw new Error('Asaas: implementação pendente');
  }

  async checkStatus(
    _externalId: string
  ): Promise<'pending' | 'approved' | 'declined' | 'cancelled' | 'error'> {
    throw new Error('Asaas: implementação pendente');
  }
}

export class PagBankGateway implements PaymentGateway {
  readonly provider: PaymentProvider = 'pagbank';

  constructor(private readonly token: string) {}

  async charge(_request: ChargeRequest): Promise<ChargeResponse> {
    // TODO: implementar chamada à API do PagBank
    throw new Error('PagBank: implementação pendente');
  }

  async checkStatus(
    _externalId: string
  ): Promise<'pending' | 'approved' | 'declined' | 'cancelled' | 'error'> {
    throw new Error('PagBank: implementação pendente');
  }
}

export class StoneTonGateway implements PaymentGateway {
  readonly provider: PaymentProvider = 'stone_ton';

  async charge(_request: ChargeRequest): Promise<ChargeResponse> {
    throw new Error('Stone/Ton: integração pendente de credenciais e documentação do lojista.');
  }

  async checkStatus(_externalId: string): Promise<'pending' | 'approved' | 'declined' | 'cancelled' | 'error'> {
    throw new Error('Stone/Ton: integração pendente de credenciais e documentação do lojista.');
  }
}

/** Represents an external terminal where staff confirms the result in the POS. */
export class ExternalTerminalGateway implements PaymentGateway {
  readonly provider: PaymentProvider = 'external_terminal';

  async charge(request: ChargeRequest): Promise<ChargeResponse> {
    if (!['credit_card', 'debit_card'].includes(request.method)) {
      throw new Error('Terminal externo aceita somente pagamentos por cartão.');
    }
    return {
      provider: this.provider,
      method: request.method,
      channel: 'external_terminal',
      status: 'pending',
    };
  }

  async checkStatus(): Promise<'pending' | 'approved' | 'declined' | 'cancelled' | 'error'> {
    return 'pending';
  }
}

/**
 * Factory: retorna o gateway correto baseado no provider e nas credenciais do tenant.
 */
export function getPaymentGateway(
  provider: PaymentProvider,
  credentials: Record<string, unknown>,
  publicData?: { pixKey?: string; pixKeyType?: string }
): PaymentGateway {
  switch (provider) {
    case 'pix_manual':
      return new PixManualGateway(
        publicData?.pixKey ?? '',
        publicData?.pixKeyType ?? 'aleatoria'
      );
    case 'mercadopago':
      return new MercadoPagoGateway(credentials.access_token as string);
    case 'asaas':
      return new AsaasGateway(
        credentials.api_key as string,
        (credentials.sandbox as boolean) ?? false
      );
    case 'pagbank':
      return new PagBankGateway(credentials.token as string);
    case 'stone_ton':
      return new StoneTonGateway();
    case 'external_terminal':
      return new ExternalTerminalGateway();
    default:
      throw new Error(`Gateway não suportado: ${provider}`);
  }
}
