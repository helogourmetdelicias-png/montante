import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { loginSchema } from '@/lib/validations/auth';

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
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.tenantId = token.tenantId as string;
        session.user.role = token.role as string;
        session.user.tenantSlug = token.tenantSlug as string;
      }
      return session;
    },
  },
  providers: [
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
        };
      },
    }),
  ],
});
