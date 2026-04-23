import NextAuth, { type AuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { upsertUser, getUserByEmail } from '@/lib/storage/queries';

const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
].join(' ');

export const authOptions: AuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: GOOGLE_SCOPES,
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile) {
        const email = (profile as any).email as string;
        const refreshToken = account.refresh_token as string | undefined;
        const accessToken = account.access_token as string | undefined;
        const expiresAt = account.expires_at as number | undefined;

        if (refreshToken) {
          const userId = upsertUser({
            email,
            refreshToken,
            accessToken: accessToken ?? null,
            tokenExpiry: expiresAt ? expiresAt * 1000 : null,
          });
          token.userId = userId;
        } else {
          const existing = getUserByEmail(email);
          if (existing) token.userId = existing.id;
        }
        token.email = email;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId) (session as any).userId = token.userId;
      if (token.email) session.user = { ...(session.user ?? {}), email: token.email as string };
      return session;
    },
  },
  pages: {
    signIn: '/onboarding',
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
