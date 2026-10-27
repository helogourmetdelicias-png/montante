import React from 'react';
import { createRoot } from 'react-dom/client';
import AdvancedDashboard from '../../src/app/relatorios/advanced-dashboard';
import '../../src/app/globals.css';

// Fictitious report for isolated visual/interaction checks. Never writes to a store.
const empty = new URLSearchParams(location.search).has('empty');
const report = {
  period: { startDate: '2026-10-01', endDate: '2026-10-07' },
  summary: { revenue: empty ? '0.00' : '12840.00', saleCount: empty ? 0 : 84, averageTicket: empty ? '0.00' : '152.86' },
  previous: { startDate: '2026-09-24', endDate: '2026-09-30', revenue: '10500.00', saleCount: 70, averageTicket: '150.00' },
  paymentBreakdown: empty ? [] : [{ method: 'pix', channel: 'online', amount: '6400.00' }, { method: 'credit_card', channel: 'external_terminal', amount: '3900.00' }, { method: 'cash', channel: 'in_person', amount: '2540.00' }],
  topCustomers: empty ? [] : [{ customerId: 'a', name: 'Ana Souza', revenue: '1450.00', saleCount: 5 }, { customerId: 'b', name: 'Carlos Oliveira', revenue: '980.00', saleCount: 3 }, { customerId: 'c', name: 'Mariana Costa', revenue: '820.00', saleCount: 4 }],
  details: { days: empty ? [] : [1100, 1540, 980, 2300, 1720, 2900, 2300].map((revenue, i) => ({ date: `2026-10-0${i + 1}`, revenue: revenue.toFixed(2), saleCount: 12 })), bestDay: empty ? null : { date: '2026-10-06', revenue: '2900.00' }, byCategory: empty ? [] : [{ name: 'Acessórios', revenue: '5800.00' }, { name: 'Peças e componentes', revenue: '4200.00' }, { name: 'Serviços', revenue: '2840.00' }] },
};
createRoot(document.getElementById('root')).render(<main className="min-h-screen bg-[#f4f6f8] p-4 text-slate-900 sm:p-8"><div className="mx-auto max-w-7xl"><p className="mb-4 text-xs text-slate-500">Prévia visual · dados fictícios</p><AdvancedDashboard report={report} /></div></main>);
