'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Barcode, Check, ChevronDown, CircleAlert, CreditCard, ImagePlus, LoaderCircle, Minus, PackageSearch, Plus, Search, ShoppingBag, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import StoreNavigation from '@/components/store-navigation';
import { calculateCashChangeCents } from '@/lib/sales/cash-payment';

type Product = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  unitOfMeasure: string;
  sellByFraction: boolean;
  price: string;
  stockQuantity: string;
  stockAisle: string | null;
  stockShelf: string | null;
};

type CartLine = { product: Product; quantity: number };
type PaymentOption = { provider: string; label: string; method: string; channel: string; terminalId?: string; environment?: string; pixProvider?: string };
type Props = { storeName: string; initialLogoUrl: string; canManageBrand: boolean; operatorName: string };

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function money(value: number) {
  return currency.format(value);
}

function errorMessage(payload: unknown, fallback: string) {
  return payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
    ? payload.error
    : fallback;
}

/** One-screen checkout: searchable catalog on the left, live cart and payment on the right. */
export default function PointOfSale({ storeName, initialLogoUrl, canManageBrand, operatorName }: Props) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState('0');
  const [paymentOptions, setPaymentOptions] = useState<PaymentOption[]>([]);
  const [cashRegisterOpen, setCashRegisterOpen] = useState(false);
  const [canSimulatePixApproval, setCanSimulatePixApproval] = useState(false);
  const [selectedOption, setSelectedOption] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerDocument, setCustomerDocument] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerZipCode, setCustomerZipCode] = useState('');
  const [customerStreet, setCustomerStreet] = useState('');
  const [customerNumber, setCustomerNumber] = useState('');
  const [customerNeighborhood, setCustomerNeighborhood] = useState('');
  const [customerCity, setCustomerCity] = useState('');
  const [customerState, setCustomerState] = useState('');
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [logoEditorOpen, setLogoEditorOpen] = useState(false);
  const [logoDraft, setLogoDraft] = useState(initialLogoUrl);
  const [busy, setBusy] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [message, setMessage] = useState('');
  const [saleId, setSaleId] = useState('');
  const [attemptId, setAttemptId] = useState('');
  const [payment, setPayment] = useState<{ pixQrCode?: string; pixQrCodeUrl?: string; pixCopyPaste?: string; paymentUrl?: string } | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [saleTotal, setSaleTotal] = useState<number | null>(null);
  const [cashReceived, setCashReceived] = useState('');
  const [cashChange, setCashChange] = useState<number | null>(null);
  const [cashApplied, setCashApplied] = useState<number | null>(null);
  const [cashAttemptKey, setCashAttemptKey] = useState('');
  const [cashRefundConfirmation, setCashRefundConfirmation] = useState('');
  const [splitCashAmount, setSplitCashAmount] = useState('');

  const subtotal = useMemo(() => cart.reduce((sum, line) => sum + Number(line.product.price) * line.quantity, 0), [cart]);
  const discountValue = Math.min(subtotal, Math.max(0, Number(discount.replace(',', '.')) || 0));
  const total = Math.max(0, subtotal - discountValue);
  const selectedPayment = paymentOptions.find((option) => option.provider + option.method + option.terminalId === selectedOption);
  const needsCustomerEmail = selectedPayment?.provider === 'mercadopago' || selectedPayment?.provider === 'split';
  const customerEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail);
  const needsPagarmeCustomer = selectedPayment?.provider === 'pagarme';
  const pagarmeCustomerValid = Boolean(customerName.trim() && customerEmailValid && customerDocument.replace(/\D/g, '').length >= 11 && customerPhone.replace(/\D/g, '').length >= 10 && customerZipCode.replace(/\D/g, '').length === 8 && customerStreet.trim() && customerNumber.trim() && customerNeighborhood.trim() && customerCity.trim() && customerState.trim().length === 2);
  const sandboxEmailValid = selectedPayment?.environment !== 'sandbox' || customerEmail.toLowerCase().endsWith('@testuser.com');
  const awaitingPayment = Boolean(saleId && attemptId && ['created', 'pending'].includes(paymentStatus));
  const cashDue = Boolean(saleId && ((selectedPayment?.provider === 'cash' && paymentStatus === 'cash_due') ||
    (selectedPayment?.provider === 'split' && paymentStatus === 'split_cash_due')));
  const paymentEditable = !saleId || (!awaitingPayment && !cashDue && cashApplied === null);
  const amountDue = saleTotal ?? total;
  const cashReceivedCents = Math.round((Number(cashReceived.replace(',', '.')) || 0) * 100);
  const splitCashCents = Math.round((Number(splitCashAmount.replace(',', '.')) || 0) * 100);
  const activeCashContribution = selectedPayment?.provider === 'split' ? splitCashCents : Math.round(amountDue * 100);
  const cashChangeCents = calculateCashChangeCents(activeCashContribution, cashReceivedCents);
  const splitPixBalanceCents = Math.round(amountDue * 100) - splitCashCents;

  // Debounced search keeps the barcode field responsive without sending a request per keystroke.
  useEffect(() => {
    const timer = window.setTimeout(async () => {
      setLoadingProducts(true);
      try {
        const params = new URLSearchParams({ limit: '30' });
        if (query.trim()) params.set('q', query.trim());
        const response = await fetch(`/api/products?${params}`, { cache: 'no-store' });
        const result = await response.json();
        if (!response.ok) throw new Error(errorMessage(result, 'Não foi possível carregar o catálogo.'));
        setProducts(result.products as Product[]);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Não foi possível carregar o catálogo.');
      } finally {
        setLoadingProducts(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  // Payment options contain only public labels and capability metadata, never gateway credentials.
  useEffect(() => {
    fetch('/api/pos/payment-options', { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(errorMessage(result, 'Não foi possível carregar as formas de pagamento.'));
        setPaymentOptions(result.options as PaymentOption[]);
        setCanSimulatePixApproval(result.canSimulatePixApproval === true);
        setCashRegisterOpen(result.cashRegister?.isOpen === true);
        if (result.options.length) {
          const preferred = result.options.find((option: PaymentOption) => option.provider === 'cash') ?? result.options[0] as PaymentOption;
          setSelectedOption(preferred.provider + preferred.method + preferred.terminalId);
        }
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Não foi possível carregar pagamentos.'));
  }, []);

  // Polls the provider so Pix is never treated as paid based only on QR generation.
  useEffect(() => {
    if (!awaitingPayment || !saleId || !attemptId || !['mercadopago', 'pagarme', 'split'].includes(selectedPayment?.provider ?? '')) return;
    let active = true;
    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/sales/${saleId}/payments/${attemptId}/status`, { cache: 'no-store' });
        const result = await response.json();
        if (!active || !response.ok) return;
        if (result.status === 'approved' && result.saleCompleted) {
          setPaymentStatus('approved');
          setMessage('Pix confirmado pelo provedor. Venda concluída.');
        } else if (result.status === 'approved') {
          setPaymentStatus('partially_paid');
          setMessage(`Pix recebido; saldo ainda em aberto: ${money(Number(result.remainingAmount))}.`);
        } else if (['cancelled', 'declined', 'failed'].includes(result.status)) {
          setPaymentStatus(result.status);
          setMessage('O Pix não foi aprovado. Confira o pagamento ou tente novamente.');
        }
      } catch {
        // A short network issue must not change the displayed payment state.
      }
    };
    void checkStatus();
    const timer = window.setInterval(() => void checkStatus(), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [awaitingPayment, saleId, attemptId, selectedPayment?.provider]);

  const addProduct = useCallback((product: Product) => {
    setCart((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      if (existing) return current.map((line) => line.product.id === product.id ? { ...line, quantity: line.quantity + (product.sellByFraction ? 1 : 1) } : line);
      return [...current, { product, quantity: 1 }];
    });
    setMessage('');
    searchRef.current?.focus();
  }, []);

  function setQuantity(productId: string, quantity: number) {
    if (quantity <= 0) {
      setCart((current) => current.filter((line) => line.product.id !== productId));
      return;
    }
    setCart((current) => current.map((line) => line.product.id === productId ? { ...line, quantity } : line));
  }

  // Scanner input normally sends Enter after the barcode, so an exact match is added immediately.
  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const exact = products.find((product) => product.barcode?.toLowerCase() === query.trim().toLowerCase() || product.sku?.toLowerCase() === query.trim().toLowerCase());
    if (exact) {
      addProduct(exact);
      setQuery('');
    } else if (products.length === 1) {
      addProduct(products[0]);
      setQuery('');
    }
  }

  async function saveLogo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch('/api/settings/brand', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ logoUrl: logoDraft }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(errorMessage(result, 'Não foi possível salvar a logo.'));
      setLogoUrl(result.logoUrl ?? '');
      setLogoEditorOpen(false);
      setMessage('Logo da loja atualizada.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível salvar a logo.');
    } finally {
      setBusy(false);
    }
  }

  async function requestGatewayPayment(currentSaleId: string, option: PaymentOption) {
    const response = await fetch(`/api/sales/${currentSaleId}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: crypto.randomUUID(),
        provider: option.provider,
        method: option.method,
        channel: option.channel,
        terminalId: option.terminalId,
        ...(needsCustomerEmail ? { customerEmail } : {}),
        ...(needsPagarmeCustomer ? {
          customerName,
          customerEmail,
          customerDocument,
          customerPhone,
          customerAddress: { zipCode: customerZipCode, street: customerStreet, number: customerNumber, neighborhood: customerNeighborhood, city: customerCity, state: customerState },
        } : {}),
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      if (result.attempt) {
        setAttemptId(result.attempt.id as string);
        setPaymentStatus(result.attempt.status as string);
      }
      throw new Error(errorMessage(result, 'Não foi possível iniciar o pagamento.'));
    }
    setAttemptId(result.attempt.id as string);
    setPaymentAmount(String(result.attempt.amount));
    setPayment(result.payment ?? null);
    setPaymentStatus(result.attempt.status as string);
    if (result.attempt.status === 'approved' && result.saleCompleted) setMessage('Pagamento confirmado. Venda concluída.');
    return result;
  }

  async function startCheckout() {
    if (!cart.length || !selectedPayment || busy || (needsCustomerEmail && (!customerEmailValid || !sandboxEmailValid)) || (needsPagarmeCustomer && !pagarmeCustomerValid)) return;
    setBusy(true);
    setMessage('');
    try {
      let currentSaleId = saleId;
      if (!currentSaleId) {
        const saleResponse = await fetch('/api/sales', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idempotencyKey: crypto.randomUUID(),
            discountAmount: Number(discountValue.toFixed(2)),
            items: cart.map(({ product, quantity }) => ({ productId: product.id, quantity })),
          }),
        });
        const saleResult = await saleResponse.json();
        if (!saleResponse.ok) throw new Error(errorMessage(saleResult, 'Não foi possível reservar os itens da venda.'));
        currentSaleId = saleResult.sale.id as string;
        setSaleId(currentSaleId);
        setSaleTotal(Number(saleResult.sale.totalAmount));
        setProducts((current) => current.map((product) => {
          const reserved = cart.find((line) => line.product.id === product.id);
          return reserved
            ? { ...product, stockQuantity: (Number(product.stockQuantity) - reserved.quantity).toFixed(3) }
            : product;
        }));
      }

      // Cash-only sales do not need a gateway order.
      if (selectedPayment.provider === 'cash') {
        setPaymentStatus('cash_due');
        setCashReceived('');
        setCashAttemptKey(crypto.randomUUID());
        setMessage('Informe quanto o cliente entregou para calcular o troco.');
        return;
      }

      if (selectedPayment.provider === 'split') {
        if (cashApplied === null) {
          setPaymentStatus('split_cash_due');
          setSplitCashAmount((Math.floor(Math.round((saleTotal ?? total) * 100) / 2) / 100).toFixed(2));
          setCashReceived('');
          setCashAttemptKey(crypto.randomUUID());
          setMessage('Informe a parcela em dinheiro; o saldo será cobrado por Pix.');
          return;
        }
        await requestGatewayPayment(currentSaleId, {
          provider: selectedPayment.pixProvider ?? 'mercadopago', label: selectedPayment.label, method: 'pix', channel: 'online', environment: selectedPayment.environment,
        });
        return;
      }

      await requestGatewayPayment(currentSaleId, selectedPayment);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível iniciar o pagamento.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmManualPayment() {
    if (!saleId || !attemptId || busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/sales/${saleId}/payments/${attemptId}/confirm`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(errorMessage(result, 'Não foi possível confirmar o pagamento.'));
      setPaymentStatus('approved');
      setMessage('Pagamento confirmado e venda concluída.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível confirmar o pagamento.');
    } finally {
      setBusy(false);
    }
  }

  /** Uses the development-only Sandbox endpoint to exercise automatic sale completion. */
  async function simulatePixApproval() {
    if (!saleId || !attemptId || busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/sales/${saleId}/payments/${attemptId}/simulate-approval`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(errorMessage(result, 'Não foi possível simular a aprovação do Pix.'));

      if (result.saleCompleted) {
        setPaymentStatus('approved');
        setMessage('Aprovação Sandbox simulada. Venda concluída; o estoque já estava reservado.');
      } else {
        setPaymentStatus('partially_paid');
        setMessage('Pix aprovado na simulação, mas ainda existe saldo pendente na venda.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível simular a aprovação do Pix.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmCashPayment() {
    if (!saleId || !cashDue || cashChangeCents === null || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/sales/${saleId}/cash-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotencyKey: cashAttemptKey, amountApplied: amountDue, amountReceived: cashReceivedCents / 100 }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(errorMessage(result, 'Não foi possível concluir a venda em dinheiro.'));
      setPaymentStatus('approved');
      setCashChange(Math.round(Number(result.changeAmount) * 100));
      setMessage('Venda em dinheiro concluída.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível concluir a venda em dinheiro.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmSplitCash() {
    if (!saleId || !cashDue || !cashAttemptKey || cashChangeCents === null || splitPixBalanceCents <= 0 || busy ||
      (needsCustomerEmail && (!customerEmailValid || !sandboxEmailValid))) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/sales/${saleId}/cash-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: cashAttemptKey,
          amountApplied: splitCashCents / 100,
          amountReceived: cashReceivedCents / 100,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(errorMessage(result, 'Não foi possível registrar a parcela em dinheiro.'));

      setCashApplied(splitCashCents);
      setCashChange(Math.round(Number(result.changeAmount) * 100));
      setPaymentStatus('split_pix_due');
      setMessage(`Dinheiro registrado. Agora cobre ${money(Number(result.remainingAmount))} por Pix.`);
      await requestGatewayPayment(saleId, {
        provider: selectedPayment?.pixProvider ?? 'mercadopago', label: selectedPayment?.label ?? 'Pix', method: 'pix', channel: 'online', environment: selectedPayment?.environment,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível iniciar o pagamento misto.');
    } finally {
      setBusy(false);
    }
  }

  async function cancelSale(cashRefunded = false) {
    if (!saleId || busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/sales/${saleId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cashRefunded }),
      });
      const result = await response.json();
      if (!response.ok && result.cashRefundRequired) {
        setCashRefundConfirmation(String(result.cashToReturn));
        return;
      }
      if (!response.ok) throw new Error(errorMessage(result, 'Não foi possível cancelar a venda.'));
      setProducts((current) => current.map((product) => {
        const reserved = cart.find((line) => line.product.id === product.id);
        return reserved
          ? { ...product, stockQuantity: (Number(product.stockQuantity) + reserved.quantity).toFixed(3) }
          : product;
      }));
      resetSale();
      setMessage('Venda cancelada e estoque liberado.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível cancelar a venda.');
    } finally {
      setBusy(false);
    }
  }

  function resetSale() {
    setCart([]);
    setDiscount('0');
    setSaleId('');
    setAttemptId('');
    setPayment(null);
    setPaymentAmount('');
    setPaymentStatus('');
    setSaleTotal(null);
    setCashReceived('');
    setCashChange(null);
    setCashApplied(null);
    setCashAttemptKey('');
    setCashRefundConfirmation('');
    setSplitCashAmount('');
    setCustomerEmail('');
    setMessage('');
    searchRef.current?.focus();
  }

  const completed = paymentStatus === 'approved';
  return (
    <main className="min-h-screen bg-[#f4f6f8] text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex min-h-24 max-w-[1600px] flex-wrap items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-600 text-white shadow-sm"><ShoppingBag size={23} /></div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-700">Montante · Ponto de venda</p>
              <h1 className="truncate text-xl font-semibold tracking-tight">{storeName}</h1>
              <p className="text-sm text-slate-500">Operador: {operatorName}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <StoreNavigation activePage="pdv" canManageStore={canManageBrand} />
            <div className="hidden rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 sm:block"><span className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-500" />Sessão ativa</div>
            <div className="relative flex h-[60px] w-[136px] items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 px-3 sm:h-[76px] sm:w-[190px]">
              {logoUrl ? <img src={logoUrl} alt={`Logo de ${storeName}`} className="max-h-full max-w-full object-contain" /> : <div className="text-center"><ImagePlus className="mx-auto mb-1 text-slate-400" size={22} /><span className="text-xs text-slate-500">Logo da loja</span></div>}
              {canManageBrand && <button type="button" onClick={() => { setLogoDraft(logoUrl); setLogoEditorOpen(true); }} className="absolute inset-0 rounded-xl bg-slate-950/0 text-xs font-medium text-white opacity-0 transition hover:bg-slate-950/55 hover:opacity-100 focus:opacity-100" aria-label="Alterar logo da loja">Alterar logo</button>}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1600px] gap-5 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_430px] lg:px-8">
        <section className="min-w-0">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div><h2 className="text-2xl font-semibold tracking-tight">Nova venda</h2><p className="mt-1 text-sm text-slate-500">Pesquise ou leia o código de barras para adicionar produtos.</p></div>
            <Button type="button" variant="outline" className="hidden sm:inline-flex" onClick={() => searchRef.current?.focus()}><Barcode className="mr-2" size={17} />Leitor de código</Button>
          </div>
          {!cashRegisterOpen && <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><span>Abra seu caixa para iniciar vendas e registrar recebimentos.</span><a href="/caixa" className="font-semibold underline">Abrir caixa</a></div>}

          <form onSubmit={handleSearchSubmit} className="mb-4 flex gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="relative flex-1"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={19} /><Input ref={searchRef} autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar produto ou escanear código de barras" className="h-12 border-0 bg-slate-50 pl-11 text-base shadow-none focus-visible:ring-orange-500" aria-label="Buscar produto ou código de barras" /></div>
            <Button type="submit" className="h-12 rounded-xl bg-orange-600 px-5 hover:bg-orange-700"><Search size={18} /><span className="ml-2 hidden sm:inline">Buscar</span></Button>
          </form>

          <div className="mb-3 flex items-center justify-between px-1"><h3 className="font-semibold">Produtos</h3><span className="text-sm text-slate-500">{loadingProducts ? 'Buscando…' : `${products.length} encontrados`}</span></div>
          {products.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {products.map((product) => {
              const stock = Number(product.stockQuantity);
              return <button key={product.id} type="button" onClick={() => addProduct(product)} disabled={stock <= 0 || Boolean(saleId)} className="group rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50">
                <div className="mb-5 flex items-start justify-between gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 text-orange-700"><PackageSearch size={21} /></div><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${stock > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{stock > 0 ? `${product.stockQuantity} ${product.unitOfMeasure} em estoque` : 'Sem estoque'}</span></div>
                <h4 className="line-clamp-2 min-h-12 font-semibold leading-6">{product.name}</h4>
                <p className="mt-1 truncate text-xs text-slate-500">{product.sku ? `SKU ${product.sku}` : 'Sem SKU'}{product.stockAisle ? ` · Corredor ${product.stockAisle}` : ''}{product.stockShelf ? ` · Prateleira ${product.stockShelf}` : ''}</p>
                <div className="mt-4 flex items-end justify-between"><p className="text-lg font-semibold tabular-nums">{money(Number(product.price))}<span className="ml-1 text-xs font-normal text-slate-500">/ {product.unitOfMeasure}</span></p><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700 transition group-hover:bg-orange-600 group-hover:text-white"><Plus size={18} /></span></div>
              </button>;
            })}
          </div> : <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white text-center"><div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500"><PackageSearch size={23} /></div><p className="font-medium">{loadingProducts ? 'Carregando catálogo…' : 'Nenhum produto encontrado'}</p><p className="mt-1 text-sm text-slate-500">Tente buscar por outro nome, SKU ou código de barras.</p></div>}
        </section>

        <aside className="h-fit rounded-2xl border border-slate-200 bg-white shadow-sm lg:sticky lg:top-5">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="text-lg font-semibold">Carrinho</h2><p className="text-sm text-slate-500">{cart.length} {cart.length === 1 ? 'item' : 'itens'}</p></div><button type="button" onClick={resetSale} disabled={!cart.length || busy || Boolean(saleId)} className="text-sm font-medium text-slate-500 hover:text-red-600 disabled:opacity-40">Limpar</button></div>
          <div className="max-h-[min(46vh,480px)] min-h-40 overflow-y-auto px-5">
            {!cart.length ? <div className="flex h-40 flex-col items-center justify-center text-center"><ShoppingBag className="mb-2 text-slate-300" size={28} /><p className="text-sm text-slate-500">Adicione produtos para iniciar a venda.</p></div> : <ul className="divide-y divide-slate-100">{cart.map(({ product, quantity }) => <li key={product.id} className="py-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-medium leading-5">{product.name}</p><p className="mt-1 text-xs text-slate-500">{money(Number(product.price))} / {product.unitOfMeasure}</p></div><button type="button" onClick={() => setQuantity(product.id, 0)} disabled={Boolean(saleId)} aria-label={`Remover ${product.name}`} className="p-1 text-slate-400 hover:text-red-600 disabled:opacity-30"><Trash2 size={16} /></button></div><div className="mt-3 flex items-center justify-between"><div className="flex items-center rounded-lg border border-slate-200"><button type="button" onClick={() => setQuantity(product.id, quantity - (product.sellByFraction ? 0.5 : 1))} disabled={Boolean(saleId)} aria-label="Diminuir quantidade" className="p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-30"><Minus size={15} /></button><input aria-label={`Quantidade de ${product.name}`} type="number" min={product.sellByFraction ? '0.001' : '1'} step={product.sellByFraction ? '0.001' : '1'} value={quantity} disabled={Boolean(saleId)} onChange={(event) => setQuantity(product.id, Number(event.target.value))} className="w-16 border-x border-slate-200 py-1 text-center text-sm tabular-nums outline-none disabled:bg-slate-50" /><button type="button" onClick={() => setQuantity(product.id, quantity + (product.sellByFraction ? 0.5 : 1))} disabled={Boolean(saleId)} aria-label="Aumentar quantidade" className="p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-30"><Plus size={15} /></button></div><span className="font-semibold tabular-nums">{money(Number(product.price) * quantity)}</span></div><p className="mt-1 text-right text-[11px] text-slate-400">{product.sellByFraction ? 'Venda fracionada' : 'Unidade inteira'}</p></li>)}</ul>}
          </div>

          <div className="space-y-3 border-t border-slate-100 px-5 py-4">
            <div className="flex items-center justify-between text-sm"><span className="text-slate-600">Subtotal</span><span className="tabular-nums">{money(subtotal)}</span></div>
            <label className="flex items-center justify-between gap-4 text-sm"><span className="text-slate-600">Desconto (R$)</span><Input type="number" min="0" max={subtotal} step="0.01" value={discount} disabled={Boolean(saleId)} onChange={(event) => setDiscount(event.target.value)} className="h-9 w-32 text-right tabular-nums" /></label>
            <div className="flex items-end justify-between border-t border-slate-100 pt-3"><span className="font-semibold">Total</span><span className="text-2xl font-semibold tracking-tight tabular-nums">{money(total)}</span></div>
          </div>

          {!awaitingPayment && !cashDue && !completed && <div className="px-5 pb-5">
            <label className="mb-2 block text-sm font-medium" htmlFor="payment-method">Forma de pagamento</label>
            {paymentOptions.length ? <div className="relative"><select id="payment-method" value={selectedOption} onChange={(event) => setSelectedOption(event.target.value)} disabled={!paymentEditable} className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 pr-9 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 disabled:bg-slate-50">{paymentOptions.map((option) => { const value = option.provider + option.method + option.terminalId; const methodLabel = option.provider === 'split' ? 'Dividido' : option.method === 'pix' ? 'Pix' : option.method === 'cash' ? 'Dinheiro' : option.method === 'credit_card' ? 'Crédito' : 'Débito'; return <option key={value} value={value}>{option.label} · {methodLabel}</option>; })}</select><ChevronDown className="pointer-events-none absolute right-3 top-3 text-slate-400" size={18} /></div> : <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Nenhuma forma de pagamento está ativa. Peça ao responsável para configurar uma opção.</p>}
            {needsCustomerEmail && <label className="mt-3 block text-sm font-medium" htmlFor="customer-email">E-mail do comprador<Input id="customer-email" type="email" autoComplete="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} placeholder={selectedPayment.environment === 'sandbox' ? 'comprador@testuser.com' : 'comprador@exemplo.com'} disabled={!paymentEditable} className="mt-2 h-10" required />{selectedPayment.environment === 'sandbox' && <span className="mt-1 block text-xs font-normal text-slate-500">No Sandbox, use um e-mail de teste com final @testuser.com.</span>}</label>}
            {needsPagarmeCustomer && <fieldset className="mt-3 space-y-3 rounded-xl border border-slate-200 p-3"><legend className="px-1 text-sm font-medium">Dados para cobrança Pix Pagar.me</legend><p className="text-xs text-slate-500">A API pede identificação e endereço do comprador. Esses dados são enviados ao provedor apenas para criar a cobrança.</p><div className="grid grid-cols-2 gap-2"><Input autoComplete="name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Nome completo" aria-label="Nome completo do comprador" className="col-span-2 h-10" /><Input type="email" autoComplete="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} placeholder="E-mail" aria-label="E-mail do comprador" className="h-10" /><Input value={customerDocument} onChange={(event) => setCustomerDocument(event.target.value)} placeholder="CPF/CNPJ" aria-label="CPF ou CNPJ do comprador" className="h-10" /><Input type="tel" autoComplete="tel" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="Celular com DDD" aria-label="Celular do comprador" className="h-10" /><Input autoComplete="postal-code" value={customerZipCode} onChange={(event) => setCustomerZipCode(event.target.value)} placeholder="CEP" aria-label="CEP do comprador" className="h-10" /><Input autoComplete="address-level2" value={customerCity} onChange={(event) => setCustomerCity(event.target.value)} placeholder="Cidade" aria-label="Cidade do comprador" className="h-10" /><Input autoComplete="address-line1" value={customerStreet} onChange={(event) => setCustomerStreet(event.target.value)} placeholder="Rua" aria-label="Rua do comprador" className="h-10" /><Input value={customerNumber} onChange={(event) => setCustomerNumber(event.target.value)} placeholder="Número" aria-label="Número do endereço" className="h-10" /><Input value={customerNeighborhood} onChange={(event) => setCustomerNeighborhood(event.target.value)} placeholder="Bairro" aria-label="Bairro do comprador" className="h-10" /><Input value={customerState} onChange={(event) => setCustomerState(event.target.value.toUpperCase().slice(0, 2))} placeholder="UF" aria-label="Estado do comprador" maxLength={2} className="h-10" /></div></fieldset>}
            <Button type="button" onClick={startCheckout} disabled={!cart.length || !selectedPayment || busy || total <= 0 || (needsCustomerEmail && (!customerEmailValid || !sandboxEmailValid)) || (needsPagarmeCustomer && !pagarmeCustomerValid)} className="mt-4 h-12 w-full rounded-xl bg-orange-600 text-base font-semibold hover:bg-orange-700">{busy ? <LoaderCircle className="mr-2 animate-spin" size={18} /> : <CreditCard className="mr-2" size={18} />}{saleId ? 'Tentar pagamento' : `Cobrar ${money(total)}`}</Button>
            {saleId && !awaitingPayment && <button type="button" onClick={() => void cancelSale()} disabled={busy} className="mt-2 w-full py-1 text-sm font-medium text-slate-500 hover:text-red-600">Cancelar venda e liberar estoque</button>}
            <p className="mt-2 text-center text-xs text-slate-500">O estoque é reservado ao iniciar a cobrança.</p>
          </div>}

          {cashDue && <div className="space-y-4 px-5 pb-5">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
              <p className="font-semibold text-emerald-900">{selectedPayment?.provider === 'split' ? 'Pagamento dividido: dinheiro + Pix' : 'Pagamento em dinheiro'}</p>
              <p className="mt-1 text-sm text-emerald-800">Total da compra: {money(amountDue)}</p>
              {selectedPayment?.provider === 'split' && <>
                <label htmlFor="split-cash-amount" className="mt-4 block text-sm font-medium text-slate-800">Parcela que será paga em dinheiro</label>
                <Input id="split-cash-amount" type="number" inputMode="decimal" min="0.01" max={(Math.max(0, amountDue - 0.01)).toFixed(2)} step="0.01" value={splitCashAmount} onChange={(event) => setSplitCashAmount(event.target.value)} className="mt-2 h-11 bg-white text-right tabular-nums" />
                <p className="mt-2 text-sm text-emerald-900">Restante no Pix: <strong>{money(Math.max(0, splitPixBalanceCents) / 100)}</strong></p>
              </>}
              <label htmlFor="cash-received" className="mt-4 block text-sm font-medium text-slate-800">Quanto o cliente entregou em dinheiro?</label>
              <Input id="cash-received" type="number" inputMode="decimal" min={(activeCashContribution / 100).toFixed(2)} step="0.01" autoFocus value={cashReceived} onChange={(event) => setCashReceived(event.target.value)} placeholder="0,00" className="mt-2 h-12 bg-white text-right text-xl tabular-nums" />
              {selectedPayment?.provider === 'split' && needsCustomerEmail && <label className="mt-4 block text-sm font-medium text-slate-800" htmlFor="split-customer-email">E-mail do comprador para o Pix<Input id="split-customer-email" type="email" autoComplete="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} placeholder={selectedPayment.environment === 'sandbox' ? 'comprador@testuser.com' : 'comprador@exemplo.com'} className="mt-2 h-10 bg-white" required />{selectedPayment.environment === 'sandbox' && <span className="mt-1 block text-xs font-normal text-slate-500">No Sandbox, use um e-mail de teste terminado em @testuser.com.</span>}</label>}
              <div className="mt-3 flex items-center justify-between border-t border-emerald-200 pt-3 text-sm">
                <span className="text-emerald-900">{cashChangeCents === null ? 'Valor insuficiente' : 'Troco em dinheiro'}</span>
                <strong className="text-lg tabular-nums text-emerald-950">{money((cashChangeCents ?? 0) / 100)}</strong>
              </div>
            </div>
            <Button type="button" onClick={selectedPayment?.provider === 'split' ? confirmSplitCash : confirmCashPayment} disabled={busy || cashChangeCents === null || (selectedPayment?.provider === 'split' && (splitPixBalanceCents <= 0 || !customerEmailValid || !sandboxEmailValid))} className="h-12 w-full rounded-xl bg-emerald-600 text-base font-semibold hover:bg-emerald-700 disabled:opacity-50">
              {busy ? <LoaderCircle className="mr-2 animate-spin" size={18} /> : <Check className="mr-2" size={18} />}
              {selectedPayment?.provider === 'split' ? `Receber dinheiro e gerar Pix de ${money(Math.max(0, splitPixBalanceCents) / 100)}` : 'Concluir venda em dinheiro'}
            </Button>
            <button type="button" onClick={() => void cancelSale()} disabled={busy} className="w-full py-1 text-sm font-medium text-slate-500 hover:text-red-600">Cancelar venda e liberar estoque</button>
          </div>}

          {awaitingPayment && <div className="space-y-3 px-5 pb-5">
            <div className="rounded-xl border border-orange-100 bg-orange-50 p-4 text-center"><p className="font-semibold text-orange-900">Aguardando pagamento</p><p className="mt-1 text-sm text-orange-800">{selectedPayment?.provider === 'split' ? 'Pix + dinheiro' : `${selectedPayment?.label} · ${selectedPayment?.method === 'pix' ? 'Pix' : 'Cartão'}`}</p>
              {selectedPayment?.provider === 'split' && cashApplied !== null && <div className="my-3 rounded-lg bg-white p-3 text-left text-sm"><div className="flex justify-between"><span>Parcela paga em dinheiro</span><strong>{money(cashApplied / 100)}</strong></div><div className="mt-1 flex justify-between"><span>Troco em dinheiro</span><strong>{money((cashChange ?? 0) / 100)}</strong></div><div className="mt-1 flex justify-between"><span>Restante no Pix</span><strong>{money(Number(paymentAmount))}</strong></div></div>}
              {(payment?.pixQrCode || payment?.pixQrCodeUrl) && <img src={payment.pixQrCode ? `data:image/png;base64,${payment.pixQrCode}` : payment.pixQrCodeUrl} alt="QR Code Pix para pagamento" className="mx-auto my-4 h-48 w-48 rounded-lg bg-white p-2" />}
              {payment?.pixCopyPaste && <div className="mt-3 text-left"><label htmlFor="pix-copy" className="text-xs font-medium text-orange-900">Chave ou código Pix</label><textarea id="pix-copy" readOnly value={payment.pixCopyPaste} className="mt-1 min-h-16 w-full resize-none rounded-lg border border-orange-200 bg-white p-2 text-xs text-slate-700" /></div>}
              {payment?.paymentUrl && <a href={payment.paymentUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-semibold text-orange-800 underline">Abrir pagamento</a>}
              {!payment && <p className="mt-2 text-sm text-orange-800">Confirme o recebimento no provedor ou na maquininha.</p>}
            </div>
            {canSimulatePixApproval && selectedPayment?.environment === 'sandbox' && ['mercadopago', 'split'].includes(selectedPayment.provider) && selectedPayment.pixProvider !== 'pagarme' && <Button type="button" onClick={() => void simulatePixApproval()} disabled={busy} variant="outline" className="h-11 w-full border-amber-300 text-amber-900 hover:bg-amber-50">{busy && <LoaderCircle className="mr-2 animate-spin" size={16} />}Simular aprovação Pix (Sandbox)</Button>}
            <Button type="button" onClick={confirmManualPayment} disabled={busy || !['pix_manual', 'external_terminal'].includes(selectedPayment?.provider ?? '')} className="h-11 w-full rounded-xl bg-emerald-600 hover:bg-emerald-700"><Check className="mr-2" size={18} />Confirmar recebimento</Button>
            <button type="button" onClick={() => void cancelSale()} disabled={busy} className="w-full py-1 text-sm font-medium text-slate-500 hover:text-red-600">Cancelar venda e liberar estoque</button>
          </div>}

          {completed && <div className="px-5 pb-5"><div className="rounded-xl bg-emerald-50 p-4 text-center"><div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Check size={22} /></div><p className="font-semibold text-emerald-900">Venda concluída</p><p className="mt-1 text-sm text-emerald-800">Total da venda: {money(amountDue)}</p>{selectedPayment?.provider === 'cash' && <><p className="mt-1 text-sm text-emerald-800">Valor recebido: {money(cashReceivedCents / 100)}</p><p className="mt-1 text-sm font-semibold text-emerald-900">Troco: {money((cashChange ?? 0) / 100)}</p></>}{selectedPayment?.provider === 'split' && <><p className="mt-1 text-sm text-emerald-800">Dinheiro: {money((cashApplied ?? 0) / 100)} · Pix: {money(Number(paymentAmount))}</p><p className="mt-1 text-sm font-semibold text-emerald-900">Troco em dinheiro: {money((cashChange ?? 0) / 100)}</p></>}</div><Button type="button" onClick={resetSale} className="mt-3 h-12 w-full rounded-xl bg-orange-600 hover:bg-orange-700"><Plus className="mr-2" size={18} />Iniciar próxima venda</Button></div>}
        </aside>
      </div>

      {message && <div role="status" className="fixed bottom-5 left-1/2 z-40 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-xl"><CircleAlert size={17} />{message}<button type="button" aria-label="Fechar aviso" onClick={() => setMessage('')} className="ml-2 text-slate-300 hover:text-white"><X size={16} /></button></div>}

      {cashRefundConfirmation && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><section role="dialog" aria-modal="true" aria-labelledby="cash-refund-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><h2 id="cash-refund-title" className="text-lg font-semibold">Devolver o dinheiro antes de cancelar?</h2><p className="mt-3 text-sm leading-6 text-slate-600">Esta venda recebeu <strong>{money(Number(cashRefundConfirmation))}</strong> em dinheiro e o QR Pix já foi cancelado. Devolva esse valor ao cliente; o estoque só será liberado depois da confirmação.</p><div className="mt-6 grid gap-2"><Button type="button" onClick={() => void cancelSale(true)} disabled={busy} className="h-11 bg-red-600 hover:bg-red-700">{busy && <LoaderCircle className="mr-2 animate-spin" size={16} />}Já devolvi o dinheiro. Cancelar venda</Button><Button type="button" variant="outline" onClick={() => { setCashRefundConfirmation(''); setPaymentStatus('split_pix_due'); setAttemptId(''); setPayment(null); setPaymentAmount(''); }}>Manter venda aberta</Button></div></section></div>}

      {logoEditorOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setLogoEditorOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby="logo-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><div className="mb-5 flex items-start justify-between"><div><h2 id="logo-title" className="text-lg font-semibold">Logo da loja</h2><p className="mt-1 text-sm text-slate-500">Use uma imagem pública quadrada ou horizontal.</p></div><button type="button" aria-label="Fechar" onClick={() => setLogoEditorOpen(false)} className="text-slate-400 hover:text-slate-700"><X size={19} /></button></div><form onSubmit={saveLogo}><label htmlFor="logo-url" className="mb-2 block text-sm font-medium">Endereço da imagem</label><Input id="logo-url" type="url" value={logoDraft} onChange={(event) => setLogoDraft(event.target.value)} placeholder="https://minhaloja.com.br/logo.png" className="h-11" /><p className="mt-2 text-xs text-slate-500">A imagem precisa estar hospedada em um endereço acessível pela internet.</p>{logoDraft && <div className="mt-4 flex h-28 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-3"><img src={logoDraft} alt="Prévia da logo" className="max-h-full max-w-full object-contain" /></div>}<div className="mt-6 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => { setLogoDraft(''); setLogoUrl(''); setLogoEditorOpen(false); void fetch('/api/settings/brand', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ logoUrl: '' }) }); }}>Remover logo</Button><Button type="submit" disabled={busy} className="bg-orange-600 hover:bg-orange-700">{busy && <LoaderCircle className="mr-2 animate-spin" size={16} />}Salvar</Button></div></form></section></div>}
    </main>
  );
}
