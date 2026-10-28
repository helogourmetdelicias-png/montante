import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

const headers = { 'Cache-Control': 'no-store, max-age=0', 'X-Robots-Tag': 'noindex, nofollow' };

/** Public availability probe: one small database read, no customer data or writes. */
export async function GET() {
  try {
    await prisma.tenant.findFirst({ select: { id: true } });
    return NextResponse.json({ status: 'ok', database: 'up' }, { headers });
  } catch {
    return NextResponse.json({ status: 'unavailable', database: 'down' }, { status: 503, headers });
  }
}

// HEAD monitors must also check the database rather than just the HTTP server.
export async function HEAD() {
  const response = await GET();
  return new Response(null, { status: response.status, headers: response.headers });
}
