'use client';

import { useState, useEffect } from 'react';
import type { TopicNode } from '@/types/node';
import type { RawEmail } from '@/types/email';
import { statusColors } from '@/styles/tokens';
import { ReplyComposer } from '@/components/reply/ReplyComposer';

interface NodeDetailPanelProps {
  nodeId: string;
  onClose: () => void;
  onNavigateToLedger: () => void;
}

function getInitials(name: string) {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

export function NodeDetailPanel({ nodeId, onClose, onNavigateToLedger }: NodeDetailPanelProps) {
  const [node, setNode] = useState<TopicNode | null>(null);
  const [relatedNodes, setRelatedNodes] = useState<TopicNode[]>([]);
  const [emails, setEmails] = useState<RawEmail[]>([]);
  const [showReplyComposer, setShowReplyComposer] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [nodesRes, emailsRes] = await Promise.all([
          fetch('/api/nodes'),
          fetch('/api/nodes', { method: 'POST', body: JSON.stringify({ nodeId }) }),
        ]);
        if (nodesRes.ok) {
          const allNodes = await nodesRes.json();
          const n = allNodes.find((x: TopicNode) => x.id === nodeId);
          if (n) {
            setNode(n);
            setRelatedNodes(allNodes.filter((x: TopicNode) => x.sector === n.sector && x.id !== n.id).slice(0, 2));
          }
        }
        if (emailsRes.ok) {
          setEmails(await emailsRes.json());
        }
      } catch (err) {
        console.error('Failed to fetch node detail', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [nodeId]);

  if (loading) return null;
  if (!node) return null;

  const color = statusColors[node.status];
  const primaryEmail = emails[emails.length - 1] || null;
  const senderName = primaryEmail?.from_name || primaryEmail?.from_email || 'System';
  const senderEmail = primaryEmail?.from_email || '';

  return (
    <div className="fixed inset-0 bg-[#F5F0E8]/70 backdrop-blur-sm z-50 animate-fadeIn flex justify-end">
      <div className="w-full max-w-lg bg-cardBg shadow-[0_0_40px_rgba(28,25,23,0.1)] overflow-y-auto animate-slideIn">
        
        {/* Header & Avatar Context */}
        <div className="p-8 pb-4">
          <div className="flex items-center justify-between mb-8">
            <button onClick={onClose} className="text-textMid hover:text-textDark transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
            </button>
            <button className="text-textLight hover:text-textDark">
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z"/></svg>
            </button>
          </div>

          <div className="flex items-center gap-3 mb-6">
             <h1 className="text-[26px] leading-tight font-bold text-textDark tracking-tight">{node.title}</h1>
             <div className="inline-flex px-2.5 py-1 rounded-pill text-[10px] font-bold uppercase tracking-wide self-start mt-1.5"
                  style={{ backgroundColor: color.pill, color: color.pillText }}>
               {node.status}
             </div>
          </div>

          <div className="flex items-center gap-4">
             <div className="w-14 h-14 rounded-full bg-blue text-white flex items-center justify-center text-xl font-bold font-serif shadow-sm">
                {getInitials(senderName)}
             </div>
             <div>
                <h2 className="text-lg font-bold text-textDark leading-tight">{senderName}</h2>
                <p className="text-sm text-textLight">{senderEmail}</p>
             </div>
          </div>
        </div>

        {/* Info Cards Sector */}
        <div className="px-8 pb-8 space-y-5">
           
           {/* SUMMARY CARD */}
           <div className="bg-lightBlue border border-[#D5E6F7] rounded-card p-5">
              <h3 className="text-[11px] font-bold text-[#4A90D9] uppercase tracking-wider mb-2">Summary</h3>
              <p className="text-[15px] leading-relaxed text-textDark">
                 {node.summary || 'Dit is een placeholder samenvatting gegenereerd door REST. Het analyseert de onderliggende email conversatie en distileert direct de kernboodschap zodat je geen lappen tekst hoeft door te ploegen.'}
              </p>
           </div>

           {/* PENDING ACTION CARD */}
           {node.status === 'action' && (
             <div className="bg-lightCoral border border-[#FADACF] rounded-card p-5">
                <h3 className="text-[11px] font-bold text-coral uppercase tracking-wider mb-3">Needs your attention</h3>
                <div className="flex items-start gap-3">
                   <button className="mt-0.5 w-5 h-5 rounded-full border-2 border-coral flex items-center justify-center hover:bg-coral/10 group">
                      <div className="w-2.5 h-2.5 rounded-full bg-coral opacity-0 group-hover:opacity-100 transition-opacity" />
                   </button>
                   <div>
                      <p className="text-[15px] font-medium text-textDark">Reply to {senderName.split(' ')[0]} about the required details</p>
                      <span className="inline-block mt-1.5 px-2 py-0.5 rounded-pill text-[10px] font-bold bg-[#FCE5D9] text-[#C07525]">Waiting on you</span>
                   </div>
                </div>
             </div>
           )}

           {/* CONNECTED NODES CARD */}
           <div className="bg-white border border-border rounded-card p-5 shadow-paper">
              <h3 className="text-[11px] font-bold text-textLight uppercase tracking-wider mb-3">Related to your world</h3>
              <div className="space-y-2 mb-3">
                 {relatedNodes.length > 0 ? relatedNodes.map(rn => (
                    <button key={rn.id} className="w-full text-left p-3 rounded-lg hover:bg-[#F5F0E8] transition-colors border border-border/50 flex justify-between items-center group">
                       <span className="text-sm font-medium text-textDark truncate pr-4">{rn.title}</span>
                       <svg className="w-4 h-4 text-textLight group-hover:text-textDark transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/></svg>
                    </button>
                 )) : (
                    <div className="text-sm text-textLight italic">No mapped connections yet</div>
                 )}
              </div>
              <p className="text-[11px] text-textLight">REST noticed these are connected within {node.sector}</p>
           </div>

           {/* Thread Access */}
           <div className="pt-2 text-center">
              <button onClick={onNavigateToLedger} className="text-[13px] font-medium text-textLight hover:text-textDark transition-colors">
                 View full thread ({emails.length} messages) →
              </button>
           </div>
        </div>

        {/* Footer Actions */}
        <div className="sticky bottom-0 bg-cardBg border-t border-border p-6 flex items-center gap-3">
           <button 
              onClick={() => setShowReplyComposer(true)}
              className="flex-1 bg-[#1A2642] text-white rounded-card py-4 px-4 text-[15px] font-bold flex items-center justify-center gap-2 hover:bg-[#111A2D] shadow-md transition-colors"
           >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
              Draft reply
           </button>
           <button 
              className="flex-1 bg-white text-textDark border border-[#D6D3D1] rounded-card py-4 px-4 text-[15px] font-bold hover:bg-stone-50 transition-colors"
              onClick={onClose}
           >
              Mark done
           </button>
        </div>

        {/* Reply composer modal */}
        {showReplyComposer && primaryEmail && (
          <ReplyComposer
            email={primaryEmail}
            nodeId={nodeId}
            onClose={() => setShowReplyComposer(false)}
          />
        )}
      </div>
    </div>
  );
}
