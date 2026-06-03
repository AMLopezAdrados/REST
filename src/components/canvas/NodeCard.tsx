'use client';

import { useEffect } from 'react';
import type { TopicNode } from '@/types/node';
import type { RawEmail } from '@/types/email';
import { statusColors } from '@/styles/tokens';

export type Lod = 'label' | 'compact' | 'detailed' | 'full';

interface NodeCardProps {
  node: TopicNode;
  lod: Lod;
  selected?: boolean;
  onClick: () => void;
  emails?: RawEmail[];
  onEnsureEmails?: (id: string) => void;
}

function daysAgoLabel(ts: number): string {
  const d = Math.max(0, Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24)));
  return d === 0 ? 'Today' : `${d}d ago`;
}

const STATUS_LABEL: Record<string, string> = {
  action: 'Action required',
  ongoing: 'Ongoing',
  saved: 'Saved',
  archive: 'Archive',
};

export function NodeCard({ node, lod, selected, onClick, emails, onEnsureEmails }: NodeCardProps) {
  const color = statusColors[node.status] ?? statusColors.ongoing;

  // Lazily pull in this node's emails only when fully zoomed in.
  useEffect(() => {
    if (lod === 'full' && !emails && onEnsureEmails) onEnsureEmails(node.id);
  }, [lod, emails, onEnsureEmails, node.id]);

  const ring = selected ? 'ring-2 ring-navy' : '';

  // -- LABEL: a tiny chip with just a dot + a few words --------------------
  if (lod === 'label') {
    return (
      <button
        onClick={onClick}
        className={`flex items-center gap-2 bg-white/90 backdrop-blur rounded-full pl-2 pr-3 py-1 shadow-card hover:shadow-cardHover transition-soft ${ring}`}
        style={{ maxWidth: 200 }}
      >
        <span className="shrink-0 w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color.stripe }} />
        <span className="text-sm font-medium text-textDark truncate">{node.title}</span>
      </button>
    );
  }

  // -- COMPACT: small card, pill + title -----------------------------------
  if (lod === 'compact') {
    return (
      <button
        onClick={onClick}
        className={`bg-white rounded-card shadow-card hover:shadow-cardHover p-3 text-left transition-soft border-l-4 ${ring}`}
        style={{ width: 190, borderColor: color.stripe }}
      >
        <div
          className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium mb-1.5"
          style={{ backgroundColor: color.pill, color: color.pillText }}
        >
          {STATUS_LABEL[node.status]}
        </div>
        <h3 className="font-semibold text-sm text-textDark line-clamp-2 leading-snug">{node.title}</h3>
        <div className="mt-1.5 text-[11px] text-textLight">
          {node.email_count} email{node.email_count !== 1 ? 's' : ''} · {daysAgoLabel(node.last_activity)}
        </div>
      </button>
    );
  }

  // -- DETAILED / FULL -----------------------------------------------------
  const isFull = lod === 'full';
  return (
    <button
      onClick={onClick}
      className={`bg-white rounded-card shadow-card hover:shadow-cardHover p-4 text-left transition-soft border-l-4 ${ring}`}
      style={{ width: isFull ? 300 : 250, borderColor: color.stripe }}
    >
      <div className="flex items-center justify-between mb-2">
        <div
          className="inline-block px-3 py-1 rounded-full text-xs font-medium"
          style={{ backgroundColor: color.pill, color: color.pillText }}
        >
          {STATUS_LABEL[node.status]}
        </div>
        {/* Subcategory / sector — surfaces as you zoom in */}
        <span className="text-[11px] text-textLight">
          {node.sector}
          {node.category ? ` · ${node.category}` : ''}
        </span>
      </div>

      <h3 className="font-semibold text-base text-textDark mb-1.5 line-clamp-2 leading-snug">{node.title}</h3>
      <p className="text-sm text-textMid line-clamp-3 mb-2">{node.summary || 'No summary'}</p>

      {isFull && (
        <div className="mt-2 border-t border-border pt-2 space-y-1.5">
          {!emails && <p className="text-[11px] text-textLight italic">Loading messages…</p>}
          {emails && emails.length === 0 && (
            <p className="text-[11px] text-textLight italic">No messages</p>
          )}
          {emails?.slice(0, 6).map((e) => (
            <div key={e.id} className="text-[11px] leading-tight">
              <span className="font-medium text-textDark truncate block">
                {e.subject || '(no subject)'}
              </span>
              <span className="text-textLight truncate block">{e.from_name ?? e.from_email}</span>
            </div>
          ))}
          {emails && emails.length > 6 && (
            <p className="text-[11px] text-textLight">+{emails.length - 6} more — click to open</p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-textLight border-t border-border pt-2 mt-2">
        <span>
          {node.email_count} email{node.email_count !== 1 ? 's' : ''}
        </span>
        <span>{daysAgoLabel(node.last_activity)}</span>
      </div>
    </button>
  );
}
