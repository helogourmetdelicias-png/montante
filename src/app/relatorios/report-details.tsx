'use client';

import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Group = { name: string; revenue: string; commission: string; saleCount: number; unconfiguredItems: number };
type Calendar = { date: string; revenue: string; saleCount: number };
export type Details = { byBrand: Group[]; byCategory: Group[]; bestDay: Calendar | null; bestMonth: Calendar | null; days: Calendar[]; months: Calendar[]; creditSales: string; creditReceipts: Array<{ method: string; amount: string }>; commissionRules: Array<{ brand: string; rate: string }>; brands: string[] };
const money = (value: string | number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
const labelDate = (date: string) => date.split('-').reverse().join('/');

export default function ReportDetails({ details, revenue, onSaved }: { details: Details; revenue: string; onSaved: () => void }) {
  const [brand, setBrand] = useState('');
  const [rate, setRate] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/reports/commissions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brand, rate: Number(rate.replace(',', '.')) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Falha ao salvar.');
      onSaved(); setMessage('Percentual salvo para as próximas vendas.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha ao salvar.'); }
    finally { setBusy(false); }
  }
  function grouped(title: string, groups: Group[], commissions = false) {
    return <section className="overflow-hidden rounded-2xl border bg-white shadow-sm"><h2 className="border-b p-5 font-semibold">{title}</h2>{groups.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr><th className="p-4">{commissions ? 'Marca' : 'Categoria'}</th><th className="p-4 text-right">Vendas</th><th className="p-4 text-right">Valor após descontos</th>{commissions && <th className="p-4 text-right">Comissão calculada</th>}</tr></thead><tbody>{groups.map(group => <tr key={group.name} className="border-t"><td className="p-4">{group.name}</td><td className="p-4 text-right">{group.saleCount}</td><td className="whitespace-nowrap p-4 text-right">{money(group.revenue)}</td>{commissions && <td className="p-4 text-right">{money(group.commission)}{group.unconfiguredItems > 0 && <span className="mt-1 block text-xs text-slate-500">Há itens sem percentual</span>}</td>}</tr>)}</tbody></table></div> : <p className="p-5 text-sm text-slate-500">Sem vendas de produtos no período.</p>}</section>;
  }
  function calendar(title: string, rows: Calendar[]) {
    return <section className="overflow-hidden rounded-2xl border bg-white shadow-sm"><h2 className="border-b p-5 font-semibold">{title}</h2>{rows.length ? <div className="max-h-80 overflow-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr><th className="p-4">Período</th><th className="p-4 text-right">Vendas</th><th className="p-4 text-right">Faturamento</th></tr></thead><tbody>{rows.map(row => <tr key={row.date} className="border-t"><td className="p-4">{labelDate(row.date)}</td><td className="p-4 text-right">{row.saleCount}</td><td className="p-4 text-right">{money(row.revenue)}</td></tr>)}</tbody></table></div> : <p className="p-5 text-sm text-slate-500">Sem vendas no período.</p>}</section>;
  }
  const freeSales = Math.round(Number(revenue) * 100) - details.byBrand.reduce((sum, row) => sum + Math.round(Number(row.revenue) * 100), 0);
  return <>
    <section className="grid gap-4 sm:grid-cols-2"><article className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">Melhor dia do período</h2><p className="mt-2">{details.bestDay ? `${labelDate(details.bestDay.date)} · ${money(details.bestDay.revenue)} · ${details.bestDay.saleCount} vendas` : 'Sem vendas'}</p></article><article className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">Melhor mês do período</h2><p className="mt-2">{details.bestMonth ? `${labelDate(details.bestMonth.date)} · ${money(details.bestMonth.revenue)} · ${details.bestMonth.saleCount} vendas` : 'Sem vendas'}</p></article></section>
    <p className="text-sm text-slate-500">Rankings pelo faturamento após descontos, no intervalo selecionado e no horário de São Paulo. Vendas rápidas sem produto: {money(freeSales / 100)}. Uma venda com várias marcas/categorias pode aparecer na contagem de mais de um grupo.</p>
    <div className="grid gap-5 xl:grid-cols-2">{grouped('Vendas por marca', details.byBrand, true)}{grouped('Vendas por categoria', details.byCategory)}</div>
    <div className="grid gap-5 xl:grid-cols-2">{calendar('Dias por faturamento', details.days)}{calendar('Meses por faturamento', details.months)}</div>
    <section className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">Fiados e recebimentos</h2><p className="mt-2 text-sm">Vendas feitas em Fiado no período: <strong>{money(details.creditSales)}</strong>. Esse valor já integra o faturamento.</p><p className="mt-2 text-sm text-slate-500">Recebimentos de fiados durante o período, inclusive compras antigas. Não são contados como novas vendas.</p><ul className="mt-3 space-y-1 text-sm">{details.creditReceipts.map(row => <li key={row.method}>{({ cash: 'Dinheiro', pix: 'Pix', credit_card: 'Crédito', debit_card: 'Débito' } as Record<string, string>)[row.method]}: {money(row.amount)}</li>)}</ul>{!details.creditReceipts.length && <p className="mt-2 text-sm text-slate-500">Nenhum recebimento de fiado neste período.</p>}</section>
    <section className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">Comissão opcional por marca</h2><p className="mt-2 text-sm text-slate-500">Não é necessário configurar quando a marca já fornece sua comissão. O percentual calcula uma estimativa sobre vendas após descontos, sem mudar preços ou gerar pagamentos. Vale para as próximas vendas; alterações não recalculam o histórico. Itens sem percentual cadastrado não têm comissão estimada. Para vendas antigas, marca/categoria refletem o cadastro atual.</p>
      <form onSubmit={save} className="mt-4 flex flex-wrap items-end gap-3"><label className="text-sm font-medium">Marca<Input list="commission-brand-options" maxLength={80} required value={brand} onChange={event => setBrand(event.target.value)} className="mt-1" /><datalist id="commission-brand-options">{[...new Set([...details.brands, ...details.commissionRules.map(rule => rule.brand)])].map(name => <option key={name}>{name}</option>)}</datalist></label><label className="text-sm font-medium">Percentual (%)<Input type="number" min="0" max="100" step="0.01" required value={rate} onChange={event => setRate(event.target.value)} className="mt-1" /></label><Button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar percentual'}</Button></form>
      {message && <p role="status" className="mt-3 text-sm">{message}</p>}<ul className="mt-4 text-sm">{details.commissionRules.map(rule => <li key={rule.brand}>{rule.brand}: {Number(rule.rate).toLocaleString('pt-BR')}%</li>)}</ul>
    </section>
  </>;
}
