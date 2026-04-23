import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function requireUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const userId = (session as any)?.userId as string | undefined;
  return userId ?? null;
}
