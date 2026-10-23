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
  private readonly pixKey: string;
  private readonly pixKeyType: string;
  private readonly merchantName: string;
  private readonly merchantCity: string;

  constructor(
    pixKey: string,
    pixKeyType: string,
    merchantName = '',
    merchantCity = ''
  ) {
    this.pixKey = pixKey;
    this.pixKeyType = pixKeyType;
    this.merchantName = merchantName;
    this.merchantCity = merchantCity;
  }

  async charge(request: ChargeRequest): Promise<ChargeResponse> {
    if (request.method !== 'pix' || request.channel !== 'online') {
      throw new Error('Pix manual suporta somente pagamentos Pix online.');
    }
    const { resolveManualPixConfig, createManualPixPayment } = await import('./pix-manual');
    const config = resolveManualPixConfig({ pix_key: this.pixKey, pix_key_type: this.pixKeyType, merchant_name: this.merchantName, merchant_city: this.merchantCity });
    return {
      provider: 'pix_manual',
      method: 'pix',
      channel: 'online',
      status: 'pending',
      ...await createManualPixPayment(config, request.amount, request.idempotencyKey),
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
  private readonly accessToken: string;
  private readonly apiBaseUrl: string;

  constructor(
    accessToken: string,
    apiBaseUrl = 'https://api.mercadopago.com'
  ) {
    this.accessToken = accessToken;
    this.apiBaseUrl = apiBaseUrl;
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
  private readonly apiKey: string;
  private readonly apiBaseUrl: string;

  constructor(
    apiKey: string,
    apiBaseUrl = 'https://api.pagar.me/core/v5',
  ) {
    this.apiKey = apiKey.trim();
    this.apiBaseUrl = apiBaseUrl;
    if (!apiKey.trim()) throw new Error('Chave secreta do Pagar.me não configurada.');
  }

  private get authorization() {
    return `Basic ${Buffer.from(`${this.apiKey}:`).toString('base64')}`;
  }

  private getErrorDetail(data: unknown) {
    if (!data || typeof data !== 'object') return '';
    const payload = data as { message?: unknown; errors?: unknown };
    if (typeof payload.message === 'string') return payload.message.slice(0, 240);
    if (Array.isArray(payload.errors)) {
      const message = payload.errors.find((item) => item && typeof item === 'object' && typeof (item as { message?: unknown }).message === 'string') as { message: string } | undefined;
      if (message) return message.message.slice(0, 240);
    }
    if (payload.errors && typeof payload.errors === 'object') {
      for (const value of Object.values(payload.errors)) {
        const first = Array.isArray(value) ? value[0] : value;
        if (typeof first === 'string') return first.slice(0, 240);
        if (first && typeof first === 'object' && typeof (first as { message?: unknown }).message === 'string') {
          return (first as { message: string }).message.slice(0, 240);
        }
      }
    }
    return '';
  }

  async charge(request: ChargeRequest): Promise<ChargeResponse> {
    if (request.method !== 'pix' || request.channel !== 'online') {
      throw new Error('Pagar.me está habilitado para Pix online; cartões físicos devem ser cobrados na maquininha.');
    }
    if (!Number.isSafeInteger(request.amount) || request.amount < 1) {
      throw new Error('O valor da cobrança deve ser informado em centavos inteiros.');
    }
    if (!request.customerName?.trim() || !request.customerEmail || !request.customerDocument || !request.customerPhone) {
      throw new Error('Pix Pagar.me exige nome, e-mail, CPF/CNPJ e telefone do comprador.');
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
          ...(request.customerAddress ? { address: {
            country: 'BR',
            zip_code: request.customerAddress.zipCode.replace(/\D/g, ''),
            line_1: `${request.customerAddress.number}, ${request.customerAddress.street}, ${request.customerAddress.neighborhood}`.slice(0, 255),
            city: request.customerAddress.city,
            state: request.customerAddress.state.toUpperCase(),
          } } : {}),
        },
        payments: [{ payment_method: 'pix', pix: { expires_in: 1800 } }],
        closed: true,
      }),
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      throw new Error('Pagar.me recusou a chave de API (401). Em Configurações → Pagamentos, salve novamente a chave secreta da API v5 obtida no painel Pagar.me (sk_...). Para Sandbox, use sk_test_...; chaves públicas pk_... e chaves antigas ak_... não servem para esta integração.');
    }
    if (!response.ok) {
      const detail = this.getErrorDetail(data);
      throw new Error(`Pagar.me retornou erro ${response.status}${detail ? ` (${detail})` : ''}.`);
    }

    const transaction = data.last_transaction ?? data.charges?.[0]?.last_transaction;
    if (!data.id || !transaction?.qr_code) {
      const detail = this.getErrorDetail(transaction?.gateway_response);
      throw new Error(`Pagar.me não gerou o Pix${detail ? ` (${detail})` : '. Confira se o Pix está habilitado na conta e se a chave corresponde ao ambiente configurado'}.`);
    }
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

  // Ajustado pela auditoria: implementação de cancelOrder para Pagar.me garantindo validação de status e cancelamento de cobrança aberta
  async cancelOrder(externalId: string): Promise<'cancelled' | 'approved' | 'pending'> {
    const response = await fetch(`${this.apiBaseUrl}/orders/${encodeURIComponent(externalId)}`, {
      headers: { Authorization: this.authorization },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Pagar.me retornou erro ${response.status} ao consultar o pedido para cancelamento.`);
    const data = await response.json();
    const transactionStatus = data.last_transaction?.status ?? data.charges?.[0]?.last_transaction?.status;
    if (transactionStatus === 'paid' || data.status === 'paid') return 'approved';
    if (['canceled', 'cancelled', 'failed', 'chargedback'].includes(transactionStatus) || ['canceled', 'cancelled', 'failed'].includes(data.status)) return 'cancelled';

    const chargeId = data.charges?.[0]?.id;
    if (chargeId) {
      try {
        const cancelResponse = await fetch(`${this.apiBaseUrl}/charges/${encodeURIComponent(chargeId)}`, {
          method: 'DELETE',
          headers: { Authorization: this.authorization, 'Content-Type': 'application/json' },
          cache: 'no-store',
        });
        if (cancelResponse.ok) return 'cancelled';
        if (cancelResponse.status === 409 || cancelResponse.status === 422) {
          const freshStatus = await this.checkStatus(externalId);
          return freshStatus === 'declined' ? 'cancelled' : freshStatus === 'approved' ? 'approved' : freshStatus === 'cancelled' ? 'cancelled' : 'pending';
        }
      } catch {
        // Em caso de falha de rede temporária, recorre à checagem do estado atual
      }
    }
    const current = await this.checkStatus(externalId);
    return current === 'declined' ? 'cancelled' : current === 'approved' ? 'approved' : current === 'cancelled' ? 'cancelled' : 'pending';
  }
}

export class AsaasGateway implements PaymentGateway {
  readonly provider: PaymentProvider = 'asaas';
  private readonly apiKey: string;
  private readonly sandbox: boolean;

  constructor(
    apiKey: string,
    sandbox: boolean = false
  ) {
    this.apiKey = apiKey;
    this.sandbox = sandbox;
  }

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

export class PagBankUncertainError extends Error {
  readonly externalId?: string;
  constructor(externalId?: string) { super('PagBank: não foi possível confirmar o resultado da solicitação. A cobrança foi mantida pendente para conciliação, sem liberar o estoque ou gerar outra cobrança.'); this.externalId = externalId; }
}

export class PagBankGateway implements PaymentGateway {
  readonly provider: PaymentProvider = 'pagbank';
  private readonly token: string;
  private readonly apiBaseUrl: string;

  constructor(token: string, environment: 'sandbox' | 'production' = 'sandbox') {
    if (typeof token !== 'string' || !token.trim()) throw new Error('Informe o token da API de Pedidos PagBank.');
    this.token = token.trim();
    this.apiBaseUrl = environment === 'production' ? 'https://api.pagseguro.com' : 'https://sandbox.api.pagseguro.com';
  }

  private headers() { return { Authorization: `Bearer ${this.token}`, Accept: 'application/json', 'Content-Type': 'application/json' }; }

  private paymentState(data: any, expectedAmount?: number): 'pending' | 'approved' | 'declined' | 'cancelled' {
    const charge = data?.charges?.[0];
    if (!charge || data.charges.length !== 1 || charge.payment_method?.type !== 'PIX' || charge.amount?.currency !== 'BRL' ||
      !Number.isSafeInteger(charge.amount?.value) || (expectedAmount !== undefined && charge.amount.value !== expectedAmount)) throw new Error('PagBank retornou dados de cobrança incompatíveis. Concilie o pedido antes de continuar.');
    if (charge.status === 'PAID') {
      if (charge.amount.summary?.refunded > 0 || (charge.amount.summary?.paid !== undefined && charge.amount.summary.paid !== charge.amount.value)) throw new Error('PagBank retornou pagamento com valores divergentes. Concilie o pedido.');
      return 'approved';
    }
    if (charge.status === 'CANCELED') return 'cancelled';
    if (charge.status === 'DECLINED') return 'declined';
    return 'pending';
  }

  async charge(request: ChargeRequest): Promise<ChargeResponse> {
    if (request.method !== 'pix' || request.channel !== 'online') throw new Error('PagBank está habilitado somente para Pix online.');
    if (!Number.isSafeInteger(request.amount) || request.amount < 1 || request.amount > 999999999) throw new Error('Valor inválido para Pix PagBank.');
    const document = request.customerDocument?.replace(/\D/g, '') ?? '';
    if (!request.customerName?.trim() || !request.customerEmail || ![11, 14].includes(document.length)) throw new Error('Pix PagBank exige nome, e-mail e CPF/CNPJ do comprador.');
    const key = request.idempotencyKey ?? crypto.randomUUID();
    let response: Response;
    try {
      response = await fetch(`${this.apiBaseUrl}/orders`, {
        method: 'POST', headers: { ...this.headers(), 'x-idempotency-key': key }, redirect: 'error', signal: AbortSignal.timeout(15000), cache: 'no-store',
        body: JSON.stringify({ reference_id: key, customer: { name: request.customerName.trim(), email: request.customerEmail, tax_id: document },
          items: [{ reference_id: key, name: request.description.slice(0, 100), quantity: 1, unit_amount: request.amount }],
          charges: [{ reference_id: key, description: request.description.slice(0, 64), amount: { value: request.amount, currency: 'BRL' },
            payment_method: { type: 'PIX', pix: { expiration_date: new Date(Date.now() + 30 * 60000).toISOString() } } }],
        }),
      });
    } catch { throw new PagBankUncertainError(); }
    const data = await response.json().catch(() => null);
    if (response.status >= 500 || response.status === 408 || response.status === 409) throw new PagBankUncertainError();
    if (response.status === 401 || response.status === 403) throw new Error(`PagBank recusou a autenticação ou permissão (${response.status}). Confira o token da API de Pedidos e o ambiente selecionado; Sandbox e Produção usam tokens diferentes.`);
    if (!response.ok) throw new Error(`PagBank recusou o pedido (HTTP ${response.status}). Confira os dados do comprador, a chave Pix ativa na conta e a liberação da API.`);
    if (!data?.id || typeof data.id !== 'string') throw new PagBankUncertainError();
    let status;
    try { status = this.paymentState(data, request.amount); } catch { throw new PagBankUncertainError(data.id); }
    const charge = data.charges[0];
    if (status === 'pending' && !charge.qr_code?.text) throw new PagBankUncertainError(data.id);
    const imageLink = charge.links?.find((link: { rel: string }) => link.rel === 'QRCODE.PNG')?.href;
    const imageUrl = typeof imageLink === 'string' && imageLink.startsWith(`${this.apiBaseUrl}/qrcode/`) ? imageLink : undefined;
    return { provider: this.provider, method: 'pix', channel: 'online', externalId: data.id, status, pixCopyPaste: charge.qr_code?.text, pixQrCodeUrl: imageUrl };
  }

  async checkStatus(externalId: string, expectedAmount?: number): Promise<'pending' | 'approved' | 'declined' | 'cancelled'> {
    const response = await fetch(`${this.apiBaseUrl}/orders/${encodeURIComponent(externalId)}`, { headers: this.headers(), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`PagBank não confirmou o pedido (HTTP ${response.status}).`);
    const data = await response.json();
    if (data.id !== externalId) throw new Error('PagBank retornou outro pedido.');
    return this.paymentState(data, expectedAmount);
  }

  /** A live Pix is never locally cancelled; wait for provider-confirmed expiration/cancellation. */
  async cancelOrder(externalId: string, expectedAmount: number): Promise<'cancelled' | 'approved' | 'pending'> {
    const state = await this.checkStatus(externalId, expectedAmount);
    return state === 'declined' ? 'cancelled' : state;
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
  publicData?: { pixKey?: string; pixKeyType?: string; merchantName?: string; merchantCity?: string; environment?: string }
): PaymentGateway {
  switch (provider) {
    case 'pix_manual':
      return new PixManualGateway(
        publicData?.pixKey ?? '',
        publicData?.pixKeyType ?? '',
        publicData?.merchantName,
        publicData?.merchantCity
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
      return new PagBankGateway(credentials.token as string, publicData?.environment === 'production' ? 'production' : 'sandbox');
    case 'stone_ton':
      return new StoneTonGateway();
    case 'external_terminal':
      return new ExternalTerminalGateway();
    default:
      throw new Error(`Gateway não suportado: ${provider}`);
  }
}
