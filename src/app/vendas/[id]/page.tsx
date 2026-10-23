import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { dateTime, money, paymentMethod, saleStatus } from '../format';
import PrintButton from './print-button';
import SaleActions from './sale-actions';
import { isAbandonedManualCharge } from '@/lib/cash-register/pending';

export const dynamic = 'force-dynamic';

export default async function SaleDetail(props: { params: Promise<{ id: string }>; searchParams: Promise<{ embedded?: string }> }) {
  const [params, searchParams] = await Promise.all([props.params, props.searchParams]);
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) redirect('/login');
  const sale = await prisma.sale.findFirst({
    where: { id: params.id, tenant_id: tenantId },
    include: {
      tenant: { select: { name: true } },
      credit: { include: { payments: { orderBy: { created_at: 'asc' } } } },
      customer: { select: { name: true } },
      cash_register_session: { select: { user_id: true, status: true, user: { select: { name: true } } } },
      items: { include: { product: { select: { name: true, sku: true, unit_of_measure: true } } } },
      payment_attempts: { orderBy: { created_at: 'asc' }, select: { id: true, provider: true, method: true, status: true, amount: true, amount_received: true, change_amount: true, is_simulated: true } },
    },
  });
  if (!sale) notFound();
  const paid = sale.payment_attempts.filter(attempt => attempt.status === 'APPROVED');
  const pending = sale.payment_attempts.filter(attempt => ['CREATED', 'PENDING'].includes(attempt.status) &&
    !isAbandonedManualCharge(sale.status, attempt.provider));
  const manualPending = pending.filter(attempt => ['pix_manual', 'external_terminal'].includes(attempt.provider));
  const onlinePendingCount = pending.length - manualPending.length;
  const canConfirmReceipt = sale.cash_register_session?.status === 'OPEN' && sale.cash_register_session.user_id === session.user.id;
  const subtotal = sale.is_quick_sale ? sale.total_amount.add(sale.discount_amount) : sale.items.reduce((sum, item) => sum.add(item.total_price), sale.total_amount.mul(0));
  return <main className="sale-detail min-h-screen bg-slate-50 p-4 text-slate-900 sm:p-8">
    <div className="receipt-actions mx-auto mb-5 flex max-w-2xl flex-wrap items-center justify-between gap-3">{searchParams.embedded !== '1' && <Link href="/vendas" className="text-orange-700 underline">Voltar às vendas</Link>}{sale.status === 'completed' && <PrintButton />}</div>
    {sale.status === 'pending' && searchParams.embedded !== '1' && <SaleActions
      saleId={sale.id}
      expired={sale.expires_at !== null && sale.expires_at.getTime() <= Date.now()}
      canConfirm={canConfirmReceipt}
      manualAttempts={manualPending.map(attempt => ({ id: attempt.id, provider: attempt.provider, amount: attempt.amount.toFixed(2) }))}
      onlinePendingCount={onlinePendingCount}
    />}
    <article className="sale-receipt mx-auto max-w-2xl space-y-5 rounded-xl border bg-white p-5 sm:p-8">
      <header className="border-b pb-4"><h1 className="text-xl font-semibold">{sale.tenant.name}</h1><p className="font-medium">Venda #{sale.sale_number} · {saleStatus(sale.status)}</p><p className="text-sm">{dateTime(sale.created_at)} · Horário de São Paulo</p><p className="text-sm">Operador: {sale.cash_register_session?.user.name ?? 'Não registrado'}</p><p className="mt-3 text-sm font-semibold">{sale.status === 'completed' ? 'COMPROVANTE NÃO FISCAL' : 'CONSULTA DE VENDA — NÃO COMPROVA PAGAMENTO'}</p>{paid.some(attempt => attempt.is_simulated) && <p className="font-bold text-amber-800">TESTE — PAGAMENTO SIMULADO</p>}</header>
      {sale.customer && <p className="text-sm">Cliente: {sale.customer.name}</p>}
      {pending.length > 0 && <section className="receipt-actions rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"><h2 className="font-semibold">Cobranças pendentes</h2><p>A situação da cobrança é separada da situação da venda. Confira o resultado do pagamento antes de fechar o caixa.</p>{pending.map(attempt => <p key={attempt.id} className="mt-2">{paymentMethod(attempt.method)} · {attempt.provider} · {money(attempt.amount)} · Aguardando confirmação</p>)}</section>}
      <section aria-label="Itens da venda" className="space-y-3">{sale.is_quick_sale && <div className="border-b pb-3"><p className="font-medium">Venda rápida — valor livre</p><p className="text-sm">Sem produto e sem movimentação de estoque</p></div>}{sale.items.map(item => <div key={item.id} className="border-b pb-3"><p className="break-words font-medium">{item.product.name}</p><div className="flex flex-wrap justify-between gap-2 text-sm"><span>{Number(item.quantity.toString()).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} × {money(item.unit_price)}</span><span>{money(item.total_price)}</span></div>{item.product.sku && <p className="text-xs text-slate-500">Código: {item.product.sku}</p>}</div>)}</section>
      <dl className="space-y-2"><div className="flex justify-between"><dt>Subtotal</dt><dd>{money(subtotal)}</dd></div><div className="flex justify-between"><dt>Desconto</dt><dd>{money(sale.discount_amount)}</dd></div><div className="flex justify-between text-lg font-bold"><dt>Total</dt><dd>{money(sale.total_amount)}</dd></div></dl>
      <section className="border-t pt-4">{sale.credit && <div className="mb-4 rounded-lg border border-orange-200 p-3 text-sm"><p className="font-semibold">Venda em Fiado — pagamento posterior</p><p>Recebido: {money(sale.credit.payments.reduce((sum, payment) => sum.add(payment.amount), sale.credit.amount.mul(0)))} · Saldo a receber: {money(sale.credit.amount.sub(sale.credit.payments.reduce((sum, payment) => sum.add(payment.amount), sale.credit.amount.mul(0))))}</p><p>Este documento registra a compra e não comprova quitação do saldo.</p>{sale.credit.payments.map(payment => <p key={payment.id}>{dateTime(payment.created_at)} · {paymentMethod(payment.method)} · {money(payment.amount)}</p>)}</div>}{!sale.credit && <><h2 className="mb-2 font-semibold">Pagamentos confirmados</h2>{paid.length ? paid.map(attempt => <div key={attempt.id} className="mb-3 text-sm"><p className="flex justify-between"><span>{paymentMethod(attempt.method)}</span><span>{money(attempt.amount)}</span></p>{attempt.amount_received !== null && <p>Recebido: {money(attempt.amount_received)} · Troco: {money(attempt.change_amount ?? 0)}</p>}</div>) : <p className="text-sm">Nenhum pagamento confirmado.</p>}</>}</section>
      {sale.notes && <section className="border-t pt-3"><h2 className="font-semibold">Observações</h2><p className="whitespace-pre-wrap break-words text-sm">{sale.notes}</p></section>}
      <footer className="border-t pt-3 text-xs text-slate-500"><p>Documento de conferência. Não substitui documento fiscal.</p><p className="receipt-actions mt-1">Valores e quantidades registrados na venda. Nomes e códigos refletem o cadastro atual dos produtos.</p></footer>
    </article>
  </main>;
}
