import { expect, it, vi } from 'vitest';

vi.mock('next-auth/jwt', () => ({ getToken: vi.fn().mockResolvedValue(null) }));
import middleware from '@/middleware';

it('only exposes the exact health path and preserves protected routes', async () => {
  async function request(path: string) {
    const url = `https://example.com${path}`;
    return await middleware({ nextUrl: new URL(url), url } as never) as Response;
  }
  const healthy = await request('/api/health');
  expect(healthy.status).toBe(200);
  expect(healthy.headers.get('x-middleware-next')).toBe('1');
  for (const path of ['/api/health/private', '/api/health-other', '/api/reports/sales', '/api/settings/payments']) {
    const protectedResponse = await request(path);
    expect(protectedResponse.status).toBe(307);
    expect(protectedResponse.headers.get('location')).toBe('https://example.com/login');
  }
});
