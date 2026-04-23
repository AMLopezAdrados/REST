export type EntityType =
  | 'employer'
  | 'colleague'
  | 'family'
  | 'friend'
  | 'retailer'
  | 'service'
  | 'unknown';

export interface ContextEntity {
  id: string;
  user_id: string;
  entity_type: EntityType;
  data: Record<string, unknown>;
  confidence: number;
  user_confirmed: boolean;
  created_at: number;
}
