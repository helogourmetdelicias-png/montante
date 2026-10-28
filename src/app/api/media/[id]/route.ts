import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { IMAGE_BUCKET, imageStorage } from '@/lib/media/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.tenantId) return new Response(null, { status: 401 });
  const { id } = await context.params;
  const asset = await prisma.mediaAsset.findFirst({ where: { id, tenant_id: session.user.tenantId } });
  if (!asset) return new Response(null, { status: 404 });
  try {
    const { data, error } = await imageStorage().from(IMAGE_BUCKET).download(asset.storage_path);
    if (error || !data) return new Response(null, { status: 503 });
    return new Response(data, { headers: { 'Content-Type': asset.mime_type, 'Content-Disposition': 'inline', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" } });
  } catch { return new Response(null, { status: 503 }); }
}
