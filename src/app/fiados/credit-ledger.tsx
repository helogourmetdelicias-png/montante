'use client';

import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import StoreNavigation from '@/components/store-navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';

type Credit = { id: string; saleId: string; saleNumber: number; customer: string; phone: string | null; amount: string; paid: string; balance: string; createdAt: string;
  payments: Array<{ id: string; amount: string; method: string; operator: string; createdAt: string }> };
const money = (amount: string) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(amount));
const date = (value: string) => new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const methods = { CASH: 'Dinheiro', PIX: 'Pix recebido', CREDIT_CARD: 'Crédito recebido', DEBIT_CARD: 'Débito recebido' };

export default function CreditLedger({ canManageStore }: { canManageStore: boolean }) {
  const [rows, setRows] = useState<Credit[]>([]);
  const [q, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState<Credit | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState('');
  const locked = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const load = useCallback(async () => {
    const response = await fetch(`/api/credits?${new URLSearchParams({ q, page: String(page) })}`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Falha ao consultar fiados.');
    setRows(data.credits); setTotal(data.total);
  }, [q, page]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load().catch(error => setMessage(error.message)); }, 250);
    return () => window.clearTimeout(timer);
  }, [load]);
  function receive(credit: Credit) {
    setSelected(credit); setAmount(''); setMethod('CASH'); setKey(crypto.randomUUID()); setMessage('');
    dialog.current?.showModal();
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected || locked.current) return;
    locked.current = true; setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/credits/${selected.id}/payments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: Number(amount), method, idempotencyKey: key }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Não foi possível registrar.');
      dialog.current?.close(); setMessage('Pagamento registrado. O saldo do fiado foi atualizado.');
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha ao registrar pagamento.'); }
    finally { locked.current = false; setBusy(false); }
  }
  return <main className="min-h-screen bg-[#f4f6f8] text-slate-900">
    <header className="border-b bg-white"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5 lg:px-8"><div><h1 className="text-2xl font-semibold">Fiados</h1><p className="mt-1 text-sm text-slate-500">Compras por cliente, saldo a receber e pagamentos parciais.</p></div><StoreNavigation activePage="credits" canManageStore={canManageStore} /></div></header>
    <div className="mx-auto max-w-7xl space-y-4 px-5 py-6 lg:px-8">
      <label className="block text-sm font-medium">Buscar cliente<Input value={q} onChange={event => { setQuery(event.target.value); setPage(1); }} className="mt-2 bg-white" placeholder="Nome do cliente" /></label>
      {message && <p role="status" className="rounded-xl border bg-white p-4 text-sm">{message}</p>}
      {!rows.length && <p className="rounded-xl border bg-white p-5">Nenhum fiado encontrado.</p>}
      {rows.map(credit => <article key={credit.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-semibold">{credit.customer}</h2><p className="mt-1 text-sm text-slate-500"><Link href={`/vendas/${credit.saleId}`} className="underline">Venda #{credit.saleNumber}</Link> · {date(credit.createdAt)}{credit.phone && ` · ${credit.phone}`}</p></div><span className={Number(credit.balance) > 0 ? 'text-orange-700' : 'text-emerald-700'}>{Number(credit.balance) > 0 ? 'Em aberto' : 'Quitado'}</span></div>
        <dl className="my-4 grid gap-3 sm:grid-cols-3">{[['Valor da compra', credit.amount], ['Já recebido', credit.paid], ['Saldo a receber', credit.balance]].map(([label, value]) => <div key={label}><dt className="text-sm text-slate-500">{label}</dt><dd className="text-lg font-semibold">{money(value)}</dd></div>)}</dl>
        {Number(credit.balance) > 0 && <Button onClick={() => receive(credit)}>Receber parte ou quitar</Button>}
        <details className="mt-4 text-sm"><summary className="cursor-pointer font-medium">Histórico de recebimentos ({credit.payments.length})</summary>{credit.payments.length ? <ul className="mt-3 divide-y">{credit.payments.map(payment => <li key={payment.id} className="py-2">{date(payment.createdAt)} · {money(payment.amount)} · {methods[payment.method as keyof typeof methods]} · {payment.operator}</li>)}</ul> : <p className="mt-2 text-slate-500">Nenhum pagamento recebido.</p>}</details>
      </article>)}
      <div className="flex justify-between text-sm"><span>{total} fiados · Página {page}</span><div className="flex gap-4"><button disabled={page === 1} onClick={() => setPage(page - 1)} className="underline disabled:opacity-40">Anterior</button><button disabled={page * 50 >= total} onClick={() => setPage(page + 1)} className="underline disabled:opacity-40">Próxima</button></div></div>
    </div>
    <dialog ref={dialog} aria-labelledby="credit-payment-title" onCancel={event => { if (busy) event.preventDefault(); }} className="m-auto max-h-[90dvh] w-[min(95vw,480px)] overflow-y-auto rounded-2xl border bg-white p-5 text-slate-900 backdrop:bg-slate-950/50"><h2 id="credit-payment-title" className="text-xl font-semibold">Receber fiado</h2><p className="mt-2 text-sm">{selected?.customer} · Saldo: {money(selected?.balance ?? '0')}</p><form onSubmit={submit} className="mt-4 space-y-4">
      <p className="text-sm text-slate-500">Registre somente o valor já recebido, parcial ou total. Pix e cartão devem ser conferidos na conta/maquininha; esta tela não gera cobrança.</p>
      <label className="block text-sm font-medium">Valor recebido (R$)<MoneyInput required disabled={busy} value={amount} onValueChange={value => { setAmount(value); setKey(crypto.randomUUID()); }} className="mt-2" /></label>
      <label className="block text-sm font-medium">Forma de recebimento<select disabled={busy} value={method} onChange={event => { setMethod(event.target.value); setKey(crypto.randomUUID()); }} className="mt-2 h-10 w-full rounded-lg border px-3">{Object.entries(methods).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {message && <p role="alert" className="text-sm text-red-700">{message}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => dialog.current?.close()}>Cancelar</Button><Button disabled={busy || Number(amount) <= 0 || Number(amount) > Number(selected?.balance ?? 0)} type="submit">{busy ? 'Registrando…' : 'Confirmar recebimento'}</Button></div>
    </form></dialog>
  </main>;
}
