'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import type { TopicNode } from '@/types/node';
import { Canvas } from '@/components/canvas/Canvas';
import { NodeDetailPanel } from '@/components/detail/NodeDetailPanel';

type NodeActionState = 'active' | 'done' | 'waiting' | 'snoozed';

interface PersistedNodeAction {
  state: Exclude<NodeActionState, 'active'>;
  snoozeUntil?: number;
  updatedAt: number;
}

const STORAGE_KEY = 'rest-node-actions-v1';

export default function CanvasPage() {
  const { status } = useSession();
  const router = useRouter();
  const [nodes, setNodes] = useState<TopicNode[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [focusedTopicId, setFocusedTopicId] = useState<string | null>(null);
  const [focusedEmails, setFocusedEmails] = useState<any[]>([]);
  const [nodeActions, setNodeActions] = useState<Record<string, PersistedNodeAction>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, PersistedNodeAction>;
      const now = Date.now();
      const cleaned = Object.fromEntries(
        Object.entries(parsed).filter(([, value]) => !(value.state === 'snoozed' && (value.snoozeUntil || 0) <= now)),
      );
      setNodeActions(cleaned);
    } catch (err) {
      console.error('Failed to restore node action state', err);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nodeActions));
    } catch (err) {
      console.error('Failed to persist node action state', err);
    }
  }, [nodeActions]);

  const visibleNodes = useMemo(
    () => nodes.filter((node) => nodeActions[node.id]?.state !== 'done'),
    [nodes, nodeActions],
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

  const setNodeAction = (nodeId: string, action: PersistedNodeAction | null) => {
    setNodeActions((prev) => {
      const next = { ...prev };
      if (action) next[nodeId] = action;
      else delete next[nodeId];
      return next;
    });
    if (selectedNodeId === nodeId && action?.state === 'done') setSelectedNodeId(null);
    if (focusedTopicId === nodeId && action?.state === 'done') setFocusedTopicId(null);
  };

  const handleMarkDone = (nodeId: string) => {
    setNodeAction(nodeId, { state: 'done', updatedAt: Date.now() });
  };

  const handleMarkWaiting = (nodeId: string) => {
    setNodeAction(nodeId, { state: 'waiting', updatedAt: Date.now() });
  };

  const handleSnooze = (nodeId: string) => {
    const tomorrow = Date.now() + 24 * 60 * 60 * 1000;
    setNodeAction(nodeId, { state: 'snoozed', snoozeUntil: tomorrow, updatedAt: Date.now() });
  };

  const handleReactivate = (nodeId: string) => {
    setNodeAction(nodeId, null);
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
        nodeActions={nodeActions}
        onNodeClick={setSelectedNodeId}
        focusedTopicId={focusedTopicId}
        onFocusedTopicChange={setFocusedTopicId}
        emails={focusedEmails}
        onMarkDone={handleMarkDone}
        onMarkWaiting={handleMarkWaiting}
        onSnooze={handleSnooze}
        onReactivate={handleReactivate}
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
