import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), user: vi.fn(), billing: vi.fn(), aggregate: vi.fn() }));
vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findFirst: mocks.user }, billingRecord: { findFirst: mocks.billing }, sale: { aggregate: mocks.aggregate } } }));
import { canAccessAdvancedDashboard } from '@/lib/reports/dashboard-access';
import { dashboardChange, dashboardDays, previousDashboardPeriod } from '@/lib/reports/dashboard';
import { GET } from '@/app/api/reports/sales/route';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ email: 'normal@example.com' });
  mocks.billing.mockResolvedValue(null);
  mocks.auth.mockResolvedValue({ user: { id: 'user-a', tenantId: 'tenant-a', role: 'owner' } });
});

describe('dashboard access', () => {
  it('grants only the named active management account an exception without touching billing', async () => {
    mocks.user.mockResolvedValue({ email: 'TecnicoRikardo@gmail.com' });
    expect(await canAccessAdvancedDashboard('cmvgl6kc60002o1diccbbqoh2', 'cmvgl6kc50000o1di5ees1q1e')).toBe(true);
    expect(mocks.user).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'cmvgl6kc60002o1diccbbqoh2', tenant_id: 'cmvgl6kc50000o1di5ees1q1e', is_active: true, role: { in: ['owner', 'admin'] }, tenant: { is_active: true } } }));
    expect(mocks.billing).not.toHaveBeenCalled();
  });
  it('does not grant the exception to a duplicated email in another store', async () => {
    mocks.user.mockResolvedValue({ email: 'tecnicorikardo@gmail.com' });
    expect(await canAccessAdvancedDashboard('other-user', 'other-tenant')).toBe(false);
  });
  it('denies ordinary free accounts and inactive or unrelated users', async () => {
    expect(await canAccessAdvancedDashboard('user-a', 'tenant-a')).toBe(false);
    mocks.user.mockResolvedValue(null);
    mocks.billing.mockClear();
    expect(await canAccessAdvancedDashboard('user-other', 'tenant-a')).toBe(false);
    expect(mocks.billing).not.toHaveBeenCalled();
  });
  it('requires a positive paid record in the current billing interval of the same tenant', async () => {
    mocks.billing.mockResolvedValue({ id: 'paid-a' });
    const now = new Date('2026-10-27T12:00:00Z');
    expect(await canAccessAdvancedDashboard('user-a', 'tenant-a', now)).toBe(true);
    expect(mocks.billing).toHaveBeenCalledWith({ where: { tenant_id: 'tenant-a', status: 'paid', paid_at: { not: null }, amount_due: { gt: 0 }, plan_tier: { in: ['Padrão', 'Avançado'] }, billing_start: { lte: now }, billing_end: { gt: now } }, select: { id: true } });
  });
  it('blocks direct advanced API requests before reading sales for free accounts', async () => {
    const response = await GET(new Request('https://example.com/api/reports/sales?dashboard=1'));
    expect(response.status).toBe(403);
    expect(mocks.aggregate).not.toHaveBeenCalled();
  });
  it('rejects anonymous and staff access even when requesting the advanced mode', async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await GET(new Request('https://example.com/api/reports/sales?dashboard=1'))).status).toBe(401);
    mocks.auth.mockResolvedValue({ user: { id: 'staff', tenantId: 'tenant-a', role: 'staff' } });
    expect((await GET(new Request('https://example.com/api/reports/sales?dashboard=1'))).status).toBe(403);
    expect(mocks.user).not.toHaveBeenCalled();
  });
  it('keeps basic reports outside the new paid restriction', async () => {
    const response = await GET(new Request('https://example.com/api/reports/sales?startDate=invalid'));
    expect(response.status).toBe(400);
    expect(mocks.user).not.toHaveBeenCalled();
    expect(mocks.billing).not.toHaveBeenCalled();
  });
  it('limits advanced periods to 366 days even for the exception', async () => {
    mocks.user.mockResolvedValue({ email: 'tecnicorikardo@gmail.com' });
    mocks.auth.mockResolvedValue({ user: { id: 'cmvgl6kc60002o1diccbbqoh2', tenantId: 'cmvgl6kc50000o1di5ees1q1e', role: 'owner' } });
    const response = await GET(new Request('https://example.com/api/reports/sales?dashboard=1&startDate=2024-01-01&endDate=2026-10-27'));
    expect(response.status).toBe(400);
    expect(mocks.aggregate).not.toHaveBeenCalled();
  });
});

describe('dashboard calendar and comparison', () => {
  it('fills missing days with zero and orders by calendar rather than revenue', () => {
    expect(dashboardDays('2026-10-01', '2026-10-03', [{ date: '2026-10-03', revenue: '90.00', saleCount: 2 }, { date: '2026-10-01', revenue: '10.00', saleCount: 1 }])).toEqual([
      { date: '2026-10-01', revenue: '10.00', saleCount: 1 }, { date: '2026-10-02', revenue: '0.00', saleCount: 0 }, { date: '2026-10-03', revenue: '90.00', saleCount: 2 },
    ]);
    expect(dashboardDays('2024-02-28', '2024-03-01', [])).toHaveLength(3);
  });
  it('uses the immediately preceding interval with the same number of days and no overlap', () => {
    const previous = previousDashboardPeriod(new Date('2026-10-01T03:00:00Z'), new Date('2026-10-08T03:00:00Z'));
    expect(previous.startAt.toISOString()).toBe('2026-09-24T03:00:00.000Z');
    expect(previous.endBefore.toISOString()).toBe('2026-10-01T03:00:00.000Z');
  });
  it('does not invent growth percentages when there is no previous revenue', () => {
    expect(dashboardChange(100, 0)).toBeNull();
    expect(dashboardChange(0, 0)).toBeNull();
    expect(dashboardChange(150, 100)).toBe(50);
    expect(dashboardChange(0, 100)).toBe(-100);
  });
});
