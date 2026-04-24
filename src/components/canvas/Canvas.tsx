'use client';

import { useState, useEffect, useMemo } from 'react';
import type { TopicNode, ZoomLevel } from '@/types/node';
import { ZOOM_LEVELS } from '@/types/node';
import type { RawEmail } from '@/types/email';
import { useZoomState } from '@/lib/zoom-state';
import { UniverseView } from './UniverseView';
import { HierarchyLevelView } from './HierarchyLevelView';
import { ConversationView } from './ConversationView';

interface CanvasProps {
  onEmailClick: (email: RawEmail) => void;
}

export function Canvas({ onEmailClick }: CanvasProps) {
  const { currentZoom, path, zoomIn, zoomOut, jumpToSegment, resetZoom, initUniverse } = useZoomState();

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [lastPointer, setLastPointer] = useState({ x: 0, y: 0 });

  // Current parent id (what we're zoomed into). null at root.
  const currentParent = path.length > 0 ? path[path.length - 1] : null;

  // Fetch nodes under current parent
  const [currentNode, setCurrentNode] = useState<TopicNode | null>(null);
  const [children, setChildren] = useState<TopicNode[]>([]);
  const [emails, setEmails] = useState<RawEmail[]>([]);
  const [universeNode, setUniverseNode] = useState<TopicNode | null>(null);
  const [loadingFrame, setLoadingFrame] = useState(false);

  // Load universe once
  useEffect(() => {
    let cancelled = false;
    async function loadUniverse() {
      const res = await fetch(`/api/nodes?depth=${ZOOM_LEVELS.UNIVERSE}`);
      if (!res.ok) return;
      const list: TopicNode[] = await res.json();
      if (cancelled) return;
      const uni = list[0] ?? null;
      setUniverseNode(uni);
      if (uni) initUniverse(uni);
    }
    loadUniverse();
    return () => {
      cancelled = true;
    };
  }, [initUniverse]);

  // Load the frame for current zoom/parent
  useEffect(() => {
    let cancelled = false;
    async function loadFrame() {
      setLoadingFrame(true);
      try {
        if (currentZoom === ZOOM_LEVELS.UNIVERSE) {
          // Show domains (children of universe)
          const parentId = universeNode?.id ?? '';
          const res = await fetch(`/api/nodes?parent=${encodeURIComponent(parentId)}`);
          const data: TopicNode[] = res.ok ? await res.json() : [];
          if (cancelled) return;
          setCurrentNode(universeNode);
          setChildren(data);
          setEmails([]);
          return;
        }

        if (!currentParent) return;

        // For CONVERSATION level, fetch emails instead of children
        if (currentZoom === ZOOM_LEVELS.CONVERSATION) {
          const [nodeRes, emailRes] = await Promise.all([
            fetch(`/api/nodes?id=${encodeURIComponent(currentParent.id)}`),
            fetch(`/api/nodes`, {
              method: 'POST',
              body: JSON.stringify({ nodeId: currentParent.id }),
            }),
          ]);
          const nodeData: TopicNode | null = nodeRes.ok ? await nodeRes.json() : null;
          const emailData: RawEmail[] = emailRes.ok ? await emailRes.json() : [];
          if (cancelled) return;
          setCurrentNode(nodeData);
          setChildren([]);
          setEmails(emailData);
          return;
        }

        // Intermediate levels (Domain/Cluster/Topic) — fetch node + children
        const [nodeRes, childRes] = await Promise.all([
          fetch(`/api/nodes?id=${encodeURIComponent(currentParent.id)}`),
          fetch(`/api/nodes?parent=${encodeURIComponent(currentParent.id)}`),
        ]);
        const nodeData: TopicNode | null = nodeRes.ok ? await nodeRes.json() : null;
        const childData: TopicNode[] = childRes.ok ? await childRes.json() : [];
        if (cancelled) return;
        setCurrentNode(nodeData);
        setChildren(childData);
        setEmails([]);
      } finally {
        if (!cancelled) setLoadingFrame(false);
      }
    }
    loadFrame();
    return () => {
      cancelled = true;
    };
  }, [currentZoom, currentParent?.id, universeNode?.id]);

  // Reset pan on level change for clean transitions
  useEffect(() => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
  }, [currentZoom, currentParent?.id]);

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

  const levelLabel = useMemo(() => {
    switch (currentZoom) {
      case ZOOM_LEVELS.UNIVERSE:
        return 'Your Universe';
      case ZOOM_LEVELS.DOMAIN:
        return 'Domain';
      case ZOOM_LEVELS.CLUSTER:
        return 'Cluster';
      case ZOOM_LEVELS.TOPIC:
        return 'Topic';
      case ZOOM_LEVELS.CONVERSATION:
        return 'Conversation';
      default:
        return '';
    }
  }, [currentZoom]);

  return (
    <div
      className={`relative w-full h-screen bg-background overflow-hidden touch-none ${
        isDragging ? 'cursor-grabbing' : 'cursor-grab'
      }`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
    >
      {/* HUD */}
      <div
        className="absolute top-0 left-0 right-0 h-16 flex items-center justify-between px-6 z-40"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 cursor-pointer" onClick={resetZoom}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              className="text-leaf"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 4c-4.418 0-8 3.582-8 8s3.582 8 8 8 8-3.582 8-8-3.582-8-8-8zM12 4c1.5 0 3 2 3 4s-1.5 4-3 4-3-2-3-4 1.5-4 3-4zM12 12c1.5 0 3 2 3 4s-1.5 4-3 4-3-2-3-4 1.5-4 3-4z"
              />
            </svg>
            <span className="font-serif font-medium tracking-wide text-lg text-[#333]">REST</span>
          </div>

          {/* Breadcrumb trail */}
          {path.length > 0 && (
            <div className="flex items-center gap-1.5 text-sm animate-fadeIn">
              {path.map((seg, idx) => {
                const isLast = idx === path.length - 1;
                return (
                  <div key={seg.id} className="flex items-center gap-1.5">
                    <span className="opacity-40">/</span>
                    <button
                      onClick={() => jumpToSegment(seg.id)}
                      className={`transition-colors ${
                        isLast ? 'font-bold text-textDark' : 'font-medium text-textLight hover:text-textDark'
                      } truncate max-w-[140px]`}
                      disabled={isLast}
                    >
                      {seg.title}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Level indicator */}
        <div className="text-[11px] uppercase tracking-widest text-textLight font-semibold">
          {levelLabel}
        </div>

        <div className="flex items-center gap-4 text-textLight">
          {currentZoom !== ZOOM_LEVELS.UNIVERSE && (
            <button
              onClick={() => zoomOut()}
              className="text-sm font-medium hover:text-textDark transition-colors flex items-center gap-1"
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
          )}
          <div className="w-7 h-7 rounded-full bg-blue text-white flex items-center justify-center font-bold text-xs shadow-sm overflow-hidden">
            <img src="https://ui-avatars.com/api/?name=User&background=4A90D9&color=fff" alt="" />
          </div>
        </div>
      </div>

      {/* Canvas transform layer */}
      <div
        className="absolute inset-0 transition-transform duration-[700ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] will-change-transform"
        style={{
          transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
          transformOrigin: '50% 50%',
        }}
      >
        {/* UNIVERSE */}
        {currentZoom === ZOOM_LEVELS.UNIVERSE && (
          <UniverseView
            universe={universeNode}
            domains={children}
            onDomainClick={(d) => zoomIn(d)}
          />
        )}

        {/* DOMAIN / CLUSTER / TOPIC — shared view */}
        {currentZoom !== ZOOM_LEVELS.UNIVERSE &&
          currentZoom !== ZOOM_LEVELS.CONVERSATION &&
          currentNode && (
            <HierarchyLevelView
              parent={currentNode}
              children={children}
              onChildClick={(c) => zoomIn(c)}
            />
          )}

        {/* CONVERSATION */}
        {currentZoom === ZOOM_LEVELS.CONVERSATION && currentNode && (
          <ConversationView
            conversation={currentNode}
            emails={emails}
            onEmailClick={onEmailClick}
          />
        )}
      </div>

      {/* Loading overlay */}
      {loadingFrame && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50">
          <div className="text-xs text-textLight uppercase tracking-widest animate-pulse">
            Loading...
          </div>
        </div>
      )}

      {/* Hint footer */}
      {currentZoom === ZOOM_LEVELS.UNIVERSE && (
        <div className="absolute left-6 bottom-6 flex items-center gap-2 pointer-events-none opacity-40">
          <svg
            className="w-8 h-8"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
              d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5"
            />
          </svg>
          <div className="text-xs font-medium text-textDark">
            Click a domain to
            <br />
            zoom in
          </div>
        </div>
      )}
    </div>
  );
}
