import NextAuth, { type AuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

// Lazy-load storage so better-sqlite3 only loads when actually needed.
// If the native binding fails, we want the error visible instead of a
// silent process crash during module import.
async function safeUpsertUser(params: Parameters<typeof import('@/lib/storage/queries').upsertUser>[0]) {
  try {
    const { upsertUser } = await import('@/lib/storage/queries');
    return upsertUser(params);
  } catch (err) {
    console.error('[auth] storage import/upsert failed:', err);
    return null;
  }
}

async function safeGetUserByEmail(email: string) {
  try {
    const { getUserByEmail } = await import('@/lib/storage/queries');
    return getUserByEmail(email);
  } catch (err) {
    console.error('[auth] storage import/get failed:', err);
    return null;
  }
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
        const refreshToken = account.refresh_token as string | undefined;
        const accessToken = account.access_token as string | undefined;
        const expiresAt = account.expires_at as number | undefined;

        console.log('[auth] jwt callback:', {
          email,
          hasRefreshToken: !!refreshToken,
          hasAccessToken: !!accessToken,
          expiresAt,
        });

        if (refreshToken) {
          const userId = await safeUpsertUser({
            email,
            refreshToken,
            accessToken: accessToken ?? null,
            tokenExpiry: expiresAt ? expiresAt * 1000 : null,
          });
          if (userId) token.userId = userId;
          console.log('[auth] user upserted:', userId);
        } else {
          const existing = await safeGetUserByEmail(email);
          if (existing) token.userId = existing.id;
          console.log('[auth] no refresh token — using existing user:', existing?.id ?? 'none');
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
  events: {
    async signIn(message) {
      console.log('[auth] signIn event:', message.user?.email);
    },
    async signOut() {
      console.log('[auth] signOut event');
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
