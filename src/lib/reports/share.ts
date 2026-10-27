const money = (value: string) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
const date = (value: string) => value.split('-').reverse().join('/');
type Period = { startDate: string; endDate: string };
type Summary = { revenue: string; saleCount: number; averageTicket: string };
export type ShareReport = { storeName: string; period: Period; summary: Summary; topCustomers: { name: string; revenue: string; saleCount: number }[] };
export type ShareHistory = { storeName: string; customer: { name: string }; period: Period | null; summary: Summary; page: number; total: number; sales: { saleNumber: number; soldAt: string; status: string; totalAmount: string }[] };

export function reportShareText(report: ShareReport) {
  return [`${report.storeName} — Relatório de vendas`, `Período: ${date(report.period.startDate)} a ${date(report.period.endDate)}`,
    `Faturamento: ${money(report.summary.revenue)}`, `Vendas concluídas: ${report.summary.saleCount}`, `Ticket médio: ${money(report.summary.averageTicket)}`,
    '', 'Melhores clientes por valor em compras concluídas:',
    ...(report.topCustomers.length ? report.topCustomers.slice(0, 3).map((customer, index) => `${index + 1}. ${customer.name} — ${money(customer.revenue)} (${customer.saleCount} compras)`) : ['Sem compras vinculadas a clientes no período.']),
  ].join('\n');
}

export function historyShareText(history: ShareHistory) {
  const status = (value: string) => ({ completed: 'Concluída', pending: 'Pendente', cancelled: 'Cancelada' }[value] ?? value);
  const businessDate = (value: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date(value));
  return [`${history.storeName} — Histórico de compras`, `Cliente: ${history.customer.name}`,
    history.period ? `Período: ${date(history.period.startDate)} a ${date(history.period.endDate)}` : 'Período: todo o histórico',
    `Total em compras concluídas: ${money(history.summary.revenue)}`, `Compras concluídas: ${history.summary.saleCount}`, `Ticket médio: ${money(history.summary.averageTicket)}`,
    '', `Vendas da página ${history.page} (${history.sales.length} de ${history.total} registros no período):`,
    ...history.sales.map(sale => `#${sale.saleNumber} · ${businessDate(sale.soldAt)} · ${status(sale.status)} · ${money(sale.totalAmount)}`),
    ...(history.sales.length ? [] : ['Nenhuma venda no período.']), '', 'Pendentes e canceladas não compõem o total de compras concluídas.',
  ].join('\n');
}

export function whatsappShareUrl(text: string, phone?: string | null) {
  const digits = phone?.replace(/\D/g, '') ?? '';
  // O cadastro armazena telefones brasileiros com DDD, sem o código do país.
  const recipient = [10, 11].includes(digits.length) ? `55${digits}`
    : [12, 13].includes(digits.length) && digits.startsWith('55') ? digits : '';
  return `https://wa.me/${recipient}?text=${encodeURIComponent(text)}`;
}
