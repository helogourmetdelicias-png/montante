export type DashboardSummary = { revenue: string; saleCount: number; averageTicket: string };
export type DashboardDay = { date: string; revenue: string; saleCount: number };

export function previousDashboardPeriod(start: Date, endBefore: Date) {
  const duration = endBefore.getTime() - start.getTime();
  return { startAt: new Date(start.getTime() - duration), endBefore: new Date(start) };
}

export function dashboardDays(startDate: string, endDate: string, rows: DashboardDay[]) {
  const byDate = new Map(rows.map(row => [row.date, row]));
  const result: DashboardDay[] = [];
  const end = new Date(`${endDate}T12:00:00Z`);
  for (const date = new Date(`${startDate}T12:00:00Z`); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    const key = date.toISOString().slice(0, 10);
    result.push(byDate.get(key) ?? { date: key, revenue: '0.00', saleCount: 0 });
  }
  return result;
}

export function dashboardChange(current: number, previous: number) {
  return previous > 0 ? (current - previous) / previous * 100 : null;
}
