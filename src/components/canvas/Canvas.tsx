'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { TopicNode } from '@/types/node';
import type { RawEmail } from '@/types/email';
import { NodeCard, type Lod } from './NodeCard';
import { SECTOR_ANGLES, SECTORS } from '@/lib/spatial/sectors';
import { statusColors } from '@/styles/tokens';

interface CanvasProps {
  nodes: TopicNode[];
  onNodeClick: (nodeId: string) => void;
  filter?: 'all' | 'action' | 'ongoing' | 'saved' | 'archive';
}

interface View {
  scale: number;
  x: number; // screen px offset of world origin
  y: number;
}

const MIN_R = 90;
const MAX_R = 660;
const SECTOR_PAD = 6; // degrees of padding inside each sector wedge
const MIN_SCALE = 0.25;
const MAX_SCALE = 5;
const INITIAL_SCALE = 0.55;

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

function lodFor(scale: number): Lod {
  if (scale < 0.7) return 'label';
  if (scale < 1.4) return 'compact';
  if (scale < 2.6) return 'detailed';
  return 'full';
}

// World-space "footprint" radius of a node — bigger bundles take more room and
// are drawn larger, so a topic that bundles many emails has real presence.
export function nodeFootprint(count: number): number {
  return 150 + Math.min(130, Math.sqrt(Math.max(1, count)) * 16);
}

// Recency-biased radial layout, then a collision-relaxation pass so nodes never
// stack: the more recently a topic was active, the closer to the centre; related
// subjects share a sector wedge; bigger bundles claim more space. Action items
// are pulled inward so what needs you sits near the middle.
function useWorldLayout(nodes: TopicNode[]) {
  return useMemo(() => {
    const now = Date.now();
    const bySector = new Map<string, TopicNode[]>();
    for (const n of nodes) {
      const arr = bySector.get(n.sector) ?? [];
      arr.push(n);
      bySector.set(n.sector, arr);
    }

    type P = { id: string; x: number; y: number; tx: number; ty: number; r: number };
    const pts: P[] = [];

    for (const [sector, group] of bySector.entries()) {
      const arc = SECTOR_ANGLES[sector as keyof typeof SECTOR_ANGLES] ?? { start: 300, end: 360 };
      const start = arc.start + SECTOR_PAD;
      const span = arc.end - arc.start - SECTOR_PAD * 2;

      group.sort((a, b) => b.last_activity - a.last_activity);
      const count = group.length;

      group.forEach((n, i) => {
        const daysSince = Math.max(0, (now - n.last_activity) / (1000 * 60 * 60 * 24));
        const recency = clamp(1 - daysSince / 90, 0, 1);
        const actionPull = n.status === 'action' ? 0.35 : 0;
        const score = clamp(recency * 0.6 + clamp(n.urgency_score, 0, 1) * 0.2 + actionPull, 0, 1);
        const radius = MIN_R + (1 - score) * (MAX_R - MIN_R);
        const t = count === 1 ? 0.5 : (i + 0.5) / count;
        const angle = start + t * span;
        const rad = (angle * Math.PI) / 180;
        const x = Math.cos(rad) * radius;
        const y = Math.sin(rad) * radius;
        pts.push({ id: n.id, x, y, tx: x, ty: y, r: nodeFootprint(n.email_count) });
      });
    }

    // Relaxation: push apart overlapping nodes, gently pull back toward target.
    for (let iter = 0; iter < 90; iter++) {
      for (let a = 0; a < pts.length; a++) {
        for (let b = a + 1; b < pts.length; b++) {
          const pa = pts[a];
          const pb = pts[b];
          let dx = pb.x - pa.x;
          let dy = pb.y - pa.y;
          let dist = Math.hypot(dx, dy) || 0.01;
          const minDist = pa.r + pb.r;
          if (dist < minDist) {
            const push = (minDist - dist) / 2;
            dx /= dist;
            dy /= dist;
            pa.x -= dx * push;
            pa.y -= dy * push;
            pb.x += dx * push;
            pb.y += dy * push;
          }
        }
      }
      for (const p of pts) {
        p.x += (p.tx - p.x) * 0.02;
        p.y += (p.ty - p.y) * 0.02;
      }
    }

    const pos = new Map<string, { x: number; y: number }>();
    for (const p of pts) pos.set(p.id, { x: p.x, y: p.y });
    return pos;
  }, [nodes]);
}

const STATUS_OPACITY: Record<string, number> = {
  action: 1,
  ongoing: 0.96,
  saved: 0.82,
  archive: 0.55,
};
const STATUS_Z: Record<string, number> = { action: 30, ongoing: 20, saved: 12, archive: 6 };

export function Canvas({ nodes, onNodeClick, filter = 'all' }: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ scale: INITIAL_SCALE, x: 0, y: 0 });
  const initializedRef = useRef(false);

  const filtered = useMemo(
    () => (filter === 'all' ? nodes : nodes.filter((n) => n.status === filter)),
    [nodes, filter]
  );
  const worldPos = useWorldLayout(nodes);

  // Lazily-loaded emails per node (only when zoomed fully in).
  const [emailsByNode, setEmailsByNode] = useState<Record<string, RawEmail[]>>({});
  const requestedRef = useRef<Set<string>>(new Set());
  const ensureEmails = useCallback((nodeId: string) => {
    if (requestedRef.current.has(nodeId)) return;
    requestedRef.current.add(nodeId);
    (async () => {
      try {
        const res = await fetch('/api/nodes', { method: 'POST', body: JSON.stringify({ nodeId }) });
        if (res.ok) {
          const data = (await res.json()) as RawEmail[];
          setEmailsByNode((m) => ({ ...m, [nodeId]: data }));
        }
      } catch {
        requestedRef.current.delete(nodeId);
      }
    })();
  }, []);

  // Measure container and centre the world origin on first paint.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
      if (!initializedRef.current && r.width && r.height) {
        initializedRef.current = true;
        setView({ scale: INITIAL_SCALE, x: r.width / 2, y: r.height / 2 });
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // --- panning (drag) -----------------------------------------------------
  const dragRef = useRef<{ active: boolean; startX: number; startY: number; ox: number; oy: number; moved: boolean }>(
    { active: false, startX: 0, startY: 0, ox: 0, oy: 0, moved: false }
  );
  const [grabbing, setGrabbing] = useState(false);

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    dragRef.current = { active: true, startX: e.clientX, startY: e.clientY, ox: view.x, oy: view.y, moved: false };
    setGrabbing(true);
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d.active) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
      setView((v) => ({ ...v, x: d.ox + dx, y: d.oy + dy }));
    };
    const onUp = () => {
      dragRef.current.active = false;
      setGrabbing(false);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  // --- zoom (wheel toward cursor) -----------------------------------------
  const zoomAt = useCallback((cx: number, cy: number, factor: number) => {
    setView((v) => {
      const newScale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
      const wx = (cx - v.x) / v.scale;
      const wy = (cy - v.y) / v.scale;
      return { scale: newScale, x: cx - wx * newScale, y: cy - wy * newScale };
    });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      zoomAt(e.clientX - r.left, e.clientY - r.top, factor);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const resetView = () => setView({ scale: INITIAL_SCALE, x: size.w / 2, y: size.h / 2 });
  const lod = lodFor(view.scale);

  // Cull to viewport (+ margin) so we only render what's on screen.
  const margin = 240;
  const visible = filtered.filter((n) => {
    const p = worldPos.get(n.id);
    if (!p) return false;
    const sx = view.x + p.x * view.scale;
    const sy = view.y + p.y * view.scale;
    return sx > -margin && sx < size.w + margin && sy > -margin && sy < size.h + margin;
  });

  return (
    <div
      ref={containerRef}
      onMouseDown={onMouseDown}
      className="relative w-full h-full bg-background overflow-hidden select-none"
      style={{ cursor: grabbing ? 'grabbing' : 'grab' }}
    >
      {/* Faint sector zone labels — give the canvas its organised structure */}
      {SECTORS.map((s) => {
        const arc = SECTOR_ANGLES[s];
        const mid = ((arc.start + arc.end) / 2) * (Math.PI / 180);
        const r = MAX_R + 70;
        const sx = view.x + Math.cos(mid) * r * view.scale;
        const sy = view.y + Math.sin(mid) * r * view.scale;
        return (
          <div
            key={s}
            className="absolute font-semibold uppercase tracking-widest text-navy/15 pointer-events-none"
            style={{
              left: sx,
              top: sy,
              transform: 'translate(-50%, -50%)',
              fontSize: clamp(18 * view.scale, 13, 40),
            }}
          >
            {s}
          </div>
        );
      })}

      {/* Centre marker */}
      <div
        className="absolute w-3 h-3 rounded-full bg-navy/40 pointer-events-none"
        style={{ left: view.x, top: view.y, transform: 'translate(-50%, -50%)' }}
      />

      {/* Nodes */}
      {visible.map((node) => {
        const p = worldPos.get(node.id)!;
        const sx = view.x + p.x * view.scale;
        const sy = view.y + p.y * view.scale;
        // When a filter is active everything shown is relevant → full opacity.
        const opacity = filter === 'all' ? STATUS_OPACITY[node.status] ?? 0.9 : 1;
        return (
          <div
            key={node.id}
            className="absolute"
            style={{
              left: sx,
              top: sy,
              transform: 'translate(-50%, -50%)',
              opacity,
              zIndex: STATUS_Z[node.status] ?? 10,
            }}
          >
            <NodeCard
              node={node}
              lod={lod}
              onClick={() => {
                if (dragRef.current.moved) return; // was a pan, not a click
                onNodeClick(node.id);
              }}
              emails={emailsByNode[node.id]}
              onEnsureEmails={ensureEmails}
            />
          </div>
        );
      })}

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <p className="text-textMid text-lg mb-2">No topics in this view</p>
            <p className="text-textLight">Try a different filter or sync your inbox</p>
          </div>
        </div>
      )}

      {/* Zoom controls */}
      <div className="absolute bottom-6 left-6 z-40 flex items-center gap-1 bg-white rounded-lg shadow-card p-1.5">
        <button
          onClick={() => zoomAt(size.w / 2, size.h / 2, 1 / 1.2)}
          className="w-8 h-8 text-lg text-textMid hover:text-textDark transition-colors"
          aria-label="Zoom out"
        >
          −
        </button>
        <span className="px-2 text-sm text-textMid tabular-nums w-12 text-center">
          {Math.round(view.scale * 100)}%
        </span>
        <button
          onClick={() => zoomAt(size.w / 2, size.h / 2, 1.2)}
          className="w-8 h-8 text-lg text-textMid hover:text-textDark transition-colors"
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          onClick={resetView}
          className="px-3 h-8 text-sm text-textMid hover:text-textDark transition-colors"
        >
          Reset
        </button>
      </div>

      {/* Hint */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 text-xs text-textLight bg-white/70 backdrop-blur rounded-full px-3 py-1 pointer-events-none">
        scroll to zoom · drag to pan · {lod === 'label' ? 'zoom in for detail' : lod === 'full' ? 'messages shown' : 'keep zooming for messages'}
      </div>

      {/* Stats / legend */}
      <div className="absolute top-6 right-6 bg-white rounded-lg shadow-card p-4 max-w-xs z-30">
        <p className="text-sm text-textMid mb-2">
          Showing <span className="font-semibold text-textDark">{filtered.length}</span> of{' '}
          <span className="text-textDark">{nodes.length}</span> topics
        </p>
        <div className="grid grid-cols-2 gap-2 text-xs text-textLight">
          {(['action', 'ongoing', 'saved', 'archive'] as const).map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColors[s].stripe }} />
              {s}
            </div>
          ))}
        </div>
        <p className="mt-2 pt-2 border-t border-border text-[11px] text-textLight">
          Recent topics sit nearer the centre.
        </p>
      </div>
    </div>
  );
}
