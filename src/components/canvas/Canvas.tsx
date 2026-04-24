import { useState, useMemo, useEffect } from 'react';
import type { TopicNode } from '@/types/node';
import type { RawEmail } from '@/types/email';
import { NodeCard } from './NodeCard';
import { SunCard } from './SunCard';
import { ClusterCard } from './ClusterCard';
import { EmailCard } from './EmailCard';

interface CanvasProps {
  nodes: TopicNode[];
  onNodeClick: (nodeId: string) => void;
  focusedTopicId: string | null;
  onFocusedTopicChange: (id: string | null) => void;
  emails: RawEmail[];
}

export function Canvas({ nodes, onNodeClick, focusedTopicId, onFocusedTopicChange, emails }: CanvasProps) {
  const [filter, setFilter] = useState<'all' | 'action' | 'ongoing' | 'saved' | 'archive'>('all');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [lastPointer, setLastPointer] = useState({ x: 0, y: 0 });

  const filtered = filter === 'all' ? nodes : nodes.filter((n) => n.status === filter);
  const focusedNode = useMemo(() => nodes.find(n => n.id === focusedTopicId), [nodes, focusedTopicId]);

  // Dynamic Semantic Zoom Clustering (Universe Mode)
  const clusters = useMemo(() => {
    if (focusedTopicId) return [];
    const THRESHOLD = 350 / zoom;
    const result: { id: string; x: number; y: number; nodes: TopicNode[]; sector: string }[] = [];
    const sorted = [...filtered].sort((a,b) => b.urgency_score - a.urgency_score);

    sorted.forEach(node => {
      const match = result.find(c => 
        c.sector === node.sector && 
        Math.hypot(c.x - node.position_x, c.y - node.position_y) < THRESHOLD
      );

      if (match) {
        match.x = (match.x * match.nodes.length + node.position_x) / (match.nodes.length + 1);
        match.y = (match.y * match.nodes.length + node.position_y) / (match.nodes.length + 1);
        match.nodes.push(node);
      } else {
        result.push({
          id: `cluster-${node.id}`,
          x: node.position_x,
          y: node.position_y,
          nodes: [node],
          sector: node.sector
        });
      }
    });
    return result;
  }, [filtered, zoom, focusedTopicId]);

  // Logic for the System Mode (Orbiting Emails)
  const emailPositions = useMemo(() => {
    if (!focusedTopicId || emails.length === 0) return [];
    const radius = 400;
    return emails.map((email, i) => {
      const angle = (i / emails.length) * 2 * Math.PI;
      return {
        email,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius
      };
    });
  }, [focusedTopicId, emails]);

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    setLastPointer({ x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - lastPointer.x;
    const dy = e.clientY - lastPointer.y;
    setPan((p) => ({ x: p.x + dx / zoom, y: p.y + dy / zoom }));
    setLastPointer({ x: e.clientX, y: e.clientY });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom((z) => Math.min(5, Math.max(0.1, z * zoomFactor)));
    } else {
      setPan((p) => ({ x: p.x - e.deltaX / zoom, y: p.y - e.deltaY / zoom }));
    }
  };

  const TABS = ['All', 'Action', 'Ongoing', 'Saved', 'Archive'];

  const resetView = () => {
    onFocusedTopicChange(null);
    setPan({ x: 0, y: 0 });
    setZoom(1);
    setFilter('all');
  };

  return (
    <div 
      className={`relative w-full h-screen bg-background overflow-hidden touch-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
    >
      {/* HUD: Navigation Header */}
      <div className="absolute top-0 left-0 right-0 h-16 flex items-center justify-between px-6 z-40" onPointerDown={e => e.stopPropagation()}>
         {/* Logo & Breadcrumb */}
         <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 cursor-pointer" onClick={resetView}>
               <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-leaf"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4c-4.418 0-8 3.582-8 8s3.582 8 8 8 8-3.582 8-8-3.582-8-8-8zM12 4c1.5 0 3 2 3 4s-1.5 4-3 4-3-2-3-4 1.5-4 3-4zM12 12c1.5 0 3 2 3 4s-1.5 4-3 4-3-2-3-4 1.5-4 3-4z" /></svg>
               <span className="font-serif font-medium tracking-wide text-lg text-[#333]">REST</span>
            </div>
            {focusedTopicId && (
               <div className="flex items-center gap-2 text-textLight animate-fadeIn">
                  <span className="opacity-40">/</span>
                  <button onClick={() => onFocusedTopicChange(null)} className="text-sm font-medium hover:text-textDark transition-colors">Universe</button>
                  <span className="opacity-40">/</span>
                  <span className="text-sm font-bold text-textDark truncate max-w-[150px]">{focusedNode?.title}</span>
               </div>
            )}
         </div>

         {/* Tabs (Hidden in Drill-down mode for focus) */}
         {!focusedTopicId && (
            <div className="flex gap-6 animate-fadeIn">
                {TABS.map(tab => {
                const isActive = filter.toLowerCase() === tab.toLowerCase() || (filter === 'all' && tab === 'All');
                return (
                    <button 
                        key={tab} 
                        onClick={() => setFilter(tab.toLowerCase() as any)}
                        className="relative py-2 text-sm font-medium transition-colors"
                    >
                        <span className={isActive ? 'text-textDark' : 'text-textLight hover:text-textMid'}>{tab}</span>
                        {isActive && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-coral rounded-t-full" />}
                    </button>
                )
                })}
            </div>
         )}

         {/* Right icons */}
         <div className="flex items-center gap-4 text-textLight">
            <button className="hover:text-textDark"><svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg></button>
            <div className="w-7 h-7 rounded-full bg-blue text-white flex items-center justify-center font-bold text-xs shadow-sm overflow-hidden"><img src="https://ui-avatars.com/api/?name=User&background=4A90D9&color=fff" /></div>
         </div>
      </div>

      {/* Canvas Layer */}
      <div
        className="absolute inset-0 transition-transform duration-[700ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] will-change-transform"
        style={{
          transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
          transformOrigin: '50% 50%',
        }}
      >
        {/* UNIVERSE MODE */}
        {!focusedTopicId && (
           <>
              <svg className="absolute inset-0 w-[5000px] h-[5000px] pointer-events-none transform -translate-x-1/2 -translate-y-1/2 left-1/2 top-1/2">
                <g transform="translate(2500, 2500)"> 
                    {clusters.map((c) => {
                    if (Math.hypot(c.x, c.y) < 300) return null;
                    return (
                        <path 
                            key={`line-${c.id}`} 
                            d={`M 0 0 Q ${c.x/2} ${c.y/2 + 50} ${c.x} ${c.y}`} 
                            fill="none" 
                            stroke="#D6D3D1" 
                            strokeWidth="1.5" 
                            strokeDasharray="4 4"
                            className="opacity-40 transition-all duration-[600ms]"
                        />
                    )
                    })}
                </g>
              </svg>

              <div className="absolute left-1/2 top-1/2 z-20">
                <SunCard nodes={nodes} onJumpTo={(cat) => { setPan({x:0, y:0}); setFilter(cat as any); }} />
              </div>

              <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2">
                {clusters.map((cluster) => (
                    <div
                    key={cluster.id}
                    className="absolute node-card z-10 w-[290px] transition-all duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
                    style={{
                        left: `${cluster.x}px`,
                        top: `${cluster.y}px`,
                        transform: `translate(-50%, -50%) rotate(${((cluster.x + cluster.y) % 30) / 30}deg)`,
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    >
                    {cluster.nodes.length === 1 ? (
                        <NodeCard node={cluster.nodes[0]} onClick={() => onFocusedTopicChange(cluster.nodes[0].id)} />
                    ) : (
                        <ClusterCard 
                            nodes={cluster.nodes} 
                            onClick={() => {
                                setPan({ x: -cluster.x, y: -cluster.y });
                                setZoom(z => Math.min(3, Math.max(z * 1.5, 1.3))); 
                            }} 
                        />
                    )}
                    </div>
                ))}
              </div>
           </>
        )}

        {/* TOPIC SYSTEM MODE */}
        {focusedTopicId && focusedNode && (
           <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2">
              {/* Central Topic Node (Acting as the new Sun) */}
              <div className="absolute z-30 transition-all duration-700 animate-fadeIn" style={{ left: 0, top: 0, transform: 'translate(-50%, -50%) scale(1.2)' }}>
                 <NodeCard node={focusedNode} onClick={() => {}} />
              </div>

              {/* Orbiting Emails */}
              {emailPositions.map((pos, i) => (
                 <div 
                    key={pos.email.id} 
                    className="absolute z-10 w-[240px] animate-fadeIn transition-all duration-1000"
                    style={{ 
                        left: `${pos.x}px`, 
                        top: `${pos.y}px`, 
                        transform: 'translate(-50%, -50%)',
                        transitionDelay: `${i * 100}ms`
                    }}
                 >
                    <EmailCard email={pos.email} onClick={() => onNodeClick(focusedTopicId)} />
                 </div>
              ))}

              {/* Orbital Lines */}
              <svg className="absolute inset-0 w-[1000px] h-[1000px] pointer-events-none transform -translate-x-1/2 -translate-y-1/2 opacity-20">
                 <circle cx="500" cy="500" r="400" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="5 5" />
              </svg>
           </div>
        )}
      </div>

      {/* HUD: Footer (Search & FAB) - Hidden when focused for pure clarity */}
      {!focusedTopicId && (
        <div className="absolute bottom-6 left-0 right-0 flex justify-center pointer-events-none z-40 animate-fadeIn">
            <div className="relative w-full max-w-lg mx-6 pointer-events-auto">
                <input 
                type="text" 
                placeholder="Search your world"
                className="w-full h-12 bg-cardBg border border-border mt-0 rounded-pill px-12 shadow-paper outline-none focus:ring-2 ring-coral/20 placeholder-textLight/60 text-textDark transition-all"
                />
                <svg className="absolute left-4 top-3.5 w-5 h-5 text-textLight opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            </div>

            <div className="absolute right-6 bottom-0 pointer-events-auto">
                <button className="w-14 h-14 bg-[#1C1A2E] text-white rounded-full flex items-center justify-center shadow-paper hover:-translate-y-0.5 transition-transform">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/></svg>
                </button>
            </div>
        </div>
      )}
      
      {/* Hint */}
      {!focusedTopicId && (
        <div className="absolute left-6 bottom-6 flex items-center gap-2 pointer-events-none opacity-40">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"/></svg>
            <div className="text-xs font-medium text-textDark">Pinch to<br/>zoom out</div>
        </div>
      )}
    </div>
  );
}
