'use client';

import { useEffect, useRef, useState } from 'react';
import { INVENTORY_FILTERS, INVENTORY_LABELS, inventoryDate, type InventoryFilter, type InventoryItem, type InventorySummary } from '@/lib/inventory-alerts';
import InventoryAlertBadges from './inventory-alert-badges';
import { Button } from './ui/button';
import { Input } from './ui/input';

type Report = { today: string; summary: InventorySummary; items: InventoryItem[]; total: number; pageSize: number };
const counts = ['low', 'out', 'expiring', 'expired'] as const;

export default function InventoryAlertsPanel({ mode = 'summary', onFilter, refreshKey }: { mode?: 'summary' | 'catalog' | 'report'; onFilter?: (filter: InventoryFilter) => void; refreshKey?: string }) {
  const [report, setReport] = useState<Report | null>(null);
  const [filter, setFilter] = useState<InventoryFilter>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const sequence = useRef(0);
  const params = new URLSearchParams({ filter, page: String(page), ...(query.trim() ? { q: query.trim() } : {}) });

  useEffect(() => {
    const controller = new AbortController();
    async function refresh() {
      const current = ++sequence.current;
      setBusy(true);
      try {
        const search = new URLSearchParams({ filter, page: String(page), ...(query.trim() ? { q: query.trim() } : {}) });
        const response = await fetch(`/api/inventory-alerts?${search}`, { cache: 'no-store', signal: controller.signal });
        const data = await response.json();
        if (controller.signal.aborted || current !== sequence.current) return;
        if (!response.ok) throw new Error(data.error ?? 'Não foi possível consultar os alertas.');
        setReport(data); setError('');
      } catch (cause) {
        if (!controller.signal.aborted && current === sequence.current) setError(cause instanceof Error ? cause.message : 'Falha ao consultar os alertas.');
      } finally {
        if (!controller.signal.aborted && current === sequence.current) setBusy(false);
      }
    }
    const initial = window.setTimeout(() => void refresh(), 200);
    const timer = window.setInterval(() => void refresh(), 60000);
    const update = () => void refresh();
    window.addEventListener('focus', update);
    window.addEventListener('montante:inventory-updated', update);
    return () => { controller.abort(); window.clearTimeout(initial); window.clearInterval(timer); window.removeEventListener('focus', update); window.removeEventListener('montante:inventory-updated', update); };
  }, [filter, page, query, retry, refreshKey]);

  function choose(value: InventoryFilter) {
    setFilter(value); setPage(1); onFilter?.(value);
  }

  return <section aria-label="Alertas de estoque e validade" className="space-y-4 rounded-2xl border border-amber-200 bg-white p-4 shadow-sm sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Alertas de estoque e validade</h2><p className="mt-1 text-sm text-slate-600">{report ? `${report.summary.all} produto(s) precisam de atenção.` : 'Consultando os produtos da loja…'}{report && ` Atualizado em ${inventoryDate(report.today)}.`}</p></div>{mode === 'summary' && <a href="/relatorios#estoque-validade" className="text-sm font-semibold text-orange-700 underline">Ver relatório</a>}</div>
    {error ? <div role="alert" className="text-sm text-red-700">{error} <button type="button" onClick={() => setRetry(value => value + 1)} className="font-semibold underline">Tentar novamente</button></div> : report && <>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{counts.map(key => mode === 'summary'
        ? <a key={key} href={`/produtos?alert=${key}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3 hover:border-orange-400"><span className="block text-2xl font-semibold tabular-nums">{report.summary[key]}</span><span className="text-sm text-slate-600">{INVENTORY_LABELS[key]}</span></a>
        : <button key={key} type="button" onClick={() => choose(key)} aria-pressed={filter === key} className={`rounded-xl border p-3 text-left ${filter === key ? 'border-orange-400 bg-orange-50' : 'border-slate-200 bg-slate-50 hover:border-orange-400'}`}><span className="block text-2xl font-semibold tabular-nums">{report.summary[key]}</span><span className="text-sm text-slate-600">{INVENTORY_LABELS[key]}</span></button>)}</div>
      {report.summary.urgent > 0 && <p className="text-sm font-medium text-orange-800">Atenção: {report.summary.urgent} produto(s) vencem hoje ou nos próximos 7 dias.</p>}
      {report.summary.all === 0 && <p className="text-sm text-emerald-800">Nenhum alerta nos produtos ativos. Para monitorar reposição e vencimento, informe o estoque mínimo e a validade no cadastro.</p>}
    </>}
    {mode === 'catalog' && filter !== 'all' && <button type="button" onClick={() => choose('all')} className="text-sm font-semibold text-orange-700 underline">Mostrar todos os produtos</button>}
    {mode === 'report' && <>
      <p className="text-sm text-slate-500">Estoque atual dos produtos ativos, independente do período das vendas. Produtos sem saldo não geram avisos de validade. Datas e lotes são os informados no cadastro do produto.</p>
      <div className="flex flex-wrap items-end gap-3"><label className="text-sm font-medium">Tipo de alerta<select value={filter} onChange={event => choose(event.target.value as InventoryFilter)} className="mt-1 block h-10 rounded-lg border bg-white px-3">{INVENTORY_FILTERS.map(value => <option key={value} value={value}>{INVENTORY_LABELS[value]}</option>)}</select></label><label className="text-sm font-medium">Buscar produto<Input maxLength={100} value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} className="mt-1" /></label><a href={`/api/inventory-alerts/export?${params}`} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-orange-700">Exportar alertas em Excel</a></div>
      {busy && <p role="status" className="text-sm text-slate-500">Atualizando alertas…</p>}
      {report && !error && <><div className="overflow-x-auto"><table className="w-full min-w-[740px] text-left text-sm"><thead className="bg-slate-50"><tr>{['Produto / SKU', 'Quantidade', 'Mínimo', 'Validade', 'Dias restantes', 'Lote', 'Avisos'].map(title => <th key={title} className="p-3">{title}</th>)}</tr></thead><tbody>{report.items.map(item => <tr key={item.id} className="border-t border-slate-100"><td className="p-3"><a href={`/produtos?q=${encodeURIComponent(item.name)}`} className="font-semibold text-orange-700 underline">{item.name}</a><p className="text-xs text-slate-500">{item.sku ?? 'Sem SKU'}</p></td><td className="p-3 tabular-nums">{Number(item.stockQuantity).toLocaleString('pt-BR')} {item.unitOfMeasure}</td><td className="p-3">{item.stockMinAlert == null ? 'Não definido' : Number(item.stockMinAlert).toLocaleString('pt-BR')}</td><td className="p-3">{inventoryDate(item.attributes.expiryDate)}</td><td className="p-3">{item.daysUntilExpiry === null ? '—' : item.daysUntilExpiry === 0 ? 'Vence hoje' : item.daysUntilExpiry < 0 ? `Vencido há ${-item.daysUntilExpiry} dia(s)` : item.daysUntilExpiry}</td><td className="p-3">{item.attributes.lot || '—'}</td><td className="p-3"><InventoryAlertBadges flags={item.flags} /></td></tr>)}</tbody></table></div>{report.items.length === 0 && <p className="text-sm text-slate-500">Nenhum produto corresponde a este filtro.</p>}<div className="flex items-center justify-between gap-3 text-sm"><span>{report.total} produto(s) · Página {page}</span><div className="flex gap-2"><Button type="button" variant="outline" disabled={page === 1 || busy} onClick={() => setPage(value => value - 1)}>Anterior</Button><Button type="button" variant="outline" disabled={busy || page * report.pageSize >= report.total} onClick={() => setPage(value => value + 1)}>Próxima</Button></div></div></>}
    </>}
  </section>;
}
