import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { loginSchema } from '@/lib/validations/auth';
import { pinSchema, verifyOperatorPin } from '@/lib/operators';

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
      }
      // Middleware runs at the edge; protected pages and APIs revalidate in Node.js.
      if (token.id && process.env.NEXT_RUNTIME !== 'edge') {
        const current = await prisma.user.findFirst({ where: { id: token.id as string, tenant_id: token.tenantId as string, is_active: true, tenant: { is_active: true } }, select: { role: true, name: true, email: true, is_platform_admin: true } });
        if (!current) return null;
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
        return { id: user.id, name: user.name, email: user.email, tenantId: user.tenant_id, tenantSlug: current.user.tenantSlug, role: user.role };
      },
    }),
    Credentials({
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password, tenantSlug } = parsed.data;

        const tenant = await prisma.tenant.findUnique({
          where: { slug: tenantSlug },
          select: { id: true, slug: true, is_active: true },
        });

        if (!tenant || !tenant.is_active) return null;

        const user = await prisma.user.findFirst({
          where: {
            email: email.toLowerCase(),
            tenant_id: tenant.id,
            is_active: true,
          },
        });

        if (!user || !user.password_hash) return null;

        const passwordMatch = await bcrypt.compare(password, user.password_hash);
        if (!passwordMatch) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          tenantId: user.tenant_id,
          tenantSlug: tenant.slug,
          role: user.role,
          isPlatformAdmin: user.is_platform_admin,
        };
      },
    }),
  ],
});
