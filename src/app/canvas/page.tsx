'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import type { TopicNode } from '@/types/node';
import { Canvas } from '@/components/canvas/Canvas';
import { Header } from '@/components/shared/Header';
import { NodeDetailPanel } from '@/components/detail/NodeDetailPanel';

type Filter = 'all' | 'action' | 'ongoing' | 'saved' | 'archive';

// Turn a full inbox into one calm sentence.
function restLine(nodes: TopicNode[]): string {
  if (nodes.length === 0) return 'Your inbox is empty. Enjoy the quiet.';
  const action = nodes.filter((n) => n.status === 'action').length;
  const ongoing = nodes.filter((n) => n.status === 'ongoing').length;
  const rest = nodes.length - action - ongoing;
  const parts: string[] = [];
  if (action > 0) parts.push(`${action} ${action === 1 ? 'thing needs' : 'things need'} you`);
  if (ongoing > 0) parts.push(`${ongoing} ongoing`);
  if (rest > 0) parts.push(`the rest is at rest`);
  if (action === 0) return `Nothing needs you right now · ${parts.join(' · ') || 'all calm'}`;
  return parts.join(' · ');
}

export default function CanvasPage() {
  const { status } = useSession();
  const router = useRouter();
  const [nodes, setNodes] = useState<TopicNode[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reorganizing, setReorganizing] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/onboarding');
  }, [status, router]);

  const fetchNodes = useCallback(async () => {
    try {
      const res = await fetch('/api/nodes');
      if (res.ok) setNodes(await res.json());
    } catch (err) {
      console.error('Failed to fetch nodes', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') fetchNodes();
  }, [status, fetchNodes]);

  // Re-bundle existing emails into topics (no Gmail fetch / re-classify).
  const reorganize = useCallback(async () => {
    setReorganizing(true);
    try {
      const res = await fetch('/api/sync?mode=regen', { method: 'POST' });
      if (res.ok) await fetchNodes();
    } catch (err) {
      console.error('Reorganize failed', err);
    } finally {
      setReorganizing(false);
    }
  }, [fetchNodes]);

  const summary = useMemo(() => restLine(nodes), [nodes]);

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
    <div className="flex flex-col w-full h-screen bg-background">
      <Header title="REST" />

      {/* Calm status line — the whole inbox in one sentence */}
      <div className="flex items-center justify-between gap-4 px-6 pt-3 pb-1">
        <p className="text-sectionHeader font-semibold text-navy truncate">{summary}</p>
        <button
          onClick={reorganize}
          disabled={reorganizing}
          className="shrink-0 text-sm text-textMid hover:text-navy transition-colors disabled:opacity-50"
          title="Re-bundle your emails into topics"
        >
          {reorganizing ? 'Reorganizing…' : '↻ Reorganize'}
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 px-6 py-3 overflow-x-auto">
        {(['all', 'action', 'ongoing', 'saved', 'archive'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
              filter === f ? 'bg-navy text-white' : 'bg-white text-textMid hover:bg-border/60'
            }`}
          >
            {f === 'all' && 'All'}
            {f === 'action' && 'Needs you'}
            {f === 'ongoing' && 'Ongoing'}
            {f === 'saved' && 'Saved'}
            {f === 'archive' && 'Tucked away'}
          </button>
        ))}
      </div>

      {/* Canvas */}
      <div className="flex-1 relative">
        <Canvas nodes={nodes} onNodeClick={setSelectedNodeId} filter={filter} />
      </div>

      {/* Detail panel */}
      {selectedNodeId && (
        <NodeDetailPanel
          nodeId={selectedNodeId}
          onClose={() => setSelectedNodeId(null)}
          onNavigateToLedger={() => {
            setSelectedNodeId(null);
            router.push(`/ledger?nodeId=${selectedNodeId}`);
          }}
        />
      )}
    </div>
  );
}
