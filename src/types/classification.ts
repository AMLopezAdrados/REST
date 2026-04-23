export type MainCategory =
  | 'work'
  | 'personal'
  | 'reservation'
  | 'order'
  | 'admin'
  | 'marketing'
  | 'unknown';

export interface Classification {
  email_id: string;
  main_category: MainCategory;
  subcategory: string | null;
  extracted_data: Record<string, unknown> | null;
  intent_data: IntentData | null;
  confidence: number;
  classified_at: number;
  classifier_version: string;
  user_corrected: boolean;
}

export interface IntentData {
  has_question: boolean;
  has_action: boolean;
  has_deadline: boolean;
  deadline: string | null;
  summary: string;
}

export interface ReservationData {
  restaurant_name?: string;
  date?: string;
  time?: string;
  party_size?: number;
  location?: string;
  confirmation_number?: string;
}

export interface OrderData {
  retailer?: string;
  items?: string[];
  status?: string;
  delivery_date?: string;
  tracking?: string;
}

export interface WorkData {
  sender_role?: 'boss' | 'colleague' | 'hr' | 'client' | 'external';
  action_required?: 'yes' | 'no';
  deadline?: string;
}
