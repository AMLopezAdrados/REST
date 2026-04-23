'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import type { TopicNode } from '@/types/node';
import { Canvas } from '@/components/canvas/Canvas';
import { Header } from '@/components/shared/Header';
import { NodeDetailPanel } from '@/components/detail/NodeDetailPanel';

export default function CanvasPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [nodes, setNodes] = useState<TopicNode[]>([]);
  const [filter, setFilter] = useState<'all' | 'action' | 'ongoing' | 'saved' | 'archive'>('all');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

      {/* Filter tabs */}
      <div className="flex gap-2 px-6 py-3 bg-white border-b border-border overflow-x-auto">
        {(['all', 'action', 'ongoing', 'saved', 'archive'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
              filter === f
                ? 'bg-navy text-white'
                : 'bg-border text-textMid hover:bg-gray-300'
            }`}
          >
            {f === 'all' && 'All'}
            {f === 'action' && 'Action'}
            {f === 'ongoing' && 'Ongoing'}
            {f === 'saved' && 'Saved'}
            {f === 'archive' && 'Archive'}
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
