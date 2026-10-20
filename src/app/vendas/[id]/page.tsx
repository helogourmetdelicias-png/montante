import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { dateTime, money, paymentMethod, saleStatus } from '../format';
import PrintButton from './print-button';

export const dynamic = 'force-dynamic';

export default async function SaleDetail({ params, searchParams }: { params: { id: string }; searchParams: { embedded?: string } }) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) redirect('/login');
  const sale = await prisma.sale.findFirst({
    where: { id: params.id, tenant_id: tenantId },
    include: {
      tenant: { select: { name: true } },
      customer: { select: { name: true } },
      cash_register_session: { select: { user: { select: { name: true } } } },
      items: { include: { product: { select: { name: true, sku: true, unit_of_measure: true } } } },
      payment_attempts: { orderBy: { created_at: 'asc' }, select: { id: true, method: true, status: true, amount: true, amount_received: true, change_amount: true, is_simulated: true } },
    },
  });
  if (!sale) notFound();
  const paid = sale.payment_attempts.filter(attempt => attempt.status === 'APPROVED');
  const subtotal = sale.items.reduce((sum, item) => sum.add(item.total_price), sale.total_amount.mul(0));
  return <main className="sale-detail min-h-screen bg-slate-50 p-4 text-slate-900 sm:p-8">
    <div className="receipt-actions mx-auto mb-5 flex max-w-2xl flex-wrap items-center justify-between gap-3">{searchParams.embedded !== '1' && <Link href="/vendas" className="text-orange-700 underline">Voltar às vendas</Link>}{sale.status === 'completed' && <PrintButton />}</div>
    <article className="sale-receipt mx-auto max-w-2xl space-y-5 rounded-xl border bg-white p-5 sm:p-8">
      <header className="border-b pb-4"><h1 className="text-xl font-semibold">{sale.tenant.name}</h1><p className="font-medium">Venda #{sale.sale_number} · {saleStatus(sale.status)}</p><p className="text-sm">{dateTime(sale.created_at)} · Horário de São Paulo</p><p className="text-sm">Operador: {sale.cash_register_session?.user.name ?? 'Não registrado'}</p><p className="mt-3 text-sm font-semibold">{sale.status === 'completed' ? 'COMPROVANTE NÃO FISCAL' : 'CONSULTA DE VENDA — NÃO COMPROVA PAGAMENTO'}</p>{paid.some(attempt => attempt.is_simulated) && <p className="font-bold text-amber-800">TESTE — PAGAMENTO SIMULADO</p>}</header>
      {sale.customer && <p className="text-sm">Cliente: {sale.customer.name}</p>}
      <section aria-label="Itens da venda" className="space-y-3">{sale.items.map(item => <div key={item.id} className="border-b pb-3"><p className="break-words font-medium">{item.product.name}</p><div className="flex flex-wrap justify-between gap-2 text-sm"><span>{Number(item.quantity.toString()).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} × {money(item.unit_price)}</span><span>{money(item.total_price)}</span></div>{item.product.sku && <p className="text-xs text-slate-500">Código: {item.product.sku}</p>}</div>)}</section>
      <dl className="space-y-2"><div className="flex justify-between"><dt>Subtotal</dt><dd>{money(subtotal)}</dd></div><div className="flex justify-between"><dt>Desconto</dt><dd>{money(sale.discount_amount)}</dd></div><div className="flex justify-between text-lg font-bold"><dt>Total</dt><dd>{money(sale.total_amount)}</dd></div></dl>
      <section className="border-t pt-4"><h2 className="mb-2 font-semibold">Pagamentos confirmados</h2>{paid.length ? paid.map(attempt => <div key={attempt.id} className="mb-3 text-sm"><p className="flex justify-between"><span>{paymentMethod(attempt.method)}</span><span>{money(attempt.amount)}</span></p>{attempt.amount_received !== null && <p>Recebido: {money(attempt.amount_received)} · Troco: {money(attempt.change_amount ?? 0)}</p>}</div>) : <p className="text-sm">Nenhum pagamento confirmado.</p>}</section>
      {sale.notes && <section className="border-t pt-3"><h2 className="font-semibold">Observações</h2><p className="whitespace-pre-wrap break-words text-sm">{sale.notes}</p></section>}
      <footer className="border-t pt-3 text-xs text-slate-500"><p>Documento de conferência. Não substitui documento fiscal.</p><p className="receipt-actions mt-1">Valores e quantidades registrados na venda. Nomes e códigos refletem o cadastro atual dos produtos.</p></footer>
    </article>
  </main>;
}
