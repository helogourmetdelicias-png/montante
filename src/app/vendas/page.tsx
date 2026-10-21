import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Prisma } from '@prisma/client';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import StoreNavigation from '@/components/store-navigation';
import { dateTime, money, saleStatus } from './format';

export const dynamic = 'force-dynamic';

export default async function SalesPage({ searchParams }: { searchParams: { page?: string; status?: string; number?: string } }) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) redirect('/login');
  const status = ['completed', 'pending', 'cancelled'].includes(searchParams.status ?? '') ? searchParams.status! : '';
  const number = /^\d{1,9}$/.test(searchParams.number ?? '') ? Number(searchParams.number) : undefined;
  const requestedPage = Number(searchParams.page ?? '1');
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 100000) : 1;
  const where: Prisma.SaleWhereInput = { tenant_id: tenantId, ...(status ? { status } : {}), ...(number !== undefined ? { sale_number: number } : {}) };
  const limit = 25;
  const [sales, count] = await prisma.$transaction([
    prisma.sale.findMany({ where, orderBy: [{ created_at: 'desc' }, { sale_number: 'desc' }], skip: (page - 1) * limit, take: limit,
      select: { id: true, sale_number: true, created_at: true, status: true, total_amount: true, is_quick_sale: true, payment_method: true } }),
    prisma.sale.count({ where }),
  ]);
  const pageLink = (next: number) => `/vendas?${new URLSearchParams({ page: String(next), status, ...(number !== undefined ? { number: String(number) } : {}) })}`;
  return <main className="min-h-screen bg-slate-50 p-4 text-slate-900 sm:p-8"><div className="mx-auto max-w-5xl space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-semibold">Histórico de vendas</h1><p className="text-sm text-slate-500">Consulte os detalhes e reimprima comprovantes.</p></div><StoreNavigation activePage="sales" canManageStore={['owner', 'admin'].includes(session.user.role)} /></header>
    <form className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4"><label className="text-sm">Número da venda<input name="number" type="number" min="1" max="999999999" defaultValue={searchParams.number ?? ''} className="mt-1 block h-10 w-40 rounded-md border px-3" /></label><label className="text-sm">Situação<select name="status" defaultValue={status} className="mt-1 block h-10 rounded-md border bg-white px-3"><option value="">Todas</option><option value="completed">Concluídas</option><option value="pending">Pendentes</option><option value="cancelled">Canceladas</option></select></label><button className="h-10 rounded-md bg-orange-600 px-4 font-medium text-white">Filtrar</button><Link href="/vendas" className="p-2 text-sm underline">Limpar filtros</Link></form>
    <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-left text-sm"><thead className="bg-slate-100"><tr>{['Venda', 'Data (São Paulo)', 'Situação', 'Total', 'Detalhes'].map(label => <th key={label} className="whitespace-nowrap p-4">{label}</th>)}</tr></thead><tbody>{sales.map(sale => <tr key={sale.id} className="border-t"><td className="p-4">#{sale.sale_number}{sale.is_quick_sale && <span className="ml-2 text-xs text-orange-700">Rápida</span>}</td><td className="whitespace-nowrap p-4">{dateTime(sale.created_at)}</td><td className="p-4"><span className={sale.status === 'completed' ? 'font-medium text-emerald-700' : 'text-slate-600'}>{saleStatus(sale.status)}{sale.payment_method === 'fiado' && ' · Fiado'}</span></td><td className="whitespace-nowrap p-4">{money(sale.total_amount)}</td><td className="p-4"><Link className="font-medium text-orange-700 underline" href={`/vendas/${sale.id}`}>Ver venda</Link></td></tr>)}</tbody></table>{sales.length === 0 && <p className="p-6 text-center text-slate-500">Nenhuma venda encontrada com estes filtros.</p>}</div>
    <footer className="flex items-center justify-between gap-3 text-sm"><p>{count} vendas · Página {page} de {Math.max(1, Math.ceil(count / limit))}</p><div className="flex gap-4">{page > 1 && <Link href={pageLink(page - 1)} className="underline">Anterior</Link>}{page * limit < count && <Link href={pageLink(page + 1)} className="underline">Próxima</Link>}</div></footer>
  </div></main>;
}
