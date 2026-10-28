import { beforeEach, expect, it, vi } from 'vitest';

const read = vi.hoisted(() => vi.fn());
vi.mock('@/lib/prisma', () => ({ prisma: { tenant: { findFirst: read } } }));
import { GET, HEAD } from '@/app/api/health/route';

beforeEach(() => { read.mockReset(); });

it('checks the database without publishing tenant identifiers and disables caching', async () => {
  read.mockResolvedValue({ id: 'private-tenant-id' });
  const response = await GET();
  expect(read).toHaveBeenCalledExactlyOnceWith({ select: { id: true } });
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(await response.json()).toEqual({ status: 'ok', database: 'up' });
});

it('accepts an empty database as healthy and returns 503 without exposing database errors', async () => {
  read.mockResolvedValue(null);
  expect((await GET()).status).toBe(200);
  read.mockRejectedValue(new Error('private database address and credentials'));
  const response = await GET();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ status: 'unavailable', database: 'down' });
});

it('HEAD also queries the database and preserves its status without a response body', async () => {
  read.mockResolvedValue({ id: 'tenant' });
  const success = await HEAD();
  expect(success.status).toBe(200);
  expect(await success.text()).toBe('');
  read.mockRejectedValue(new Error('offline'));
  const failure = await HEAD();
  expect(failure.status).toBe(503);
  expect(await failure.text()).toBe('');
  expect(read).toHaveBeenCalledTimes(2);
});
