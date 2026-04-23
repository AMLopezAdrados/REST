export interface RawEmail {
  id: string;
  user_id: string;
  gmail_id: string;
  thread_id: string | null;
  received_at: number;
  from_email: string;
  from_name: string | null;
  to_emails: string | null;
  subject: string | null;
  body_plaintext: string | null;
  body_html: string | null;
  labels: string | null;
  consumption_state: 'unseen' | 'implicit' | 'confirmed';
  consumed_at: number | null;
  consumed_via: string | null;
}

export interface NormalizedEmail {
  gmail_id: string;
  thread_id: string | null;
  received_at: number;
  from_email: string;
  from_name: string | null;
  to_emails: string[];
  subject: string | null;
  body_plaintext: string | null;
  body_html: string | null;
  labels: string[];
}
