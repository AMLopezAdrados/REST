'use client';

import type { TopicNode } from '@/types/node';
import { statusColors } from '@/styles/tokens';

interface ClusterCardProps {
  nodes: TopicNode[];
  onClick: () => void;
}

export function ClusterCard({ nodes, onClick }: ClusterCardProps) {
  const actionable = nodes.filter((n) => n.status === 'action' && !n.low_value).length;
  const tracking = nodes.filter((n) => n.is_tracking_only).length;
  const lowValue = nodes.filter((n) => n.low_value).length;
  const statusCounts = nodes.reduce((acc, curr) => {
    acc[curr.status] = (acc[curr.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const dominantStatus = statusCounts['action']
    ? 'action'
    : statusCounts['ongoing']
    ? 'ongoing'
    : statusCounts['saved']
    ? 'saved'
    : 'archive';
  const color = statusColors[dominantStatus];

  return (
    <button
      onClick={onClick}
      className="w-full relative rounded-card bg-cardBg shadow-paper p-5 pl-6 text-left flex flex-col h-full border border-border/40 hover:shadow-md transition-shadow"
    >
      <div className="absolute -top-1 -left-1 -right-1 -bottom-1 bg-white border border-border/40 rounded-card -z-10 opacity-60 transform rotate-1" />
      <div className="absolute -top-2 -left-2 -right-2 -bottom-2 bg-white border border-border/30 rounded-card -z-20 opacity-30 transform -rotate-1" />

      <div
        className="absolute top-0 bottom-0 left-0 w-1 rounded-l-card"
        style={{ backgroundColor: color.stripe }}
      />

      <div className="flex justify-between items-start mb-3 gap-3">
        <div
          className="inline-flex px-2 py-0.5 rounded-pill text-[10px] font-bold uppercase tracking-wide"
          style={{ backgroundColor: color.pill, color: color.pillText }}
        >
          {nodes.length} cards in this area
        </div>
        <div className="text-[10px] font-semibold text-textLight shrink-0">{nodes[0].sector}</div>
      </div>

      <div className="flex-1 mt-1">
        <h3 className="text-cardTitle text-textDark mb-2 line-clamp-1">
          {nodes[0].sector} constellation
        </h3>

        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="rounded-xl bg-stone-50 border border-border/40 px-2 py-2">
            <div className="text-[10px] uppercase tracking-wide text-textLight font-bold">Do now</div>
            <div className="text-sm font-semibold text-textDark mt-1">{actionable}</div>
          </div>
          <div className="rounded-xl bg-stone-50 border border-border/40 px-2 py-2">
            <div className="text-[10px] uppercase tracking-wide text-textLight font-bold">Track</div>
            <div className="text-sm font-semibold text-textDark mt-1">{tracking}</div>
          </div>
          <div className="rounded-xl bg-stone-50 border border-border/40 px-2 py-2">
            <div className="text-[10px] uppercase tracking-wide text-textLight font-bold">Ignore</div>
            <div className="text-sm font-semibold text-textDark mt-1">{lowValue}</div>
          </div>
        </div>

        <div className="space-y-1">
          {nodes.slice(0, 3).map((n) => (
            <div key={n.id} className="text-[13px] text-textLight flex items-center gap-1.5 truncate">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColors[n.status].stripe }} />
              <span className="truncate">{n.title}</span>
            </div>
          ))}
          {nodes.length > 3 && (
            <div className="text-[12px] text-textLight italic mt-1 pl-3">
              + {nodes.length - 3} more in this area
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
