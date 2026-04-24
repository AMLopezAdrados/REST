'use client';

import type { RawEmail } from '@/types/email';

interface EmailCardProps {
  email: RawEmail;
  onClick: () => void;
}

export function EmailCard({ email, onClick }: EmailCardProps) {
  const senderName = email.from_name || email.from_email.split('@')[0];
  const dateStr = new Date(email.received_at).toLocaleDateString();

  return (
    <button
      onClick={onClick}
      className="w-full relative rounded-card bg-white shadow-paper p-4 text-left flex flex-col border border-border/40 hover:shadow-md transition-all group"
    >
      <div className="flex justify-between items-start mb-2">
        <span className="text-[10px] font-bold text-textLight uppercase tracking-widest">{dateStr}</span>
      </div>

      <h3 className="text-sm font-bold text-textDark mb-1 truncate group-hover:text-coral transition-colors">
        {senderName}
      </h3>
      
      <p className="text-xs text-textMid line-clamp-2 leading-relaxed">
        {email.body_plaintext || 'No preview available'}
      </p>
    </button>
  );
}
