import type { Metadata } from 'next';
import { SessionProvider } from 'next-auth/react';
import { getServerSession } from 'next-auth';
import { authOptions } from './api/auth/[...nextauth]/route';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'REST — spatial email',
  description: 'Email has existed for 30 years. Nobody changed it. Until now.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  return (
    <html lang="en">
      <body>
        <SessionProvider session={session}>{children}</SessionProvider>
      </body>
    </html>
  );
}
