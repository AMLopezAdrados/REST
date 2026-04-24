export type NodeStatus = 'action' | 'ongoing' | 'saved' | 'archive';

export type Sector = 'Work' | 'Personal' | 'Travel' | 'Orders' | 'Admin' | 'Other';

export const ZOOM_LEVELS = {
  UNIVERSE: 0,
  DOMAIN: 1,
  CLUSTER: 2,
  TOPIC: 3,
  CONVERSATION: 4,
  RAW_EMAIL: 5,
} as const;

export type ZoomLevel = 0 | 1 | 2 | 3 | 4 | 5;

export interface TopicNode {
  id: string;
  user_id: string;
  title: string;
  summary: string | null;
  category: string | null;
  sector: Sector;
  position_x: number;
  position_y: number;
  urgency_score: number;
  status: NodeStatus;
  email_count: number;
  last_activity: number;
  created_at: number;
  participants?: string[];
  // Hierarchy fields
  depth: ZoomLevel;
  parent_id: string | null;
  aggregate_summary: string;
  child_count: number;
}
