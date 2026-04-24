'use client';

import type { TopicNode } from '@/types/node';
import { statusColors } from '@/styles/tokens';
import { useMemo } from 'react';

interface NodeCardProps {
  node: TopicNode;
  onClick: () => void;
  onMarkDone?: () => void;
}

const ACTION_LABELS: Record<string, string> = {
  reply: 'Reply',
  review: 'Review',
  pay: 'Pay',
  upload: 'Upload',
  schedule: 'Schedule',
  confirm: 'Confirm',
  track: 'Track',
  read: 'Review',
  ignore: 'Ignore',
};

const DOMAIN_EMOJI: Record<string, string> = {
  Work: '💼',
  Personal: '🏠',
  Travel: '✈️',
  Orders: '📦',
  Admin: '📇',
  Other: '✨',
};

export function NodeCard({ node, onClick, onMarkDone }: NodeCardProps) {
  const color = statusColors[node.status];
  const daysAgo = Math.max(0, Math.floor((Date.now() - node.last_activity) / (1000 * 60 * 60 * 24)));
  const emoji = useMemo(() => DOMAIN_EMOJI[node.sector] ?? '📄', [node.sector]);
  const actionLabel = node.action_type ? ACTION_LABELS[node.action_type] : null;

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className="w-full relative rounded-card bg-cardBg shadow-paper p-5 pl-6 text-left flex flex-col h-full border border-border/40 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer"
    >
      <div
        className="absolute top-0 bottom-0 left-0 w-1 rounded-l-card"
        style={{ backgroundColor: color.stripe }}
      />

      <div className="flex justify-between items-start gap-3 mb-2">
        <div className="flex flex-wrap gap-2">
          <div
            className="inline-flex px-2 py-0.5 rounded-pill text-[10px] font-bold uppercase tracking-wide"
            style={{ backgroundColor: color.pill, color: color.pillText }}
          >
            {node.low_value
              ? 'Low value'
              : node.status === 'action'
              ? 'Do now'
              : node.is_tracking_only
              ? 'Track'
              : node.status === 'saved'
              ? 'Keep'
              : 'Reference'}
          </div>
          {actionLabel && !node.low_value && (
            <div className="inline-flex px-2 py-0.5 rounded-pill text-[10px] font-bold uppercase tracking-wide bg-stone-100 text-stone-700">
              {actionLabel}
            </div>
          )}
          {node.effort_label && (
            <div className="inline-flex px-2 py-0.5 rounded-pill text-[10px] font-semibold uppercase tracking-wide bg-white border border-border/60 text-textLight">
              {node.effort_label}
            </div>
          )}
        </div>
        <div className="text-[10px] font-semibold text-textLight shrink-0">{node.email_count} emails</div>
      </div>

      <div className="flex-1 mt-1">
        <h3 className="text-cardTitle text-textDark mb-1 line-clamp-2">
          {node.title} <span className="inline-block ml-1 opacity-80">{emoji}</span>
        </h3>

        <div className="text-[13px] text-textLight font-medium mb-2 truncate">
          {node.source_label || (node.participants && node.participants.length > 0
            ? node.participants.map((p) => p.split(' ')[0]).join(', ')
            : node.category
            ? node.category.charAt(0).toUpperCase() + node.category.slice(1)
            : 'Email Thread')}
        </div>

        <div className="text-[14px] text-textDark leading-snug line-clamp-2 mb-3">
          {node.summary || 'Open to see context'}
        </div>

        {node.why_it_matters && (
          <div className="text-[12px] text-textMid leading-snug mb-4 bg-stone-50 rounded-xl px-3 py-2 border border-border/40">
            <span className="font-semibold text-textDark">Why:</span> {node.why_it_matters}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 mt-auto">
        <div className="text-[11px] font-medium text-textLight flex items-center gap-1 flex-wrap">
          <span>{daysAgo === 0 ? 'Today' : `${daysAgo}d ago`}</span>
          <span className="opacity-40">·</span>
          <span>{node.status === 'action' ? 'Worth doing now' : node.low_value ? 'Safe to ignore' : 'No rush'}</span>
        </div>

        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {node.primary_cta_url && node.primary_cta_label && (
            <a
              href={node.primary_cta_url}
              target={node.primary_cta_url.startsWith('http') ? '_blank' : undefined}
              rel={node.primary_cta_url.startsWith('http') ? 'noreferrer' : undefined}
              className="inline-flex items-center px-3 py-1.5 rounded-pill bg-[#1C1A2E] text-white text-[11px] font-semibold hover:opacity-90 transition-opacity"
            >
              {node.primary_cta_label}
            </a>
          )}
          {onMarkDone && (
            <button
              type="button"
              onClick={onMarkDone}
              className="inline-flex items-center px-3 py-1.5 rounded-pill border border-border text-[11px] font-semibold text-textDark hover:bg-stone-50 transition-colors"
            >
              {node.low_value ? 'Hide' : 'Done'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
