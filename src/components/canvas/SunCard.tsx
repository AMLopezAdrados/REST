'use client';

import type { TopicNode } from '@/types/node';
import { statusColors } from '@/styles/tokens';

interface SunCardProps {
  nodes: TopicNode[];
  onJumpTo: (category: string) => void;
}

export function SunCard({ nodes, onJumpTo }: SunCardProps) {
  const actionItems = nodes.filter(n => n.status === 'action');
  const fyiItems = nodes.filter(n => n.status === 'ongoing' || n.status === 'archive');
  const otherItems = nodes.filter(n => n.status === 'saved');

  return (
    <div className="w-[320px] h-[320px] bg-cardBg rounded-full shadow-paper border border-border/60 flex flex-col items-center justify-center p-8 absolute transform -translate-x-1/2 -translate-y-1/2 z-30 transition-transform hover:scale-105"
         onPointerDown={e => e.stopPropagation()}>
      <h2 className="text-2xl font-bold text-textDark mb-1 font-serif">REST</h2>
      <p className="text-xs text-textLight uppercase tracking-widest font-semibold mb-6">Your Universe</p>
      
      <div className="w-full flex flex-col gap-3">
        <button 
          onClick={() => onJumpTo('action')}
          className="flex items-center justify-between p-3 rounded-card hover:bg-stone-50 transition-colors border border-transparent hover:border-border/50"
        >
          <div className="flex items-center gap-3">
             <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: statusColors.action.stripe }} />
             <span className="text-sm font-semibold text-textDark">Action Required</span>
          </div>
          <span className="text-sm font-bold opacity-80" style={{ color: statusColors.action.stripe }}>{actionItems.length}</span>
        </button>

        <button 
          onClick={() => onJumpTo('fyi')}
          className="flex items-center justify-between p-3 rounded-card hover:bg-stone-50 transition-colors border border-transparent hover:border-border/50"
        >
          <div className="flex items-center gap-3">
             <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: statusColors.ongoing.stripe }} />
             <span className="text-sm font-semibold text-textDark">FYI & Ongoing</span>
          </div>
          <span className="text-sm font-bold opacity-80" style={{ color: statusColors.ongoing.stripe }}>{fyiItems.length}</span>
        </button>

        <button 
          onClick={() => onJumpTo('other')}
          className="flex items-center justify-between p-3 rounded-card hover:bg-stone-50 transition-colors border border-transparent hover:border-border/50"
        >
          <div className="flex items-center gap-3">
             <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: statusColors.saved.stripe }} />
             <span className="text-sm font-semibold text-textDark">Saved / Other</span>
          </div>
          <span className="text-sm font-bold opacity-80" style={{ color: statusColors.saved.stripe }}>{otherItems.length}</span>
        </button>
      </div>
    </div>
  );
}
