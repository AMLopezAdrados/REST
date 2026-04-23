'use client';

import { signOut } from 'next-auth/react';
import { Menu } from 'lucide-react';

interface HeaderProps {
  title?: string;
  showBack?: boolean;
  onBack?: () => void;
}

export function Header({ title = 'REST', showBack, onBack }: HeaderProps) {
  return (
    <header className="bg-white border-b border-border px-6 py-4 flex items-center justify-between sticky top-0 z-50">
      <div className="flex items-center gap-3">
        {showBack && (
          <button onClick={onBack} className="text-textMid hover:text-textDark transition-colors">
            ← Back
          </button>
        )}
        <h1 className="text-sectionHeader font-bold text-navy">{title}</h1>
      </div>
      <button
        onClick={() => signOut({ callbackUrl: '/onboarding' })}
        className="text-textLight hover:text-textMid transition-colors"
        title="Settings"
      >
        <Menu size={24} />
      </button>
    </header>
  );
}
