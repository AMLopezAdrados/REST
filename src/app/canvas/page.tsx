'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Canvas } from '@/components/canvas/Canvas';

export default function CanvasPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/onboarding');
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="w-full h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-textMid">Loading your inbox...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-screen bg-background relative overflow-hidden">
      <Canvas
        onEmailClick={(email) => {
          // Drill into raw email ledger view
          router.push(`/ledger?emailId=${email.id}`);
        }}
      />
    </div>
  );
}
