'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowDownToLine, ArrowUpFromLine, CircleAlert, LoaderCircle, LockKeyhole, Wallet } from 'lucide-react';
import StoreNavigation from '@/components/store-navigation';
import BusinessDate from '@/components/business-date';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';

type Movement = { id: string; type: 'supply' | 'withdrawal'; amount: string; description: string; createdAt: string };
type Register = {
  id: string;
  initialAmount: string;
  expectedAmount: string;
  openedAt: string;
  needsClosing: boolean;
  pendingIssues: { id: string; number: number; amount: string; pendingSale: boolean; pendingCharges: number }[];
  movements: Movement[];
  totals: { cashSales: string; cashCreditReceipts: string; supplies: string; withdrawals: string };
};
type PreviousClosing = { expectedAmount: string; declaredAmount: string; differenceAmount: string; closedAt: string | null };
type CloseSummary = { expectedAmount: string; declaredAmount: string; differenceAmount: string };

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const formatMoney = (value: string | number) => money.format(Number(value));

/** Cashiering workflow keeps open, movement and close actions visible in one screen. */
export default function CashRegisterPage({ operatorName, canManageStore }: { operatorName: string; canManageStore: boolean }) {
  const [register, setRegister] = useState<Register | null>(null);
  const [initialAmount, setInitialAmount] = useState('0.00');
  const [declaredAmount, setDeclaredAmount] = useState('');
  const [movementType, setMovementType] = useState<'supply' | 'withdrawal'>('supply');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementDescription, setMovementDescription] = useState('');
  const [closeSummary, setCloseSummary] = useState<CloseSummary | null>(null);
  const [previousClosing, setPreviousClosing] = useState<PreviousClosing | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedDay, setSelectedDay] = useState('');
  const [previousDays, setPreviousDays] = useState<{ id: string; openedAt: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);

  const loadRegister = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    try {
      const response = await fetch(`/api/cash-register/session${selectedDay ? `?sessionId=${encodeURIComponent(selectedDay)}` : ''}`, { cache: 'no-store' });
      const data = await response.json();
      if (currentRequest !== requestId.current) return;
      if (!response.ok) throw new Error(data.error ?? 'Não foi possível consultar o caixa.');
      setRegister(data.session);
      setPreviousClosing(data.lastClosing ?? null);
      setPreviousDays(data.previousDays ?? []);
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [selectedDay]);

  useEffect(() => {
    void loadRegister().catch((error: unknown) => setNotice(error instanceof Error ? error.message : 'Falha ao carregar o caixa.'));
    const refresh = () => { void loadRegister().catch(() => undefined); };
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    window.addEventListener('montante:cash-movement', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('montante:cash-movement', refresh); };
  }, [loadRegister]);

  async function sendJson(url: string, method: string, body: unknown) {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Não foi possível concluir a operação.');
    return data;
  }

  async function handleAction(action: () => Promise<void>) {
    setBusy(true);
    setNotice('');
    try {
      await action();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Falha ao concluir a operação.');
      await loadRegister().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  function openRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void handleAction(async () => {
      await sendJson('/api/cash-register/session', 'POST', { initialAmount: Number(initialAmount.replace(',', '.')) });
      setCloseSummary(null);
      await loadRegister();
    });
  }

  function recordMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void handleAction(async () => {
      await sendJson('/api/cash-register/movements', 'POST', {
        type: movementType,
        amount: Number(movementAmount.replace(',', '.')),
        description: movementDescription,
      });
      setMovementAmount('');
      setMovementDescription('');
      await loadRegister();
    });
  }

  function closeRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!register) return;
    void handleAction(async () => {
      const data = await sendJson('/api/cash-register/session', 'PATCH', {
        sessionId: register.id,
        declaredAmount: Number(declaredAmount.replace(',', '.')),
      });
      setCloseSummary(data.session);
      setRegister(null);
      setDeclaredAmount('');
      setSelectedDay('');
      window.dispatchEvent(new Event('montante:cash-movement'));
    });
  }

  const movementForm = (
    <form onSubmit={recordMovement} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold">Suprimento ou sangria</h2><select value={movementType} onChange={(event) => setMovementType(event.target.value as 'supply' | 'withdrawal')} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="supply">Suprimento · entrada de dinheiro</option><option value="withdrawal">Sangria · retirada de dinheiro</option></select><MoneyInput required value={movementAmount} onValueChange={setMovementAmount} placeholder="Valor em R$" /><Input required minLength={3} maxLength={240} value={movementDescription} onChange={(event) => setMovementDescription(event.target.value)} placeholder="Motivo da movimentação" /><Button type="submit" disabled={busy} className="w-full bg-orange-600 hover:bg-orange-700">Registrar movimentação</Button></form>
  );

  return (
    <main className="min-h-screen bg-[#f4f6f8] text-slate-900">
      <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5 lg:px-8"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-700">Montante · Operação</p><h1 className="mt-1 text-2xl font-semibold">Caixa</h1><BusinessDate /><p className="mt-1 text-sm text-slate-500">Operador: {operatorName}</p></div><StoreNavigation activePage="cash" canManageStore={canManageStore} /></div></header>
      <div className="mx-auto max-w-7xl space-y-5 px-5 py-6 lg:px-8">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold">Controle diário do caixa</h2><p className="mt-1 text-sm text-slate-500">Abrir e fechar o caixa é opcional. As operações são registradas automaticamente por dia, sem somar o dinheiro dos dias anteriores. O fundo de troco só entra quando você informar.</p><label className="mt-4 block text-sm font-medium">Dia para consultar<select value={selectedDay} onChange={event => { setLoading(true); setRegister(null); setSelectedDay(event.target.value); setDeclaredAmount(''); setNotice(''); }} className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3"><option value="">Hoje</option>{previousDays.map(day => <option key={day.id} value={day.id}>{new Date(day.openedAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · Conferência opcional</option>)}</select></label></section>
        {notice && <div role="alert" className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><CircleAlert size={18} />{notice}</div>}
        {!loading && !register && previousClosing && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold">Fechamento anterior</h2><div className="mt-3 grid gap-3 sm:grid-cols-3"><p>Esperado: <strong>{formatMoney(previousClosing.expectedAmount)}</strong></p><p>Contado: <strong>{formatMoney(previousClosing.declaredAmount)}</strong></p><p>Diferença: <strong>{formatMoney(previousClosing.differenceAmount)}</strong></p></div></section>}
        {!loading && register?.needsClosing && <div role="status" className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">Você está consultando um caixa anterior. Estes valores ficam separados do caixa de hoje. O fechamento é opcional e não impede novas vendas.</div>}
        {loading ? <p role="status" className="p-5 text-sm text-slate-500">Consultando o caixa do dia selecionado…</p> : register ? <>
          {!!register.pendingIssues?.length && <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><h2 className="font-semibold">Pendências deste caixa</h2><p className="mt-1">Estas vendas ou cobranças precisam ser resolvidas antes do fechamento. Abra a venda para confirmar um recebimento manual ou cancelá-la. Uma cobrança pode continuar pendente mesmo após o cancelamento da venda.</p><ul className="mt-3 space-y-2">{register.pendingIssues.map(issue => <li key={issue.id}><Link className="font-medium underline" href={`/vendas/${issue.id}`}>Resolver venda #{issue.number}</Link> · {formatMoney(issue.amount)} · {issue.pendingSale ? 'Venda pendente' : 'Venda encerrada'}{issue.pendingCharges > 0 && ` · ${issue.pendingCharges} cobrança(s) aguardando confirmação`}</li>)}</ul></section>}
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[['Fundo inicial', register.initialAmount], ['Vendas em dinheiro', register.totals.cashSales], ['Fiados recebidos em dinheiro', register.totals.cashCreditReceipts], ['Suprimentos', register.totals.supplies], ['Esperado na gaveta', register.expectedAmount]].map(([label, value]) => <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{formatMoney(value)}</p></article>)}
          </section>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold">Movimentações do turno</h2><p className="text-sm text-slate-500">Abertura em {new Date(register.openedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p></div><Wallet className="text-orange-600" /></div>
              {register.movements.length ? <ul className="divide-y divide-slate-100">{register.movements.map((movement) => <li key={movement.id} className="flex items-center justify-between gap-3 py-3"><span className="flex items-center gap-3">{movement.type === 'supply' ? <ArrowDownToLine className="text-emerald-600" size={18} /> : <ArrowUpFromLine className="text-orange-600" size={18} />}<span><strong className="block text-sm">{movement.description}</strong><span className="text-xs text-slate-500">{movement.type === 'supply' ? 'Suprimento' : 'Sangria'} · {new Date(movement.createdAt).toLocaleTimeString('pt-BR')}</span></span></span><strong className="tabular-nums">{formatMoney(movement.amount)}</strong></li>)}</ul> : <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500">Nenhuma movimentação registrada neste turno.</p>}
            </section>
            <section className="space-y-5">
              {!register.needsClosing && movementForm}
              <form onSubmit={closeRegister} className="space-y-3 rounded-2xl border border-red-100 bg-white p-5 shadow-sm"><h2 className="flex items-center gap-2 font-semibold"><LockKeyhole size={18} />Fechar caixa</h2><p className="text-sm text-slate-500">Conte todo o dinheiro físico da gaveta. O sistema compara com o valor esperado.</p><MoneyInput required value={declaredAmount} onValueChange={setDeclaredAmount} placeholder="Valor contado em R$" /><Button type="submit" disabled={busy} variant="outline" className="w-full border-red-200 text-red-700 hover:bg-red-50">{busy ? <LoaderCircle className="mr-2 animate-spin" size={16} /> : null}Fechar turno</Button></form>
            </section>
          </div>
        </> : <>
          {movementForm}
          {closeSummary && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold">Resumo do último fechamento</h2><div className="mt-3 grid gap-3 sm:grid-cols-3"><p>Esperado: <strong>{formatMoney(closeSummary.expectedAmount)}</strong></p><p>Contado: <strong>{formatMoney(closeSummary.declaredAmount)}</strong></p><p>Diferença: <strong className={Number(closeSummary.differenceAmount) < 0 ? 'text-red-700' : 'text-emerald-700'}>{formatMoney(closeSummary.differenceAmount)}</strong></p></div></section>}
          <form onSubmit={openRegister} className="mx-auto max-w-xl space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-50 text-orange-700"><Wallet /></div><div><h2 className="text-xl font-semibold">Fundo de troco opcional</h2><p className="mt-1 text-sm text-slate-500">Você já pode vender sem abrir o caixa. Se desejar, informe o dinheiro de troco colocado na gaveta hoje.</p></div><label className="block text-sm font-medium">Fundo de troco inicial<MoneyInput required value={initialAmount} onValueChange={setInitialAmount} className="mt-2 h-12 text-right text-lg tabular-nums" /></label><Button type="submit" disabled={busy} className="h-12 w-full bg-orange-600 hover:bg-orange-700">{busy ? <LoaderCircle className="mr-2 animate-spin" size={16} /> : null}Registrar fundo de troco</Button></form>
        </>}
      </div>
    </main>
  );
}
