import { create } from 'zustand';
import type { TopicNode, ZoomLevel } from '@/types/node';
import { ZOOM_LEVELS } from '@/types/node';

export interface BreadcrumbSegment {
  id: string;
  title: string;
  depth: ZoomLevel;
}

interface ZoomState {
  // Invariant: currentZoom === path[path.length - 1].depth (the center node)
  currentZoom: ZoomLevel;
  path: BreadcrumbSegment[];
  zoomIn: (node: TopicNode) => void;
  zoomOut: () => void;
  jumpToSegment: (segmentId: string) => void;
  resetZoom: () => void;
  initUniverse: (universe: TopicNode) => void;
}

export const useZoomState = create<ZoomState>((set, get) => ({
  currentZoom: ZOOM_LEVELS.UNIVERSE,
  path: [],

  initUniverse: (universe: TopicNode) => {
    const { path } = get();
    if (path.length === 0) {
      set({
        currentZoom: ZOOM_LEVELS.UNIVERSE,
        path: [{ id: universe.id, title: universe.title, depth: ZOOM_LEVELS.UNIVERSE }],
      });
    }
  },

  zoomIn: (node: TopicNode) => {
    const { path } = get();
    const existingIdx = path.findIndex((seg) => seg.id === node.id);
    if (existingIdx >= 0) {
      // Re-click: truncate to this node
      set({
        currentZoom: node.depth,
        path: path.slice(0, existingIdx + 1),
      });
      return;
    }
    set({
      currentZoom: node.depth,
      path: [...path, { id: node.id, title: node.title, depth: node.depth }],
    });
  },

  zoomOut: () => {
    const { path } = get();
    if (path.length <= 1) {
      set({ currentZoom: ZOOM_LEVELS.UNIVERSE });
      return;
    }
    const newPath = path.slice(0, -1);
    const last = newPath[newPath.length - 1];
    set({
      currentZoom: last.depth,
      path: newPath,
    });
  },

  jumpToSegment: (segmentId: string) => {
    const { path } = get();
    const idx = path.findIndex((seg) => seg.id === segmentId);
    if (idx < 0) return;
    const newPath = path.slice(0, idx + 1);
    set({
      currentZoom: newPath[newPath.length - 1].depth,
      path: newPath,
    });
  },

  resetZoom: () => {
    const { path } = get();
    const universeSeg = path[0];
    set({
      currentZoom: ZOOM_LEVELS.UNIVERSE,
      path: universeSeg ? [universeSeg] : [],
    });
  },
}));
