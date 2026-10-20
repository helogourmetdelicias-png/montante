import Link from 'next/link';
import { getBillingSummary } from '@/lib/billing-service';

export default async function SubscriptionNotice({ tenantId }: { tenantId: string }) {
  const summary = await getBillingSummary(tenantId);
  return <aside className={`flex flex-wrap items-center justify-between gap-2 border-b px-6 py-3 text-sm ${summary.count >= 450 || summary.status === 'OVERDUE' ? 'bg-amber-100 text-amber-950' : 'bg-slate-50 text-slate-700'}`}>
    <p>{summary.status === 'TRIAL' ? `Período de testes — Restam ${summary.trialDays} dias` : summary.status === 'OVERDUE' ? 'Assinatura com pagamento em atraso' : 'Assinatura ativa'} · {summary.count} de 500 vendas concluídas no ciclo.
      {summary.count > 500 ? ' Próximo ciclo pago: R$ 79,00.' : summary.count >= 450 ? ' Você está próximo do limite de vendas.' : ''}</p>
    <Link href="/assinatura" className="font-semibold underline">Ver assinatura e cobranças</Link>
  </aside>;
}
