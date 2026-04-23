'use client';

import { useState, useEffect } from 'react';
import type { TopicNode } from '@/types/node';
import type { RawEmail } from '@/types/email';
import { X } from 'lucide-react';
import { statusColors } from '@/styles/tokens';
import { ReplyComposer } from '@/components/reply/ReplyComposer';

interface NodeDetailPanelProps {
  nodeId: string;
  onClose: () => void;
  onNavigateToLedger: () => void;
}

export function NodeDetailPanel({ nodeId, onClose, onNavigateToLedger }: NodeDetailPanelProps) {
  const [node, setNode] = useState<TopicNode | null>(null);
  const [emails, setEmails] = useState<RawEmail[]>([]);
  const [showReplyComposer, setShowReplyComposer] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [nodesRes, emailsRes] = await Promise.all([
          fetch('/api/nodes'),
          fetch('/api/nodes', { method: 'POST', body: JSON.stringify({ nodeId }) }),
        ]);
        if (nodesRes.ok) {
          const nodes = await nodesRes.json();
          const n = nodes.find((x: TopicNode) => x.id === nodeId);
          setNode(n);
        }
        if (emailsRes.ok) {
          setEmails(await emailsRes.json());
        }
      } catch (err) {
        console.error('Failed to fetch node detail', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [nodeId]);

  if (loading) return null;
  if (!node) return null;

  const color = statusColors[node.status];
  const primaryEmail = emails[emails.length - 1];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-40 animate-fadeIn">
      <div
        className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-lg overflow-y-auto animate-slideIn"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-border p-6 flex items-center justify-between">
          <h2 className="text-cardTitle font-semibold text-textDark">Details</h2>
          <button onClick={onClose} className="text-textLight hover:text-textDark transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Title and status */}
          <div>
            <div
              className="inline-block px-3 py-1 rounded-full text-xs font-medium mb-3"
              style={{ backgroundColor: color.pill, color: color.pillText }}
            >
              {node.status}
            </div>
            <h1 className="text-bigTitle font-bold text-textDark">{node.title}</h1>
            <p className="text-textMid mt-2">{node.summary}</p>
          </div>

          {/* Primary sender */}
          {primaryEmail && (
            <div className="border-l-4 pl-4" style={{ borderColor: color.stripe }}>
              <p className="text-sm text-textLight mb-1">From</p>
              <p className="font-semibold text-textDark">{primaryEmail.from_name || primaryEmail.from_email}</p>
              <p className="text-sm text-textLight">{primaryEmail.from_email}</p>
            </div>
          )}

          {/* Summary card */}
          <div className="bg-lightBlue rounded-card p-4 border border-blue border-opacity-20">
            <p className="text-xs text-textLight font-medium mb-2">Summary</p>
            <p className="text-sm text-textDark">{node.summary || 'No summary available'}</p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-border bg-opacity-30 rounded-card p-3 text-center">
              <p className="text-sm font-semibold text-textDark">{node.email_count}</p>
              <p className="text-xs text-textLight">Emails</p>
            </div>
            <div className="bg-border bg-opacity-30 rounded-card p-3 text-center">
              <p className="text-sm font-semibold text-textDark">{node.sector}</p>
              <p className="text-xs text-textLight">Sector</p>
            </div>
            <div className="bg-border bg-opacity-30 rounded-card p-3 text-center">
              <p className="text-sm font-semibold text-textDark">{Math.round(node.urgency_score * 100)}</p>
              <p className="text-xs text-textLight">Urgency</p>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2 pt-4 border-t border-border">
            <button
              onClick={() => setShowReplyComposer(true)}
              className="w-full px-4 py-3 bg-coral text-white rounded-card font-medium hover:opacity-90 transition-colors text-sm"
            >
              Draft reply
            </button>
            <button
              onClick={onNavigateToLedger}
              className="w-full px-4 py-3 bg-border text-textDark rounded-card font-medium hover:bg-gray-300 transition-colors text-sm"
            >
              View full thread ({node.email_count} emails) →
            </button>
          </div>
        </div>

        {/* Reply composer modal */}
        {showReplyComposer && primaryEmail && (
          <ReplyComposer
            email={primaryEmail}
            nodeId={nodeId}
            onClose={() => setShowReplyComposer(false)}
          />
        )}
      </div>
    </div>
  );
}
