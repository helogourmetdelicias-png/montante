'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import ReportDetails, { type Details } from './report-details';
import WhatsappShare from '@/components/whatsapp-share';
import { reportShareText } from '@/lib/reports/share';
import { BarChart3, CircleAlert, LoaderCircle, Search } from 'lucide-react';
import StoreNavigation from '@/components/store-navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type ProductRank = { productId: string; name: string; sku: string | null; unit: string; quantity: string; revenue: string };
type Report = {
  storeName: string;
  details: Details;
  topCustomers: Array<{ customerId: string; name: string; isActive: boolean; revenue: string; saleCount: number }>;
  period: { startDate: string; endDate: string };
  summary: { revenue: string; saleCount: number; averageTicket: string };
  paymentBreakdown: Array<{ method: string; channel: string; amount: string }>;
  topProductsByRevenue: ProductRank[];
  topProductsByQuantity: ProductRank[];
};

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const money = (value: string) => currency.format(Number(value));
const todayParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).formatToParts(new Date());
const today = `${todayParts.find(({ type }) => type === 'year')?.value}-${todayParts.find(({ type }) => type === 'month')?.value}-${todayParts.find(({ type }) => type === 'day')?.value}`;

/** Loads financial totals and both product rankings for a selected date interval. */
export default function SalesReports() {
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [report, setReport] = useState<Report | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const requestId = useRef(0);

  const loadReport = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setBusy(true);
    setReport(null);
    setMessage('');
    try {
      const query = new URLSearchParams({ startDate, endDate });
      const response = await fetch(`/api/reports/sales?${query}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Não foi possível gerar o relatório.');
      if (currentRequest === requestId.current) setReport(data);
    } catch (error) {
      if (currentRequest === requestId.current) setMessage(error instanceof Error ? error.message : 'Falha ao gerar o relatório.');
    } finally {
      if (currentRequest === requestId.current) setBusy(false);
    }
  }, [endDate, startDate]);

  useEffect(() => { void loadReport(); }, [loadReport]);

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadReport();
  }

  const paymentName = (method: string, channel: string) => {
    if (method === 'cash') return 'Dinheiro';
    if (method === 'pix') return 'Pix';
    if (method === 'credit_card') return channel === 'external_terminal' ? 'Crédito · maquininha' : 'Crédito';
    if (method === 'debit_card') return channel === 'external_terminal' ? 'Débito · maquininha' : 'Débito';
    return method;
  };

  function rankings(title: string, products: ProductRank[]) {
    return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold">{title}</h2></div>{products.length ? <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Produto</th><th className="px-5 py-3 text-right">Quantidade</th><th className="px-5 py-3 text-right">Valor dos itens</th></tr></thead><tbody className="divide-y divide-slate-100">{products.slice(0, 20).map((product) => <tr key={product.productId}><td className="px-5 py-3"><strong>{product.name}</strong><span className="ml-2 text-xs text-slate-500">{product.sku ?? ''}</span></td><td className="px-5 py-3 text-right tabular-nums">{Number(product.quantity).toLocaleString('pt-BR')} {product.unit}</td><td className="px-5 py-3 text-right tabular-nums">{money(product.revenue)}</td></tr>)}</tbody></table></div> : <p className="p-5 text-sm text-slate-500">Sem vendas de produtos no período.</p>}</section>;
  }

  return (
    <main className="min-h-screen bg-[#f4f6f8] text-slate-900">
      <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5 lg:px-8"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-700">Montante · Gestão</p><h1 className="mt-1 text-2xl font-semibold">Relatórios de vendas</h1><p className="mt-1 text-sm text-slate-500">Faturamento, pagamentos e produtos mais vendidos.</p></div><StoreNavigation activePage="reports" canManageStore /></div></header>
      <div className="mx-auto max-w-7xl space-y-5 px-5 py-6 lg:px-8">
        <form onSubmit={submitFilters} className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><label className="text-sm font-medium">De<Input type="date" required value={startDate} max={endDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1 h-10" /></label><label className="text-sm font-medium">Até<Input type="date" required value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} className="mt-1 h-10" /></label><Button type="submit" disabled={busy} className="h-10 bg-orange-600 hover:bg-orange-700">{busy ? <LoaderCircle className="mr-2 animate-spin" size={16} /> : <Search className="mr-2" size={16} />}Aplicar período</Button></form>
        {message && <div role="alert" className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><CircleAlert size={18} />{message}</div>}
        {report && <>
          <WhatsappShare text={reportShareText(report)} disabled={busy} />
          <p className="text-sm text-slate-500">Período: {new Date(`${report.period.startDate}T00:00:00`).toLocaleDateString('pt-BR')} a {new Date(`${report.period.endDate}T00:00:00`).toLocaleDateString('pt-BR')}</p>
          <section className="grid gap-4 sm:grid-cols-3">{[['Faturamento', money(report.summary.revenue)], ['Vendas concluídas', report.summary.saleCount.toLocaleString('pt-BR')], ['Ticket médio', money(report.summary.averageTicket)]].map(([label, value]) => <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p></article>)}</section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="flex items-center gap-2 font-semibold"><BarChart3 className="text-orange-600" size={19} />Faturamento por forma de pagamento</h2>{report.paymentBreakdown.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{report.paymentBreakdown.map((payment) => <article key={`${payment.method}-${payment.channel}`} className="rounded-xl bg-slate-50 p-4"><p className="text-sm text-slate-500">{paymentName(payment.method, payment.channel)}</p><p className="mt-1 text-lg font-semibold tabular-nums">{money(payment.amount)}</p></article>)}</div> : <p className="mt-3 text-sm text-slate-500">Sem pagamentos aprovados no período.</p>}</section>
          <p className="text-sm text-slate-500">Os rankings de produtos abaixo mostram o valor dos itens antes do desconto geral da venda. Os detalhamentos por marca e categoria mostram os valores após descontos.</p>
          <div className="grid gap-5 xl:grid-cols-2">{rankings('Mais vendidos por quantidade', report.topProductsByQuantity)}{rankings('Maior valor em itens por produto', report.topProductsByRevenue)}</div>
          <ReportDetails details={report.details} revenue={report.summary.revenue} onSaved={() => void loadReport()} />
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b p-5"><h2 className="font-semibold">Melhores clientes</h2><p className="mt-1 text-sm text-slate-500">Ordenados pelo valor total das vendas concluídas no período, após descontos. Vendas sem cliente não entram neste ranking.</p></div>{report.topCustomers.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr><th className="p-4">Cliente</th><th className="p-4 text-right">Compras</th><th className="p-4 text-right">Total comprado</th></tr></thead><tbody>{report.topCustomers.map((customer, index) => <tr key={customer.customerId} className="border-t"><td className="p-4"><Link href={`/clientes/${customer.customerId}?${new URLSearchParams(report.period)}`} className="font-medium text-orange-700 underline">{index + 1}. {customer.name}</Link>{!customer.isActive && <span className="ml-2 text-xs text-slate-500">Inativo</span>}</td><td className="p-4 text-right">{customer.saleCount}</td><td className="whitespace-nowrap p-4 text-right">{money(customer.revenue)}</td></tr>)}</tbody></table></div> : <p className="p-5 text-sm text-slate-500">Sem compras concluídas vinculadas a clientes neste período.</p>}</section>
        </>}
      </div>
    </main>
  );
}
