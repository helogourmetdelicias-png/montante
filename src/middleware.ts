import { getToken } from 'next-auth/jwt';
import { NextResponse, type NextRequest } from 'next/server';

// Ajustado pela auditoria: rota administrativa /api/settings/payments removida de PUBLIC_ROUTES para manter a proteção de borda do middleware
const PUBLIC_ROUTES = ['/login', '/register', '/cadastro', '/recuperar-senha', '/api/auth'];

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // The scheduler route enforces its own Bearer secret because it has no user session.
  const isPublic = pathname === '/api/health' || pathname === '/api/cron/release-expired-sales' || pathname === '/api/cron/billing' || pathname === '/api/webhooks/billing' ||
    pathname === '/api/webhooks/mercadopago' || PUBLIC_ROUTES.some((route) =>
    pathname.startsWith(route)
  );

  const isPaymentsTest = pathname === '/pagamentos-teste' || pathname.startsWith('/api/payments/test');
  if (isPaymentsTest && (process.env.NODE_ENV === 'production' || process.env.PAYMENTS_TEST_ENABLED !== 'true')) {
    return new NextResponse('Página de teste indisponível.', { status: 404 });
  }

  const isLocalHost = ['localhost', '127.0.0.1', '[::1]'].includes(req.nextUrl.hostname);
  if (isPaymentsTest && isLocalHost && pathname.startsWith('/api/')) return NextResponse.next();

  const token = isPublic ? null : await getToken({ req, secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET, secureCookie: req.nextUrl.protocol === 'https:' });
  if (!token && !isPublic) {
    const loginUrl = new URL('/login', req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)'],
};
