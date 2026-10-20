import { exportCatalog, importCatalog } from '@/lib/catalog-excel-route';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET(request: Request) { return exportCatalog(request, 'products'); }
export function POST(request: Request) { return importCatalog(request, 'products'); }
