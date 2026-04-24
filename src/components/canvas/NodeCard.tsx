'use client';

import type { TopicNode } from '@/types/node';
import { ZOOM_LEVELS } from '@/types/node';
import { statusColors } from '@/styles/tokens';
import { useMemo } from 'react';

interface NodeCardProps {
  node: TopicNode;
  onClick: () => void;
  variant?: 'conversation' | 'topic' | 'cluster' | 'domain';
}

const DOMAIN_EMOJI: Record<string, string> = {
  Work: '💼',
  Personal: '🏠',
  Travel: '✈️',
  Orders: '📦',
  Admin: '📇',
  Other: '✨',
};

export function NodeCard({ node, onClick, variant }: NodeCardProps) {
  const color = statusColors[node.status];
  const daysAgo = Math.max(0, Math.floor((Date.now() - node.last_activity) / (1000 * 60 * 60 * 24)));

  // Infer variant from depth if not provided
  const resolvedVariant: NonNullable<NodeCardProps['variant']> =
    variant ??
    (node.depth === ZOOM_LEVELS.DOMAIN
      ? 'domain'
      : node.depth === ZOOM_LEVELS.CLUSTER
      ? 'cluster'
      : node.depth === ZOOM_LEVELS.TOPIC
      ? 'topic'
      : 'conversation');

  const isAggregate = resolvedVariant !== 'conversation';

  const emojis = ['📄', '✈️', '📦', '🏠', '💳', '📅'];
  const emoji = useMemo(
    () =>
      resolvedVariant === 'domain'
        ? DOMAIN_EMOJI[node.sector] ?? '🌍'
        : emojis[Math.floor(node.id.length % emojis.length)],
    [node.id, node.sector, resolvedVariant, emojis],
  );

  const badgeLabel =
    resolvedVariant === 'domain'
      ? `${node.child_count} clusters`
      : resolvedVariant === 'cluster'
      ? `${node.child_count} topics`
      : resolvedVariant === 'topic'
      ? `${node.child_count} threads`
      : node.status === 'action'
      ? 'Action required'
      : node.status === 'ongoing'
      ? 'Ongoing'
      : node.status === 'saved'
      ? 'Saved'
      : 'Archive';

  const titleClass = isAggregate
    ? 'text-[17px] font-serif font-semibold text-textDark mb-1 line-clamp-2 leading-tight'
    : 'text-cardTitle text-textDark mb-1 line-clamp-2';

  const summary = isAggregate ? node.aggregate_summary || node.summary : node.summary;

  return (
    <button
      onClick={onClick}
      className="w-full relative rounded-card bg-cardBg shadow-paper p-5 pl-6 text-left flex flex-col h-full border border-border/40 hover:shadow-md hover:-translate-y-0.5 transition-all"
    >
      {/* Left stripe */}
      <div
        className="absolute top-0 bottom-0 left-0 w-1 rounded-l-card"
        style={{ backgroundColor: color.stripe }}
      />

      {/* Header */}
      <div className="flex justify-between items-start mb-2">
        <div
          className="inline-flex px-2 py-0.5 rounded-pill text-[10px] font-bold uppercase tracking-wide"
          style={{ backgroundColor: color.pill, color: color.pillText }}
        >
          {badgeLabel}
        </div>
        {isAggregate && node.child_count > 0 && (
          <div className="text-[10px] font-semibold text-textLight">
            {node.email_count} emails
          </div>
        )}
      </div>

      <div className="flex-1 mt-1">
        {/* Title */}
        <h3 className={titleClass}>
          {node.title} <span className="inline-block ml-1 opacity-80">{emoji}</span>
        </h3>

        {/* Subtitle / Context */}
        {!isAggregate && (
          <div className="text-[13px] text-textLight font-medium mb-3 truncate">
            {node.participants && node.participants.length > 0
              ? node.participants.map((p) => p.split(' ')[0]).join(', ')
              : node.category
              ? node.category.charAt(0).toUpperCase() + node.category.slice(1)
              : 'Email Thread'}
          </div>
        )}

        {/* Summary line */}
        <div className="text-[14px] text-textDark leading-snug line-clamp-2 mb-4">
          {summary || 'Open to see context'}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-3">
        {!isAggregate && node.status === 'action' && (
          <div className="flex items-center bg-coral text-white text-[11px] font-semibold px-2 py-0.5 rounded-md shadow-sm">
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Due in 2 days</span>
          </div>
        )}
        {(isAggregate || node.status !== 'action') && (
          <div className="text-[11px] font-medium text-textLight flex items-center gap-1">
            <span>{daysAgo === 0 ? 'Today' : `${daysAgo}d ago`}</span>
            {isAggregate && (
              <>
                <span className="opacity-40">·</span>
                <span>Click to zoom in</span>
              </>
            )}
          </div>
        )}
      </div>
    </button>
  );
}
