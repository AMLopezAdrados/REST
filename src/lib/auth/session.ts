import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';

export async function requireUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return (session as any)?.userId ?? null;
}

export async function requireSession() {
  const session = await getServerSession(authOptions);
  const s = session as any;
  if (!s?.userId) return null;
  return {
    userId: s.userId as string,
    email: session?.user?.email ?? '',
    refreshToken: s.refreshToken as string | undefined,
    accessToken: s.accessToken as string | undefined,
    tokenExpiry: s.tokenExpiry as number | undefined,
  };
}
