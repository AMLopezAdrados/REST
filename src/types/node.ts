export type NodeStatus = 'action' | 'ongoing' | 'saved' | 'archive';

export type Sector = 'Work' | 'Personal' | 'Travel' | 'Orders' | 'Admin' | 'Other';

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
  depth?: number;
  parent_id?: string | null;
  aggregate_summary?: string | null;
  child_count?: number;
}
