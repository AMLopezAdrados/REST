'use client';

import { useState, useEffect } from 'react';
import type { TopicNode } from '@/types/node';
import { NodeCard } from './NodeCard';
import { statusColors } from '@/styles/tokens';

interface CanvasProps {
  nodes: TopicNode[];
  onNodeClick: (nodeId: string) => void;
  filter?: 'all' | 'action' | 'ongoing' | 'saved' | 'archive';
}

export function Canvas({ nodes, onNodeClick, filter = 'all' }: CanvasProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const filtered = filter === 'all' ? nodes : nodes.filter((n) => n.status === filter);

  const handleZoom = (factor: number) => {
    setZoom((z) => Math.min(3, Math.max(0.5, z * factor)));
  };

  return (
    <div className="relative w-full h-screen bg-background overflow-hidden">
      {/* Controls */}
      <div className="absolute bottom-6 left-6 z-40 flex gap-2 bg-white rounded-lg shadow-card p-2">
        <button
          onClick={() => handleZoom(0.9)}
          className="px-3 py-2 text-sm text-textMid hover:text-textDark transition-colors"
        >
          −
        </button>
        <span className="px-3 py-2 text-sm text-textMid">{Math.round(zoom * 100)}%</span>
        <button
          onClick={() => handleZoom(1.1)}
          className="px-3 py-2 text-sm text-textMid hover:text-textDark transition-colors"
        >
          +
        </button>
        <button
          onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
          className="px-3 py-2 text-sm text-textMid hover:text-textDark transition-colors"
        >
          Reset
        </button>
      </div>

      {/* Canvas */}
      <div
        className="absolute inset-0 transition-transform"
        style={{
          transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
          transformOrigin: 'center center',
        }}
      >
        {/* Center dot */}
        <div className="absolute left-1/2 top-1/2 w-2 h-2 bg-navy rounded-full transform -translate-x-1/2 -translate-y-1/2 z-30" />

        {/* Nodes */}
        <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2">
          {filtered.map((node) => (
            <div
              key={node.id}
              className="absolute transition-soft node-card"
              style={{
                width: '280px',
                left: `${node.position_x}px`,
                top: `${node.position_y}px`,
                transform: `translate(-50%, -50%) rotate(${((node.position_x + node.position_y) % 30) / 15}deg)`,
              }}
            >
              <NodeCard node={node} onClick={() => onNodeClick(node.id)} />
            </div>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <p className="text-textMid text-lg mb-2">No emails in this view</p>
            <p className="text-textLight">Try a different filter or sync your inbox</p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="absolute top-6 right-6 bg-white rounded-lg shadow-card p-4 max-w-xs">
        <p className="text-sm text-textMid mb-2">
          Showing <span className="font-semibold text-textDark">{filtered.length}</span> of{' '}
          <span className="text-textDark">{nodes.length}</span> topics
        </p>
        <div className="grid grid-cols-2 gap-2 text-xs text-textLight">
          {(['action', 'ongoing', 'saved', 'archive'] as const).map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: statusColors[s].stripe }}
              />
              {s}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
