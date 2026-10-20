'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import StoreNavigation from '@/components/store-navigation';
import WhatsappShare from '@/components/whatsapp-share';
import { historyShareText, type ShareHistory } from '@/lib/reports/share';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type History = Omit<ShareHistory, 'sales' | 'customer' | 'summary'> & { customer: { id: string; name: string; isActive: boolean }; summary: ShareHistory['summary'] & { lastPurchase: string | null }; sales: (ShareHistory['sales'][number] & { id: string; discountAmount: string })[]; limit: number };
const money = (value: string) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
const date = (value: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short' }).format(new Date(value));
const status = (value: string) => ({ completed: 'Concluída', pending: 'Pendente', cancelled: 'Cancelada' }[value] ?? value);

export default function CustomerHistory({ customerId, initialStart, initialEnd }: { customerId: string; initialStart: string; initialEnd: string }) {
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [filters, setFilters] = useState({ startDate: initialStart, endDate: initialEnd });
  const [page, setPage] = useState(1);
  const [history, setHistory] = useState<History | null>(null);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true); setHistory(null); setMessage('');
    const params = new URLSearchParams({ page: String(page) });
    if (filters.startDate || filters.endDate) { params.set('startDate', filters.startDate); params.set('endDate', filters.endDate); }
    fetch(`/api/customers/${customerId}/history?${params}`, { signal: controller.signal, cache: 'no-store' }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Não foi possível consultar o histórico.');
      if (!controller.signal.aborted) setHistory(data);
    }).catch(error => { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Falha na consulta.'); }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [customerId, filters, page]);

  function submit(event: FormEvent) { event.preventDefault(); setPage(1); setFilters({ startDate: start, endDate: end }); }
  return <main className="min-h-screen bg-slate-50 p-4 text-slate-900 sm:p-8"><div className="mx-auto max-w-6xl space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-4"><div><Link href="/clientes" className="text-sm text-orange-700 underline">Voltar aos clientes</Link><h1 className="mt-2 text-2xl font-semibold">Histórico do cliente</h1>{history && <p className="text-slate-600">{history.customer.name}{!history.customer.isActive && ' · Inativo'}</p>}</div><StoreNavigation activePage="customers" canManageStore /></header>
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4"><label className="text-sm">De<Input type="date" value={start} max={end || undefined} onChange={event => setStart(event.target.value)} /></label><label className="text-sm">Até<Input type="date" value={end} min={start || undefined} onChange={event => setEnd(event.target.value)} /></label><Button disabled={busy} className="bg-orange-600 hover:bg-orange-700">Aplicar período</Button><Button type="button" variant="outline" disabled={busy} onClick={() => { setStart(''); setEnd(''); setPage(1); setFilters({ startDate: '', endDate: '' }); }}>Todo o histórico</Button></form>
    {message && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{message}</p>}
    {busy && <p role="status">Carregando histórico…</p>}
    {history && <><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-500">{history.period ? `Período: ${history.period.startDate.split('-').reverse().join('/')} a ${history.period.endDate.split('-').reverse().join('/')}` : 'Todo o histórico'} · Resumo considera somente vendas concluídas.</p><WhatsappShare text={historyShareText(history)} label="Compartilhar esta página no WhatsApp" /></div>
    <section className="grid gap-3 sm:grid-cols-4">{[['Total comprado', money(history.summary.revenue)], ['Compras concluídas', String(history.summary.saleCount)], ['Ticket médio', money(history.summary.averageTicket)], ['Última compra no período', history.summary.lastPurchase ? date(history.summary.lastPurchase) : '—']].map(([label, value]) => <article key={label} className="rounded-xl border bg-white p-4"><h2 className="text-sm text-slate-500">{label}</h2><p className="mt-2 text-xl font-semibold">{value}</p></article>)}</section>
    <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-left text-sm"><thead className="bg-slate-100"><tr>{['Venda', 'Data (São Paulo)', 'Situação', 'Desconto', 'Total', 'Detalhes'].map(label => <th key={label} className="whitespace-nowrap p-4">{label}</th>)}</tr></thead><tbody>{history.sales.map(sale => <tr key={sale.id} className="border-t"><td className="p-4">#{sale.saleNumber}</td><td className="p-4">{date(sale.soldAt)}</td><td className="p-4">{status(sale.status)}</td><td className="whitespace-nowrap p-4">{money(sale.discountAmount)}</td><td className="whitespace-nowrap p-4">{money(sale.totalAmount)}</td><td className="p-4"><Link className="text-orange-700 underline" href={`/vendas/${sale.id}`}>Ver venda</Link></td></tr>)}</tbody></table>{!history.sales.length && <p className="p-5 text-center text-slate-500">Nenhuma venda para este cliente no período.</p>}</div>
    <footer className="flex items-center justify-between gap-3 text-sm"><span>{history.total} registros · Página {page} de {Math.max(1, Math.ceil(history.total / history.limit))}</span><div className="flex gap-3"><button disabled={page <= 1 || busy} onClick={() => setPage(page - 1)} className="underline disabled:opacity-40">Anterior</button><button disabled={page * history.limit >= history.total || busy} onClick={() => setPage(page + 1)} className="underline disabled:opacity-40">Próxima</button></div></footer></>}
  </div></main>;
}
