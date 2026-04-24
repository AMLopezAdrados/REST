'use client';

import type { TopicNode } from '@/types/node';
import { statusColors } from '@/styles/tokens';

interface SunCardProps {
  nodes: TopicNode[];
  onJumpTo: (category: string) => void;
}

export function SunCard({ nodes, onJumpTo }: SunCardProps) {
  const quickWins = nodes.filter(
    (n) => n.status === 'action' && !n.low_value && (n.effort_label === '30 sec' || n.effort_label === '1 min' || n.effort_label === '2 min')
  );
  const doNow = nodes.filter((n) => n.status === 'action' && !n.low_value);
  const track = nodes.filter((n) => n.is_tracking_only);
  const keep = nodes.filter((n) => n.status === 'saved' && !n.low_value);
  const ignore = nodes.filter((n) => n.low_value || n.status === 'archive');

  return (
    <div className="w-[340px] min-h-[340px] bg-cardBg rounded-full shadow-paper border border-border/60 flex flex-col items-center justify-center p-8 absolute transform -translate-x-1/2 -translate-y-1/2 z-30 transition-transform hover:scale-105"
         onPointerDown={(e) => e.stopPropagation()}>
      <h2 className="text-2xl font-bold text-textDark mb-1 font-serif">REST</h2>
      <p className="text-xs text-textLight uppercase tracking-widest font-semibold mb-3">Your Universe</p>
      <p className="text-[11px] text-textMid text-center mb-5 max-w-[210px]">
        Focus on the smallest actions that free the most attention.
      </p>

      <div className="w-full flex flex-col gap-2.5">
        <button
          onClick={() => onJumpTo('action')}
          className="flex items-center justify-between p-2.5 rounded-card hover:bg-stone-50 transition-colors border border-transparent hover:border-border/50"
        >
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: statusColors.action.stripe }} />
            <span className="text-sm font-semibold text-textDark">Do now</span>
          </div>
          <span className="text-sm font-bold opacity-80" style={{ color: statusColors.action.stripe }}>{doNow.length}</span>
        </button>

        <div className="flex items-center justify-between px-2 py-1 text-[11px] text-textLight">
          <span>Quick wins under 2 min</span>
          <span className="font-semibold text-textDark">{quickWins.length}</span>
        </div>

        <button
          onClick={() => onJumpTo('ongoing')}
          className="flex items-center justify-between p-2.5 rounded-card hover:bg-stone-50 transition-colors border border-transparent hover:border-border/50"
        >
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: statusColors.ongoing.stripe }} />
            <span className="text-sm font-semibold text-textDark">Track</span>
          </div>
          <span className="text-sm font-bold opacity-80" style={{ color: statusColors.ongoing.stripe }}>{track.length}</span>
        </button>

        <button
          onClick={() => onJumpTo('saved')}
          className="flex items-center justify-between p-2.5 rounded-card hover:bg-stone-50 transition-colors border border-transparent hover:border-border/50"
        >
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: statusColors.saved.stripe }} />
            <span className="text-sm font-semibold text-textDark">Keep</span>
          </div>
          <span className="text-sm font-bold opacity-80" style={{ color: statusColors.saved.stripe }}>{keep.length}</span>
        </button>

        <button
          onClick={() => onJumpTo('archive')}
          className="flex items-center justify-between p-2.5 rounded-card hover:bg-stone-50 transition-colors border border-transparent hover:border-border/50"
        >
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: statusColors.archive.stripe }} />
            <span className="text-sm font-semibold text-textDark">Ignore safely</span>
          </div>
          <span className="text-sm font-bold opacity-80" style={{ color: statusColors.archive.stripe }}>{ignore.length}</span>
        </button>
      </div>
    </div>
  );
}
