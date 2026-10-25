'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SERVICE_STATUSES, SERVICE_STATUS_LABELS } from '@/lib/service-orders/validation';
import type { serializeServiceOrder } from '@/lib/service-orders/service';
import { money, dateTime } from '../vendas/format';
type Order = ReturnType<typeof serializeServiceOrder>;
export default function ServiceOrderList() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    const timer = setTimeout(() => {
      fetch(`/api/service-orders?q=${encodeURIComponent(q)}&status=${status}&page=${page}`, { signal: controller.signal, cache: 'no-store' }).then(async res => {
        const result = await res.json(); if (!res.ok) throw new Error(result.error ?? 'Não foi possível consultar as O.S.');
        if (!controller.signal.aborted) { setOrders(result.orders); setTotal(result.total); }
      }).catch(err => { if (!controller.signal.aborted) setError(err.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 200);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [q, status, page]);
  return <>
    <header className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm font-medium text-orange-700">Assistência técnica e serviços</p><h1 className="text-3xl font-semibold">Ordens de serviço</h1><p className="mt-2 text-slate-600">Da entrada do aparelho à entrega e ao recebimento.</p></div><Link href="/ordens-servico/nova" className="rounded-lg bg-orange-600 px-5 py-3 font-semibold text-white">Nova O.S.</Link></header>
    <section className="flex flex-wrap gap-4 rounded-xl border bg-white p-4"><label className="min-w-56 flex-1 text-sm font-medium">Buscar O.S.<input className="mt-2 block w-full rounded-lg border p-2" placeholder="Cliente, aparelho, série / IMEI ou número" value={q} maxLength={120} onChange={e => { setQ(e.target.value); setPage(1); }} /></label><label className="text-sm font-medium">Situação<select className="mt-2 block rounded-lg border p-2" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">Todas</option>{SERVICE_STATUSES.map(s => <option key={s} value={s}>{SERVICE_STATUS_LABELS[s]}</option>)}</select></label></section>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800">{error}</p>}
    <section className="overflow-x-auto rounded-xl border bg-white" aria-busy={loading}><table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr>{['O.S.', 'Cliente / aparelho', 'Situação', 'Orçamento', 'Entrada', 'Detalhes'].map(t => <th key={t} className="p-4">{t}</th>)}</tr></thead><tbody>{orders.map(order => <tr key={order.id} className="border-t"><td className="p-4 font-semibold">#{order.number}</td><td className="p-4"><p className="font-medium">{order.clientName}</p><p className="text-slate-500">{order.deviceType} · {order.deviceBrandModel}</p></td><td className="p-4">{SERVICE_STATUS_LABELS[order.status]}</td><td className="p-4 whitespace-nowrap">{money(order.grandTotal)}</td><td className="p-4 whitespace-nowrap">{dateTime(new Date(order.createdAt))}</td><td className="p-4"><Link className="font-semibold text-orange-700 underline" href={`/ordens-servico/${order.id}`}>Abrir O.S.</Link></td></tr>)}</tbody></table>{loading ? <p role="status" className="p-6 text-center">Carregando ordens…</p> : !orders.length && <p className="p-6 text-center text-slate-500">Nenhuma ordem de serviço encontrada.</p>}</section>
    <nav aria-label="Páginas das ordens" className="flex items-center justify-between"><button className="rounded-lg border px-4 py-2 disabled:opacity-40" disabled={loading || page === 1} onClick={() => setPage(p => p - 1)}>Anterior</button><span className="text-sm">Página {page} · {total} O.S.</span><button className="rounded-lg border px-4 py-2 disabled:opacity-40" disabled={loading || page * 30 >= total} onClick={() => setPage(p => p + 1)}>Próxima</button></nav>
  </>;
}
