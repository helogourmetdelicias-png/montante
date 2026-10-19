/**
 * Adapter Pattern para gateway de pagamento.
 * Cada gateway implementa a mesma interface PaymentGateway.
 * O PDV sempre chama: getPaymentGateway(provider, credentials).charge(request)
 */

export type PaymentProvider = 'mercadopago' | 'pagarme' | 'stone_ton' | 'asaas' | 'pagbank' | 'pix_manual' | 'external_terminal';
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
  customerPhone?: string;
  customerAddress?: {
    zipCode: string;
    street: string;
    number: string;
    neighborhood: string;
    city: string;
    state: string;
  };
}

export interface ChargeResponse {
  provider: PaymentProvider;
  method: PaymentMethod;
  channel: PaymentChannel;
  externalId?: string;
  pixQrCode?: string;
  pixQrCodeUrl?: string;
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

/** Pagar.me v5 adapter for online Pix charges (API key is stored encrypted per tenant). */
export class PagarMeGateway implements PaymentGateway {
  readonly provider: PaymentProvider = 'pagarme';

  constructor(
    private readonly apiKey: string,
    private readonly apiBaseUrl = 'https://api.pagar.me/core/v5',
  ) {
    if (!apiKey.trim()) throw new Error('Chave secreta do Pagar.me não configurada.');
  }

  private get authorization() {
    return `Basic ${Buffer.from(`${this.apiKey}:`).toString('base64')}`;
  }

  async charge(request: ChargeRequest): Promise<ChargeResponse> {
    if (request.method !== 'pix' || request.channel !== 'online') {
      throw new Error('Pagar.me está habilitado para Pix online; cartões físicos devem ser cobrados na maquininha.');
    }
    if (!Number.isSafeInteger(request.amount) || request.amount < 1) {
      throw new Error('O valor da cobrança deve ser informado em centavos inteiros.');
    }
    if (!request.customerName?.trim() || !request.customerEmail || !request.customerDocument || !request.customerPhone || !request.customerAddress) {
      throw new Error('Pagar.me exige nome, e-mail, CPF/CNPJ, telefone e endereço do comprador para gerar o Pix.');
    }

    const idempotencyKey = request.idempotencyKey ?? crypto.randomUUID();
    const document = request.customerDocument.replace(/\D/g, '');
    const phone = request.customerPhone.replace(/\D/g, '');
    const response = await fetch(`${this.apiBaseUrl}/orders`, {
      method: 'POST',
      headers: {
        Authorization: this.authorization,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        code: idempotencyKey,
        items: [{ amount: request.amount, description: request.description.slice(0, 64), quantity: 1 }],
        customer: {
          name: request.customerName.trim(),
          email: request.customerEmail,
          document,
          type: document.length > 11 ? 'company' : 'individual',
          phones: { mobile_phone: { country_code: '55', area_code: phone.slice(0, 2), number: phone.slice(2) } },
          address: {
            country: 'BR',
            zip_code: request.customerAddress.zipCode.replace(/\D/g, ''),
            line_1: `${request.customerAddress.number}, ${request.customerAddress.street}, ${request.customerAddress.neighborhood}`.slice(0, 255),
            city: request.customerAddress.city,
            state: request.customerAddress.state.toUpperCase(),
          },
        },
        payments: [{ payment_method: 'pix', pix: { expires_in: 1800 } }],
        closed: true,
      }),
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = typeof data.message === 'string' ? data.message : typeof data.errors?.[0]?.message === 'string' ? data.errors[0].message : '';
      throw new Error(`Pagar.me retornou erro ${response.status}${detail ? ` (${detail})` : ''}.`);
    }

    const transaction = data.last_transaction ?? data.charges?.[0]?.last_transaction;
    if (!data.id || !transaction?.qr_code) throw new Error('Pagar.me criou o pedido sem retornar o código Pix esperado.');
    return {
      provider: this.provider,
      method: 'pix',
      channel: 'online',
      externalId: String(data.id),
      pixCopyPaste: String(transaction.qr_code),
      pixQrCodeUrl: typeof transaction.qr_code_url === 'string' ? transaction.qr_code_url : undefined,
      status: transaction.status === 'paid' || data.status === 'paid' ? 'approved' : 'pending',
      rawResponse: data,
    };
  }

  async checkStatus(externalId: string): Promise<'pending' | 'approved' | 'declined' | 'cancelled' | 'error'> {
    const response = await fetch(`${this.apiBaseUrl}/orders/${encodeURIComponent(externalId)}`, {
      headers: { Authorization: this.authorization },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Pagar.me retornou erro ${response.status} ao consultar o pedido.`);
    const data = await response.json();
    const transactionStatus = data.last_transaction?.status ?? data.charges?.[0]?.last_transaction?.status;
    if (transactionStatus === 'paid' || data.status === 'paid') return 'approved';
    if (['canceled', 'cancelled', 'failed', 'chargedback'].includes(transactionStatus) || ['canceled', 'cancelled', 'failed'].includes(data.status)) return 'cancelled';
    return 'pending';
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
    case 'pagarme':
      return new PagarMeGateway(credentials.api_key as string);
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
