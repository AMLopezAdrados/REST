'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import type { TopicNode } from '@/types/node';
import { Canvas } from '@/components/canvas/Canvas';
import { NodeDetailPanel } from '@/components/detail/NodeDetailPanel';

export default function CanvasPage() {
  const { status } = useSession();
  const router = useRouter();
  const [nodes, setNodes] = useState<TopicNode[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [focusedTopicId, setFocusedTopicId] = useState<string | null>(null);
  const [focusedEmails, setFocusedEmails] = useState<any[]>([]);
  const [dismissedNodeIds, setDismissedNodeIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const visibleNodes = useMemo(
    () => nodes.filter((node) => !dismissedNodeIds.includes(node.id)),
    [nodes, dismissedNodeIds],
  );

  useEffect(() => {
    async function fetchEmails() {
      if (!focusedTopicId) {
        setFocusedEmails([]);
        return;
      }
      try {
        const res = await fetch('/api/nodes', {
          method: 'POST',
          body: JSON.stringify({ nodeId: focusedTopicId }),
        });
        if (res.ok) {
          const data = await res.json();
          setFocusedEmails(data);
        }
      } catch (err) {
        console.error('Failed to fetch emails', err);
      }
    }
    fetchEmails();
  }, [focusedTopicId]);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/onboarding');
  }, [status, router]);

  useEffect(() => {
    async function fetchNodes() {
      try {
        const res = await fetch('/api/nodes');
        if (res.ok) {
          const data = await res.json();
          setNodes(data);
        }
      } catch (err) {
        console.error('Failed to fetch nodes', err);
      } finally {
        setLoading(false);
      }
    }
    if (status === 'authenticated') fetchNodes();
  }, [status]);

  const handleMarkDone = (nodeId: string) => {
    setDismissedNodeIds((prev) => (prev.includes(nodeId) ? prev : [...prev, nodeId]));
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
    if (focusedTopicId === nodeId) setFocusedTopicId(null);
  };

  if (status === 'loading' || loading) {
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
        nodes={visibleNodes}
        onNodeClick={setSelectedNodeId}
        focusedTopicId={focusedTopicId}
        onFocusedTopicChange={setFocusedTopicId}
        emails={focusedEmails}
        onMarkDone={handleMarkDone}
      />

      {selectedNodeId && (
        <div className="absolute right-0 top-0 bottom-0 z-50">
          <NodeDetailPanel
            nodeId={selectedNodeId}
            onClose={() => setSelectedNodeId(null)}
            onNavigateToLedger={() => {
              setSelectedNodeId(null);
              router.push(`/ledger?nodeId=${selectedNodeId}`);
            }}
          />
        </div>
      )}
    </div>
  );
}
