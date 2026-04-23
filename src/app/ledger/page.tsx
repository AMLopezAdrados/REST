'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import type { RawEmail } from '@/types/email';
import type { TopicNode } from '@/types/node';
import { Header } from '@/components/shared/Header';

export default function LedgerPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const nodeId = params.get('nodeId');

  const [emails, setEmails] = useState<RawEmail[]>([]);
  const [node, setNode] = useState<TopicNode | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/onboarding');
  }, [status, router]);

  useEffect(() => {
    async function fetch() {
      try {
        if (nodeId) {
          const res = await fetch('/api/nodes', {
            method: 'POST',
            body: JSON.stringify({ nodeId }),
          });
          if (res.ok) {
            setEmails(await res.json());
          }
          const nodesRes = await fetch('/api/nodes');
          if (nodesRes.ok) {
            const nodes = await nodesRes.json();
            const n = nodes.find((x: TopicNode) => x.id === nodeId);
            setNode(n);
          }
        }
      } catch (err) {
        console.error('Failed to fetch', err);
      } finally {
        setLoading(false);
      }
    }
    if (status === 'authenticated') fetch();
  }, [status, nodeId]);

  if (loading) {
    return (
      <div className="w-full h-screen bg-background flex items-center justify-center">
        <p className="text-textMid">Loading emails...</p>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-background">
      <Header title={node?.title || 'Ledger'} showBack onBack={() => router.push('/canvas')} />

      {/* Progress */}
      {node && (
        <div className="bg-white border-b border-border px-6 py-4">
          <p className="text-sm text-textMid">
            <span className="font-semibold text-textDark">{emails.length}</span> emails in thread
          </p>
        </div>
      )}

      {/* Email list */}
      <div className="max-w-3xl mx-auto">
        {emails.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-textMid">No emails</p>
          </div>
        ) : (
          <div className="space-y-2 p-6">
            {emails.map((email, idx) => (
              <div
                key={email.id}
                className="bg-white rounded-card p-4 border-l-4 border-amber hover:shadow-card transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-sm font-semibold text-textDark">
                        {email.from_name || email.from_email.split('@')[0]}
                      </span>
                      <span className="text-xs text-textLight">
                        {new Date(email.received_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-textDark mb-1">{email.subject || '(no subject)'}</p>
                    <p className="text-sm text-textLight line-clamp-2">
                      {email.body_plaintext?.slice(0, 200) || email.body_html?.slice(0, 200) || '(no preview)'}
                    </p>
                  </div>
                  <div className="text-xs text-textLight whitespace-nowrap">
                    {email.consumption_state === 'unseen' && (
                      <span className="inline-block w-2 h-2 bg-coral rounded-full mr-2" />
                    )}
                    {email.consumption_state}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
