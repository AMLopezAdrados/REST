export type NodeStatus = 'action' | 'ongoing' | 'saved' | 'archive';

export type Sector = 'Work' | 'Personal' | 'Travel' | 'Orders' | 'Admin' | 'Other';

export type ActionType =
  | 'reply'
  | 'review'
  | 'pay'
  | 'upload'
  | 'schedule'
  | 'confirm'
  | 'track'
  | 'read'
  | 'ignore';

export type StreamType =
  | 'human'
  | 'promotion'
  | 'transactional'
  | 'security'
  | 'social'
  | 'support'
  | 'system'
  | 'service';

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
  source_label?: string | null;
  source_email?: string | null;
  why_it_matters?: string | null;
  action_type?: ActionType | null;
  effort_label?: string | null;
  primary_cta_label?: string | null;
  primary_cta_url?: string | null;
  secondary_cta_label?: string | null;
  low_value?: boolean;
  is_tracking_only?: boolean;
  service_key?: string | null;
  stream_type?: StreamType | null;
  bundle_kind?: 'service' | 'noise' | 'stream' | 'thread' | null;
}
