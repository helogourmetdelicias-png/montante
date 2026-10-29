'use client';

import { type FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { LoaderCircle, LockKeyhole, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MoneyInput } from '@/components/ui/money-input';

type ClosingSession = {
  id: string;
  expectedAmount: string;
  pendingIssues: { id: string; number: number }[];
};
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export default function CashClosingModal({ required }: { required: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const [session, setSession] = useState<ClosingSession | null>(null);
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function open() {
    dialog.current?.showModal();
    setLoading(true);
    setError('');
    setSession(null);
    setAmount('');
    try {
      const response = await fetch('/api/cash-register/session', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Não foi possível consultar o caixa.');
      setSession(data.session);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível consultar o caixa.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (required) void open();
    else dialog.current?.close();
  }, [required]);

  async function closeRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || submitting.current || !amount) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/cash-register/session', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id, declaredAmount: Number(amount) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Não foi possível fechar o caixa.');
      window.location.assign('/caixa');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível fechar o caixa.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return <>
    {required && <Button type="button" onClick={() => void open()} className="bg-orange-600 hover:bg-orange-700">Fechar caixa anterior</Button>}
    <dialog ref={dialog} aria-labelledby="cash-closing-title" aria-describedby="cash-closing-description" onCancel={event => { if (submitting.current) event.preventDefault(); }} className="m-auto max-h-[90dvh] w-[min(95vw,560px)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl backdrop:bg-slate-950/70">
      <header className="flex items-center justify-between gap-3"><h2 id="cash-closing-title" className="flex items-center gap-2 text-2xl font-semibold"><LockKeyhole className="text-orange-600" />Fechar caixa</h2><button type="button" disabled={busy} aria-label="Fechar aviso de caixa" onClick={() => dialog.current?.close()} className="rounded-lg p-2 hover:bg-slate-100"><X size={20} /></button></header>
      <p id="cash-closing-description" className="mt-3 text-sm text-slate-600">O caixa do dia anterior ainda está aberto. Confira o dinheiro e feche o turno para abrir o caixa de hoje.</p>
      {loading && <p role="status" className="mt-5 flex items-center gap-2"><LoaderCircle size={18} className="animate-spin" />Consultando valor do caixa…</p>}
      {!loading && session && <form onSubmit={closeRegister} className="mt-5 space-y-5">
        <div className="rounded-xl bg-orange-50 p-5"><p className="text-sm font-medium text-orange-900">Valor esperado em dinheiro na gaveta</p><p className="mt-2 text-4xl font-semibold tabular-nums text-orange-950">{currency.format(Number(session.expectedAmount))}</p></div>
        {!!session.pendingIssues.length && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-semibold">Resolva as pendências antes de fechar o caixa.</p><ul className="mt-2 space-y-2">{session.pendingIssues.map(issue => <li key={issue.id}><Link href={`/vendas/${issue.id}`} className="font-medium underline">Resolver venda #{issue.number}</Link></li>)}</ul></div>}
        <label className="block text-sm font-medium">Valor contado em R$<MoneyInput required disabled={busy} value={amount} onValueChange={setAmount} className="mt-2 h-12 text-lg tabular-nums" /></label>
        <p className="text-sm text-slate-500">Conte todo o dinheiro físico da gaveta. O sistema compara com o valor esperado.</p>
        <Button type="submit" disabled={busy || !amount || !!session.pendingIssues.length} className="h-12 w-full bg-orange-600 text-base hover:bg-orange-700">{busy && <LoaderCircle size={18} className="mr-2 animate-spin" />}Fechar turno</Button>
      </form>}
      {!loading && !session && !error && <p role="status" className="mt-5">Este caixa já foi fechado. <Link href="/caixa" className="font-semibold underline">Abrir caixa de hoje</Link></p>}
      {error && <div role="alert" className="mt-4 text-sm text-red-700">{error}{!session && <Button type="button" variant="outline" className="mt-3 block" onClick={() => void open()}>Tentar novamente</Button>}</div>}
      <Button type="button" variant="outline" disabled={busy} className="mt-3 w-full" onClick={() => dialog.current?.close()}>Voltar para resolver depois</Button>
    </dialog>
  </>;
}
