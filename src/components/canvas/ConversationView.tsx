'use client';

import type { TopicNode } from '@/types/node';
import type { RawEmail } from '@/types/email';
import { NodeCard } from './NodeCard';
import { EmailCard } from './EmailCard';

interface ConversationViewProps {
  conversation: TopicNode;
  emails: RawEmail[];
  onEmailClick: (email: RawEmail) => void;
}

export function ConversationView({ conversation, emails, onEmailClick }: ConversationViewProps) {
  const radius = 400;
  const positioned = emails.map((email, i) => {
    const angle = (i / Math.max(emails.length, 1)) * 2 * Math.PI - Math.PI / 2;
    return {
      email,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  });

  return (
    <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2">
      {/* Central conversation node */}
      <div
        className="absolute z-30 w-[320px] animate-fadeIn"
        style={{ left: 0, top: 0, transform: 'translate(-50%, -50%) scale(1.1)' }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <NodeCard node={conversation} onClick={() => {}} variant="conversation" />
      </div>

      {/* Orbital ring */}
      <svg
        className="absolute pointer-events-none opacity-20"
        style={{ left: '-500px', top: '-500px', width: '1000px', height: '1000px' }}
      >
        <circle cx="500" cy="500" r={radius} fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="5 5" />
      </svg>

      {/* Orbiting emails */}
      {positioned.map((pos, i) => (
        <div
          key={pos.email.id}
          className="absolute z-10 w-[240px] animate-fadeIn transition-all duration-1000"
          style={{
            left: `${pos.x}px`,
            top: `${pos.y}px`,
            transform: 'translate(-50%, -50%)',
            transitionDelay: `${i * 100}ms`,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <EmailCard email={pos.email} onClick={() => onEmailClick(pos.email)} />
        </div>
      ))}

      {emails.length === 0 && (
        <div
          className="absolute text-textLight text-sm italic"
          style={{ left: 0, top: '200px', transform: 'translateX(-50%)' }}
        >
          Loading emails...
        </div>
      )}
    </div>
  );
}
