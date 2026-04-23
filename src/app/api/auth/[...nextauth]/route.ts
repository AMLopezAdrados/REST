import NextAuth, { type AuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { createHash } from 'node:crypto';

// Derive a stable, deterministic userId from the user's email.
// This avoids any database access during the OAuth callback, which
// prevents native-module (better-sqlite3) crashes from killing the process.
function stableUserId(email: string): string {
  const h = createHash('sha256').update(email).digest('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
}

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
        token.userId = stableUserId(email);
        token.email = email;
        if (account.refresh_token) token.refreshToken = account.refresh_token;
        if (account.access_token) token.accessToken = account.access_token;
        if (account.expires_at) token.tokenExpiry = (account.expires_at as number) * 1000;
      }
      return token;
    },
    async session({ session, token }) {
      const s = session as any;
      if (token.userId) s.userId = token.userId;
      if (token.email) session.user = { ...(session.user ?? {}), email: token.email as string };
      if (token.refreshToken) s.refreshToken = token.refreshToken;
      if (token.accessToken) s.accessToken = token.accessToken;
      if (token.tokenExpiry) s.tokenExpiry = token.tokenExpiry;
      return session;
    },
  },
  debug: process.env.NODE_ENV === 'development',
  pages: {
    signIn: '/onboarding',
  },
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
