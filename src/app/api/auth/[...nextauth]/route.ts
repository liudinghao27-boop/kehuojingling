import NextAuth from 'next-auth';
import type { User, Session } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: '邮箱', type: 'email' },
        password: { label: '密码', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user) {
          return null;
        }

        const isValid = await bcrypt.compare(credentials.password, user.password);
        if (!isValid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          phone: user.phone,
          plan: user.plan,
          industryContext: user.industryContext,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }: { token: JWT; user: User; trigger?: string; session?: Session }) {
      if (user) {
        token.id = user.id;
        token.name = user.name;
        token.email = user.email;
        token.plan = user.plan;
        token.phone = user.phone;
        token.industryContext = user.industryContext;
      }

      if (trigger === 'update' && session?.user) {
        if (session.user.name !== undefined) token.name = session.user.name;
        if (session.user.email !== undefined) token.email = session.user.email;
        if (session.user.phone !== undefined) token.phone = session.user.phone;
        if (session.user.plan !== undefined) token.plan = session.user.plan;
        if (session.user.industryContext !== undefined) token.industryContext = session.user.industryContext;
        if (session.user.platformCredentials !== undefined) {
          token.platformCredentials = session.user.platformCredentials;
        }
      }

      // 首次生成 token 或 update 触发时，加载用户已配置的平台列表
      if (token.id && !token.platformCredentials) {
        const credentials = await prisma.platformCredential.findMany({
          where: { userId: token.id as string },
          select: { platform: true },
        });
        token.platformCredentials = credentials.map((c) => c.platform);
      }

      return token;
    },
    async session({ session, token }: { session: Session; token: JWT }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.name = token.name as string | null;
        session.user.email = token.email as string;
        session.user.plan = token.plan as string;
        session.user.phone = token.phone as string | null;
        session.user.industryContext = token.industryContext as string | null;
        session.user.platformCredentials = (token.platformCredentials as string[]) || [];
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt' as const,
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
