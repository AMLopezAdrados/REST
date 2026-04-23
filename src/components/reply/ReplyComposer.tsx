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
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-card max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-lg">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-border p-6 flex items-center justify-between">
          <h2 className="text-cardTitle font-semibold">Draft reply</h2>
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
                      className={`px-3 py-2 rounded-card text-sm font-medium transition-colors ${
                        tone === t
                          ? 'bg-navy text-white'
                          : 'bg-border text-textMid hover:bg-gray-300'
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
                    className="w-full p-4 border-2 border-border rounded-card hover:border-navy hover:bg-lightBlue transition-colors text-left"
                  >
                    <p className="font-semibold text-textDark">Yes / No</p>
                    <p className="text-sm text-textLight">Quick RSVP-style response</p>
                  </button>
                  <button
                    onClick={() => {
                      setIntent('Let me suggest a time');
                      generateReply('suggest_time');
                    }}
                    disabled={generating}
                    className="w-full p-4 border-2 border-border rounded-card hover:border-navy hover:bg-lightBlue transition-colors text-left"
                  >
                    <p className="font-semibold text-textDark">Suggest time</p>
                    <p className="text-sm text-textLight">Propose a meeting time</p>
                  </button>
                  <div className="border-t border-border pt-2">
                    <p className="text-sm text-textLight font-medium mb-2">Or write yourself</p>
                    <input
                      type="text"
                      placeholder="What do you want to say?"
                      value={intent}
                      onChange={(e) => setIntent(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-card text-sm focus:outline-none focus:ring-2 focus:ring-navy"
                    />
                    <button
                      onClick={() => generateReply('custom')}
                      disabled={!intent || generating}
                      className="w-full mt-2 px-4 py-2 bg-navy text-white rounded-card font-medium hover:opacity-90 transition-colors text-sm disabled:opacity-50"
                    >
                      {generating ? 'Generating...' : 'Generate'}
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Compose view */}
              <div>
                <p className="text-sm font-semibold text-textDark mb-2">Your reply</p>
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  className="w-full p-3 border border-border rounded-card text-sm focus:outline-none focus:ring-2 focus:ring-navy"
                  rows={6}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setStep('templates')}
                  className="flex-1 px-4 py-2 bg-border text-textDark rounded-card font-medium hover:bg-gray-300 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={sendReply}
                  disabled={sending}
                  className="flex-1 px-4 py-2 bg-coral text-white rounded-card font-medium hover:opacity-90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Send size={16} />
                  {sending ? 'Sending...' : 'Send'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
