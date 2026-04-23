'use client';

import type { TopicNode } from '@/types/node';
import { statusColors } from '@/styles/tokens';

interface NodeCardProps {
  node: TopicNode;
  onClick: () => void;
}

export function NodeCard({ node, onClick }: NodeCardProps) {
  const color = statusColors[node.status];
  const daysAgo = Math.max(0, Math.floor((Date.now() - node.last_activity) / (1000 * 60 * 60 * 24)));

  return (
    <button
      onClick={onClick}
      className="w-full bg-white rounded-card shadow-card hover:shadow-cardHover p-5 text-left transition-soft border-l-4 h-full"
      style={{ borderColor: color.stripe }}
    >
      {/* Status pill */}
      <div
        className="inline-block px-3 py-1 rounded-full text-xs font-medium mb-3"
        style={{ backgroundColor: color.pill, color: color.pillText }}
      >
        {node.status === 'action' && 'Action required'}
        {node.status === 'ongoing' && 'Ongoing'}
        {node.status === 'saved' && 'Saved'}
        {node.status === 'archive' && 'Archive'}
      </div>

      {/* Title */}
      <h3 className="font-semibold text-lg text-textDark mb-2 line-clamp-2">{node.title}</h3>

      {/* Summary */}
      <p className="text-sm text-textMid line-clamp-2 mb-3">{node.summary || 'No summary'}</p>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-textLight border-t border-border pt-3">
        <span>{node.email_count} email{node.email_count !== 1 ? 's' : ''}</span>
        <span>{daysAgo === 0 ? 'Today' : `${daysAgo}d ago`}</span>
      </div>
    </button>
  );
}
