import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getBillingSummary } from '@/lib/billing-service';
import StoreNavigation from '@/components/store-navigation';
export const dynamic = 'force-dynamic';
const date = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const money = (n: string) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export default async function SubscriptionPage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect('/login');
  if (!['owner', 'admin'].includes(session.user.role)) redirect('/pdv');
  const summary = await getBillingSummary(session.user.tenantId);
  return <main className="mx-auto max-w-5xl space-y-6 p-6">
    <StoreNavigation activePage="subscription" canManageStore />
    <h1 className="text-2xl font-bold">Assinatura Montante</h1>
    <section className="space-y-3 rounded-xl border bg-white p-6">
      <h2 className="text-xl font-semibold">{summary.status === 'FREE' ? 'Plano gratuito liberado pela administração' : summary.status === 'TRIAL' ? `Período de testes — Restam ${summary.trialDays} dias` : summary.status === 'OVERDUE' ? 'Pagamento em atraso' : 'Assinatura ativa'}</h2>
      {summary.status === 'TRIAL' && <p>Acesso completo ao PDV gratuito até {date(summary.trialEnd)}.</p>}
      <p>{summary.count} de 500 vendas concluídas no ciclo de {date(summary.cycle.start)} até {date(summary.cycle.end)} (exclusivo).</p>
      <progress className="h-3 w-full" value={Math.min(summary.count, 500)} max={500} aria-label="Consumo de vendas do ciclo" />
      {!summary.managedPlan && summary.count >= 450 && <p role="status" className="rounded-lg bg-amber-100 p-3 text-amber-900">{summary.count > 500 ? 'Limite ultrapassado: o próximo ciclo pago será de R$ 79,00.' : 'Você está próximo do limite. Acima de 500 vendas, o próximo ciclo pago será de R$ 79,00.'}</p>}
      <p>Projeção para o próximo ciclo pago: {summary.projection.label} — {money(summary.projection.amount)}/mês. Planos gratuitos não geram novas cobranças. Durante o trial não há cobrança.</p>
      <p className="text-sm text-slate-600">{summary.managedPlan ? 'Plano definido pela administração. Mudanças não apagam cobranças anteriores.' : 'Até 500 vendas: R$ 49,90. A partir de 501: R$ 79,00. O valor volta automaticamente ao padrão quando o ciclo tiver até 500 vendas.'}</p>
    </section>
    <h2 className="text-xl font-semibold">Histórico de cobrança</h2>
    {!summary.records.length && <p>Nenhuma cobrança gerada.</p>}
    {summary.records.map(record => <article key={record.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
      <div><p>{record.plan_tier} — {money(record.amount_due.toString())} — {record.status === 'paid' ? 'Pago' : 'Pendente'}</p>
      <p>{record.total_sales} vendas apuradas {record.cycle_start && record.cycle_end && `de ${date(record.cycle_start)} até ${date(record.cycle_end)} (exclusivo)`}</p>
      {record.due_at && <p>Vencimento: {date(record.due_at)}</p>}</div>
      {record.status !== 'paid' && <form action={`/api/billing/${record.id}/checkout`} method="post"><button className="rounded-lg bg-orange-600 px-4 py-2 text-white">Pagar com Mercado Pago</button></form>}
    </article>)}
  </main>;
}
