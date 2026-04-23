'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';

export default function OnboardingPage() {
  const { status, data: session } = useSession();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [syncProgress, setSyncProgress] = useState({ status: 'idle', total: 0, processed: 0 });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status === 'authenticated' && step < 4) {
      // Temporary MVP bypass: OAuth works, but /api/sync still touches the
      // SQLite storage layer and can crash in the local Crostini environment.
      // Skip automatic sync so the user can enter the app and test the UI.
      setSyncProgress({ status: 'done', total: 0, processed: 0 });
      setStep(4);
    }
  }, [status, step]);

  useEffect(() => {
    if (step === 3 && syncProgress.status !== 'idle') {
      const timer = setInterval(async () => {
        const res = await fetch('/api/sync');
        if (res.ok) {
          const data = await res.json();
          setSyncProgress(data);
          if (data.status === 'done' || data.status === 'error') {
            setStep(4);
            clearInterval(timer);
          }
        }
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [step, syncProgress.status]);

  const startSync = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setSyncProgress({ status: 'done', total: data.fetched, processed: data.fetched });
        setStep(4);
      }
    } catch (err) {
      console.error('Sync failed', err);
    }
  };

  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-background to-lightBlue flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        {step === 0 && (
          <div className="text-center space-y-6">
            <div className="mb-8">
              <h1 className="text-bigTitle font-bold text-navy mb-2">REST</h1>
              <p className="text-lg text-textMid">Email has existed for 30 years.</p>
              <p className="text-lg text-textMid">Nobody changed it.</p>
              <p className="text-lg text-textMid mb-4">Until now.</p>
            </div>
            <button
              onClick={() => setStep(1)}
              className="w-full px-6 py-3 bg-navy text-white rounded-card font-semibold hover:opacity-90 transition-colors text-lg"
            >
              Get Started
            </button>
            <p className="text-sm text-textLight">
              Your inbox, organized in space. Quiet. Warm. Yours.
            </p>
          </div>
        )}

        {step === 1 && (
          <div className="text-center space-y-6">
            <h2 className="text-sectionHeader font-bold text-navy">Connect Gmail</h2>
            <p className="text-textMid">REST reads your email and learns your patterns.</p>
            <p className="text-sm text-textLight">Privacy-first. We never store your messages.</p>
            <button
              onClick={() => signIn('google')}
              className="w-full px-6 py-3 bg-blue text-white rounded-card font-semibold hover:opacity-90 transition-colors"
            >
              Sign in with Google
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="text-center space-y-6">
            <h2 className="text-sectionHeader font-bold text-navy">Syncing...</h2>
            <div className="space-y-4">
              <div>
                <div className="w-full bg-border rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-navy h-full transition-all"
                    style={{
                      width: `${Math.min(100, (syncProgress.processed / syncProgress.total) * 100 || 0)}%`,
                    }}
                  />
                </div>
                <p className="text-sm text-textMid mt-2">
                  Processing {syncProgress.processed} of {syncProgress.total} emails
                </p>
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="text-center space-y-6">
            <h2 className="text-sectionHeader font-bold text-navy">Welcome</h2>
            <div className="bg-white rounded-card p-6 space-y-4">
              <p className="text-lg font-semibold text-textDark">Your inbox is quieter now.</p>
              <p className="text-textMid">
                {syncProgress.total} emails organized into topics. Ready to explore?
              </p>
            </div>
            <button
              onClick={() => router.push('/canvas')}
              className="w-full px-6 py-3 bg-navy text-white rounded-card font-semibold hover:opacity-90 transition-colors"
            >
              Open Canvas
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
