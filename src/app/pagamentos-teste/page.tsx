'use client';

import { FormEvent, useState } from 'react';

type PaymentResult = {
  externalId: string;
  status: 'pending' | 'approved' | 'declined' | 'cancelled' | 'error';
  pixQrCode?: string;
  pixCopyPaste?: string;
  paymentUrl?: string;
};

export default function PaymentsTestPage() {
  const [result, setResult] = useState<PaymentResult | null>(null);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const statusLabel = status === 'approved'
    ? 'Aprovado'
    : status === 'declined'
      ? 'Recusado'
      : status === 'cancelled'
        ? 'Cancelado ou expirado'
        : status === 'error'
          ? 'Erro na cobrança'
          : 'Pendente';

  async function createPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(''); setResult(null); setStatus('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/payments/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Math.round(Number(form.get('amount')) * 100),
          description: form.get('description'), customerName: form.get('customerName'), customerEmail: form.get('customerEmail'),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Falha ao criar pagamento.');
      setResult(data); setStatus(data.status);
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha inesperada.'); }
    finally { setBusy(false); }
  }

  async function refreshStatus() {
    if (!result) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/payments/test/${result.externalId}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Falha ao consultar pagamento.');
      setStatus(data.status);
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha inesperada.'); }
    finally { setBusy(false); }
  }

  // Only cancels the disposable Sandbox Order shown on this page.
  async function cancelPayment() {
    if (!result || busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/payments/test/${result.externalId}/cancel`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Falha ao cancelar pagamento.');
      setStatus(data.status);
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha inesperada.'); }
    finally { setBusy(false); }
  }

  return (
    <main className="mx-auto min-h-screen max-w-xl p-6 md:p-10">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">Ambiente de desenvolvimento</p>
        <h1 className="mt-2 text-3xl font-bold">Teste de pagamento Pix</h1>
        <p className="mt-2 text-sm text-muted-foreground">Mercado Pago Sandbox. Esta página valida a criação e a consulta da cobrança Pix; ela não realiza uma liquidação real.</p>
      </div>
      <aside className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" role="note">
        <strong>Sobre o status pendente:</strong> no teste de Pix do Sandbox, o Mercado Pago permite validar a criação da Order e a geração do QR Code, mas não simular a confirmação do pagamento. Portanto, é esperado que o status continue como pendente, mesmo após consultar várias vezes. Não pague esse QR Code com dinheiro real.
      </aside>
      <form onSubmit={createPayment} className="space-y-4 rounded-lg border bg-card p-6 shadow-sm">
        <label className="block text-sm font-medium">Valor (R$)<input name="amount" type="number" min="1" max="10000" step="0.01" defaultValue="1.00" required className="mt-1 h-10 w-full rounded-md border bg-background px-3" /></label>
        <label className="block text-sm font-medium">Descrição<input name="description" minLength={3} maxLength={200} defaultValue="Teste de pagamento Montante" required className="mt-1 h-10 w-full rounded-md border bg-background px-3" /></label>
        <label className="block text-sm font-medium">Nome do pagador<input name="customerName" minLength={2} maxLength={100} defaultValue="Cliente de Teste" required className="mt-1 h-10 w-full rounded-md border bg-background px-3" /></label>
        <label className="block text-sm font-medium">E-mail do pagador<input name="customerEmail" type="email" defaultValue="test_user_123456@testuser.com" required className="mt-1 h-10 w-full rounded-md border bg-background px-3" /></label>
        <button disabled={busy} className="h-10 w-full rounded-md bg-primary px-4 font-medium text-primary-foreground disabled:opacity-50">{busy ? 'Processando…' : 'Gerar cobrança de teste'}</button>
      </form>
      {error && <p role="alert" className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {result && <section className="mt-6 space-y-3 rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold">Cobrança criada</h2>
        <p className="text-sm">ID: <span className="font-mono">{result.externalId}</span></p>
        <p className="text-sm">Status: <strong>{statusLabel}</strong></p>
        {result.pixQrCode && <>
          <p className="text-xs text-muted-foreground">QR Code de teste para validar a resposta da API; não conclui um pagamento.</p>
          <img className="h-48 w-48 border p-2" alt="QR Code Pix de teste" src={`data:image/png;base64,${result.pixQrCode}`} />
        </>}
        {result.pixCopyPaste && <label className="block text-sm font-medium">Pix copia e cola<textarea readOnly value={result.pixCopyPaste} className="mt-1 min-h-24 w-full rounded-md border bg-background p-3 font-mono text-xs" /></label>}
        {result.paymentUrl && <a className="text-sm text-primary underline" href={result.paymentUrl} target="_blank" rel="noreferrer">Abrir instruções do pagamento</a>}
        <button onClick={refreshStatus} disabled={busy} className="block h-10 rounded-md border px-4 text-sm font-medium disabled:opacity-50">{busy ? 'Consultando…' : 'Consultar cobrança'}</button>
        {status === 'pending' && <button onClick={cancelPayment} disabled={busy} className="block h-10 rounded-md border border-red-300 px-4 text-sm font-medium text-red-700 disabled:opacity-50">{busy ? 'Processando…' : 'Cancelar cobrança Sandbox'}</button>}
      </section>}
    </main>
  );
}
