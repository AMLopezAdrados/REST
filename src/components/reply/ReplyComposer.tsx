'use client';

import { useState } from 'react';
import type { RawEmail } from '@/types/email';
import { X, Send } from 'lucide-react';

interface ReplyComposerProps {
  email: RawEmail;
  nodeId: string;
  onClose: () => void;
}

type Tone = 'professional' | 'friendly' | 'casual';

export function ReplyComposer({ email, nodeId, onClose }: ReplyComposerProps) {
  const [step, setStep] = useState<'templates' | 'compose'>('templates');
  const [tone, setTone] = useState<Tone>('friendly');
  const [intent, setIntent] = useState('');
  const [reply, setReply] = useState('');
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);

  const generateReply = async (template: string) => {
    setGenerating(true);
    try {
      const res = await fetch('/api/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeId,
          intent: template === 'custom' ? intent : template,
          tone,
          template: template === 'yes_no' ? 'yes_no' : template === 'suggest_time' ? 'suggest_time' : undefined,
        }),
      });
      if (res.ok) {
        const { reply: generated } = await res.json();
        setReply(generated);
        setStep('compose');
      }
    } catch (err) {
      console.error('Generation failed', err);
    } finally {
      setGenerating(false);
    }
  };

  const sendReply = async () => {
    setSending(true);
    try {
      await fetch('/api/reply', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailId: email.id, replyText: reply }),
      });
      onClose();
    } catch (err) {
      console.error('Send failed', err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-textDark/10 z-50 flex items-center justify-center p-4">
      <div className="bg-cardBg rounded-card border border-border max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-paper transform translate-y-4">
        {/* Header */}
        <div className="sticky top-0 bg-cardBg p-6 flex items-center justify-between z-10">
          <h2 className="text-sectionHeader font-semibold text-textDark">Draft reply</h2>
          <button onClick={onClose} className="text-textLight hover:text-textDark transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {step === 'templates' ? (
            <>
              {/* Tone selector */}
              <div>
                <p className="text-sm font-semibold text-textDark mb-3">Tone</p>
                <div className="grid grid-cols-3 gap-2">
                  {(['professional', 'friendly', 'casual'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTone(t)}
                      className={`px-3 py-2.5 rounded-card text-sm font-medium transition-colors border ${
                        tone === t
                          ? 'bg-textDark text-white border-textDark'
                          : 'bg-background text-textMid border-border hover:border-textLight'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Templates */}
              <div>
                <p className="text-sm font-semibold text-textDark mb-3">Reply options</p>
                <div className="space-y-2">
                  <button
                    onClick={() => {
                      setIntent('Yes, I agree');
                      generateReply('yes_no');
                    }}
                    disabled={generating}
                    className="w-full p-4 border border-border bg-background rounded-card hover:border-textDark/40 transition-colors text-left"
                  >
                    <p className="font-semibold text-textDark">Yes / No</p>
                    <p className="text-sm text-textLight mt-1">Quick RSVP-style response</p>
                  </button>
                  <button
                    onClick={() => {
                      setIntent('Let me suggest a time');
                      generateReply('suggest_time');
                    }}
                    disabled={generating}
                    className="w-full p-4 border border-border bg-background rounded-card hover:border-textDark/40 transition-colors text-left mt-2"
                  >
                    <p className="font-semibold text-textDark">Suggest time</p>
                    <p className="text-sm text-textLight mt-1">Propose a meeting time</p>
                  </button>
                  <div className="pt-4 mt-2">
                    <p className="text-xs text-textLight font-medium mb-2 uppercase tracking-wide">Or write yourself</p>
                    <input
                      type="text"
                      placeholder="What do you want to say?"
                      value={intent}
                      onChange={(e) => setIntent(e.target.value)}
                      className="w-full px-4 py-3 bg-background border border-border rounded-card text-sm focus:outline-none focus:ring-2 focus:ring-coral/20 placeholder-textLight/60 text-textDark"
                    />
                    <button
                      onClick={() => generateReply('custom')}
                      disabled={!intent || generating}
                      className="w-full mt-3 px-4 py-3 bg-textDark text-white rounded-card font-medium hover:-translate-y-0.5 transition-transform text-sm disabled:opacity-50 disabled:hover:translate-y-0"
                    >
                      {generating ? 'Generating...' : 'Generate AI Reply'}
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Compose view */}
              <div className="animate-fadeIn">
                <p className="text-sm font-semibold text-textDark mb-3">Your reply</p>
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  className="w-full p-4 bg-background border border-border rounded-card text-body focus:outline-none focus:ring-2 focus:ring-coral/20 text-textDark shadow-inner"
                  rows={6}
                />
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setStep('templates')}
                  className="flex-1 px-4 py-3 bg-background border border-border text-textDark rounded-card font-medium hover:bg-border/50 transition-colors text-sm"
                >
                  Back
                </button>
                <button
                  onClick={sendReply}
                  disabled={sending}
                  className="flex-[2] px-4 py-3 bg-blue text-white rounded-card font-medium hover:-translate-y-0.5 transition-transform flex items-center justify-center gap-2 disabled:opacity-50 disabled:hover:translate-y-0 shadow-paper text-sm"
                >
                  <Send size={16} />
                  {sending ? 'Sending...' : 'Send securely'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
