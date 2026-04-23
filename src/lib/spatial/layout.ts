import { SECTOR_ANGLES } from './sectors';
import type { Sector, TopicNode } from '@/types/node';

export interface LayoutInput {
  id: string;
  sector: Sector;
  urgency: number;
  recency_days: number;
  last_activity_days: number;
}

export interface LayoutPosition {
  id: string;
  x: number;
  y: number;
  score: number;
}

const CANVAS_RADIUS = 700;
const MIN_RADIUS = 140;

export function computeScore(input: { urgency: number; recency_days: number; last_activity_days: number }): number {
  const recency = Math.max(0, 1 - input.recency_days / 90);
  const activity = Math.max(0, 1 - input.last_activity_days / 90);
  const score = input.urgency * 0.5 + recency * 0.3 + activity * 0.2;
  return Math.max(0, Math.min(1, score));
}

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function layoutNodes(inputs: LayoutInput[]): LayoutPosition[] {
  const bySector = new Map<Sector, LayoutInput[]>();
  for (const n of inputs) {
    const arr = bySector.get(n.sector) ?? [];
    arr.push(n);
    bySector.set(n.sector, arr);
  }

  const positions: LayoutPosition[] = [];

  for (const [sector, nodes] of bySector.entries()) {
    const { start, end } = SECTOR_ANGLES[sector];
    const span = end - start;
    const count = nodes.length;

    nodes.sort((a, b) => {
      const scoreA = computeScore(a);
      const scoreB = computeScore(b);
      return scoreB - scoreA;
    });

    nodes.forEach((n, i) => {
      const score = computeScore(n);
      const radius = MIN_RADIUS + (1 - score) * (CANVAS_RADIUS - MIN_RADIUS);

      // Spread within sector, with jitter for organic feel
      const t = count === 1 ? 0.5 : (i + 0.5) / count;
      const baseAngle = start + t * span;
      const jitter = ((i * 37) % 17) - 8;
      const angle = baseAngle + jitter * 0.3;

      const rad = toRadians(angle);
      const x = Math.cos(rad) * radius;
      const y = Math.sin(rad) * radius;
      positions.push({ id: n.id, x, y, score });
    });
  }

  return positions;
}

export function nodeToLayoutInput(n: TopicNode): LayoutInput {
  const now = Date.now();
  const daysSince = Math.max(0, (now - n.last_activity) / (1000 * 60 * 60 * 24));
  return {
    id: n.id,
    sector: n.sector,
    urgency: n.urgency_score,
    recency_days: daysSince,
    last_activity_days: daysSince,
  };
}
