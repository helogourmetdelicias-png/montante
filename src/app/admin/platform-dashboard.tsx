'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NICHE_LABELS, type BusinessNiche } from '@/lib/business-niche';

type Store = { id: string; name: string; slug: string; niche: BusinessNiche | null; active: boolean; createdAt: string; subscription: { status: string; trialEnd: string; nextBilling: string } | null;
  latestInvoice: { plan: string; amount: string; status: string; dueAt: string | null } | null;
  saleCount: number; revenue: string; creditBalance: string; products: number; customers: number; users: number };
type Overview = { operator: string; period: { startDate: string; endDate: string }; page: number; filtered: number; summary: { stores: number; activeStores: number; inactiveStores: number; trials: number; overdue: number; saleCount: number; revenue: string; saasReceived: string; saasPending: string }; stores: Store[] };
const money = (amount: string) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(amount));
const date = (value: string) => new Date(value).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const statusName: Record<string, string> = { TRIAL: 'Em testes', ACTIVE: 'Ativa', OVERDUE: 'Em atraso', TRIAL_ENDED: 'Testes encerrados' };

export default function PlatformDashboard() {
  const [data, setData] = useState<Overview | null>(null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const version = useRef(0);
  const load = useCallback(async () => {
    const current = ++version.current;
    setBusy(true); setMessage('');
    const params = new URLSearchParams({ q: query, page: String(page) });
    if (start) params.set('startDate', start);
    if (end) params.set('endDate', end);
    try {
      const response = await fetch(`/api/admin/overview?${params}`, { cache: 'no-store' });
      if (response.redirected) throw new Error('Sua sessão terminou. Entre novamente com e-mail e senha.');
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Não foi possível carregar o painel.');
      if (current === version.current) setData(result);
    } catch (error) { if (current === version.current) { setData(null); setMessage(error instanceof Error ? error.message : 'Falha ao consultar o painel.'); } }
    finally { if (current === version.current) setBusy(false); }
  }, [query, page, start, end]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 300);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [load]);
  return <main className="min-h-screen bg-[#f4f6f8] text-slate-900">
    <header className="border-b bg-white"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5 lg:px-8"><div><p className="text-xs font-semibold uppercase tracking-wide text-orange-700">Montante PDV · Administração geral</p><h1 className="mt-1 text-2xl font-semibold">Monitoramento de lojas</h1><p className="mt-1 text-sm text-slate-500">Visão de todas as lojas, vendas e assinaturas.</p></div><div className="flex flex-wrap gap-3"><Link href="/pdv" className="rounded-lg border px-4 py-2 text-sm">Minha loja</Link><Button variant="outline" onClick={() => void signOut({ callbackUrl: '/login' })}>Sair da conta</Button></div></div></header>
    <div className="mx-auto max-w-7xl space-y-5 px-5 py-6 lg:px-8">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border bg-white p-4"><label className="text-sm font-medium">De<Input type="date" value={start || data?.period.startDate || ''} max={end || data?.period.endDate} onChange={event => { setStart(event.target.value); if (!end && data) setEnd(data.period.endDate); setPage(1); }} className="mt-1" /></label><label className="text-sm font-medium">Até<Input type="date" value={end || data?.period.endDate || ''} min={start || data?.period.startDate} onChange={event => { setEnd(event.target.value); if (!start && data) setStart(data.period.startDate); setPage(1); }} className="mt-1" /></label><Button disabled={busy} onClick={() => void load()}>{busy ? 'Atualizando…' : 'Atualizar painel'}</Button></div>
      {message && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{message}</p>}
      {data && <>
        <p className="text-sm text-slate-500">Totais gerais da plataforma. Vendas e mensalidades recebidas de {date(`${data.period.startDate}T12:00:00Z`)} a {date(`${data.period.endDate}T12:00:00Z`)}. Demais indicadores mostram a situação atual.</p>
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[
          ['Lojas cadastradas', String(data.summary.stores)], ['Lojas ativas', String(data.summary.activeStores)], ['Lojas inativas', String(data.summary.inactiveStores)], ['Lojas em testes', String(data.summary.trials)],
          ['Assinaturas em atraso', String(data.summary.overdue)], ['Vendas concluídas no período', String(data.summary.saleCount)], ['Faturamento das lojas no período', money(data.summary.revenue)], ['Mensalidades recebidas no período', money(data.summary.saasReceived)], ['Mensalidades em aberto', money(data.summary.saasPending)],
        ].map(([label, value]) => <article key={label} className="rounded-2xl border bg-white p-5"><h2 className="text-sm text-slate-500">{label}</h2><p className="mt-2 text-2xl font-semibold">{value}</p></article>)}</section>
        <p className="text-sm text-slate-500">Faturamento considera vendas concluídas, incluindo Fiados; não representa apenas dinheiro recebido. Mensalidades são as cobranças do Montante. Saldo de Fiados é o valor ainda a receber, de todas as datas. A situação de assinatura reflete os registros da rotina de cobrança.</p>
        <label className="block text-sm font-medium">Buscar loja<Input value={query} maxLength={120} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Nome ou identificador da loja" className="mt-2 bg-white" /></label>
        <div className="overflow-x-auto rounded-2xl border bg-white"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-slate-50"><tr>{['Loja', 'Assinatura', 'Vendas no período', 'Fiados em aberto', 'Cadastros'].map(label => <th key={label} className="p-4">{label}</th>)}</tr></thead><tbody>{data.stores.map(store => <tr key={store.id} className="border-t align-top"><td className="p-4"><strong>{store.name}</strong><p className="mt-1 text-slate-500">{store.slug} · {store.active ? 'Ativa' : 'Inativa'}</p><p className="mt-1">{store.niche ? NICHE_LABELS[store.niche] : 'Nicho não escolhido'}</p><p className="mt-1 text-xs text-slate-500">Criada em {date(store.createdAt)}</p></td><td className="p-4"><strong>{store.subscription ? statusName[store.subscription.status] ?? store.subscription.status : 'Sem assinatura registrada'}</strong>{store.subscription && <><p className="mt-1">Fim dos testes: {date(store.subscription.trialEnd)}</p><p className="mt-1">Próximo ciclo: {date(store.subscription.nextBilling)}</p></>}{store.latestInvoice && <p className="mt-2 text-slate-500">Última mensalidade: {store.latestInvoice.plan} · {money(store.latestInvoice.amount)} · {store.latestInvoice.status === 'paid' ? 'Paga' : 'Pendente'}{store.latestInvoice.dueAt && ` · Vence ${date(store.latestInvoice.dueAt)}`}</p>}</td><td className="p-4"><p>{store.saleCount} vendas</p><strong className="mt-1 block">{money(store.revenue)}</strong></td><td className="p-4 font-semibold">{money(store.creditBalance)}</td><td className="p-4"><p>{store.products} produtos</p><p>{store.customers} clientes</p><p>{store.users} usuários</p></td></tr>)}</tbody></table>{!data.stores.length && <p className="p-5 text-sm text-slate-500">Nenhuma loja encontrada.</p>}</div>
        <div className="flex justify-between text-sm"><p>{data.filtered} lojas na busca · Página {data.page}</p><div className="flex gap-3"><button className="underline disabled:opacity-40" disabled={page <= 1 || busy} onClick={() => setPage(page - 1)}>Anterior</button><button className="underline disabled:opacity-40" disabled={page * 50 >= data.filtered || busy} onClick={() => setPage(page + 1)}>Próxima</button></div></div>
      </>}
    </div>
  </main>;
}
