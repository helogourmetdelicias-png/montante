import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/lib/prisma';
import { pinSchema, verifyOperatorPin } from '@/lib/operators';
import { consumeLoginTicket, FLOW_COOKIE } from '@/lib/security/auth-flow';

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // The application validates the incoming host through its configured deployment URL.
  // Auth.js requires trustHost for self-hosted Next.js deployments such as local `next start`.
  trustHost: true,
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
        token.tenantId = (user as any).tenantId;
        token.role = (user as any).role;
        token.tenantSlug = (user as any).tenantSlug;
        // Only the password provider returns this grant. PIN switching clears it.
        token.isPlatformAdmin = (user as any).isPlatformAdmin === true;
        token.authVersion = (user as any).authVersion ?? 0;
      }
      // Middleware runs at the edge; protected pages and APIs revalidate in Node.js.
      if (token.id && process.env.NEXT_RUNTIME !== 'edge') {
        const current = await prisma.user.findFirst({ where: { id: token.id as string, tenant_id: token.tenantId as string, is_active: true, tenant: { is_active: true } }, select: { role: true, name: true, email: true, is_platform_admin: true, auth_version: true } });
        if (!current) return null;
        if ((token.authVersion ?? 0) !== (current.auth_version ?? 0)) return null;
        token.role = current.role;
        token.name = current.name;
        token.email = current.email;
        token.isPlatformAdmin = token.isPlatformAdmin === true && current.is_platform_admin;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.tenantId = token.tenantId as string;
        session.user.role = token.role as string;
        session.user.tenantSlug = token.tenantSlug as string;
        session.user.isPlatformAdmin = token.isPlatformAdmin === true;
      }
      return session;
    },
  },
  providers: [
    Credentials({
      id: 'operator-pin',
      async authorize(credentials) {
        const current = await auth();
        if (!current?.user?.tenantId || !current.user.id) return null;
        const pin = pinSchema.safeParse(credentials.pin);
        if (!pin.success || typeof credentials.userId !== 'string') return null;
        const user = await verifyOperatorPin(current.user.tenantId, credentials.userId, pin.data);
        if (!user) return null;
        return { id: user.id, name: user.name, email: user.email, tenantId: user.tenant_id, tenantSlug: current.user.tenantSlug, role: user.role, authVersion: user.auth_version };
      },
    }),
    Credentials({
      async authorize(credentials) {
        if (typeof credentials.loginTicket !== 'string') return null;
        const { cookies } = await import('next/headers');
        const flow = (await cookies()).get(FLOW_COOKIE)?.value ?? '';
        const user = await consumeLoginTicket(credentials.loginTicket, flow);
        if (!user) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          tenantId: user.tenant_id,
          tenantSlug: user.tenant.slug,
          role: user.role,
          isPlatformAdmin: user.is_platform_admin,
          authVersion: user.auth_version,
        };
      },
    }),
  ],
});
