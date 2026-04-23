import type { RawEmail } from '@/types/email';
import type { MainCategory } from '@/types/classification';

export function buildEmailPreview(email: RawEmail): string {
  const body = (email.body_plaintext || '').slice(0, 400);
  return `Van: ${email.from_name ?? ''} <${email.from_email}>
Onderwerp: ${email.subject ?? '(geen onderwerp)'}
Eerste 400 tekens body:
${body}`;
}

export const MAIN_CATEGORY_SYSTEM = `Je classificeert emails voor REST in exact één categorie:

work
personal
reservation
order
admin
marketing
unknown

Geef alleen de categorie naam. Geen uitleg.`;

export const SUB_PROMPTS: Record<MainCategory, { system: string; options: string[] } | null> = {
  work: {
    system: `Je bepaalt het type werk-email. Kies exact één:

meeting
task
information
feedback
hr
client_inbound
external
other

Geef alleen de naam. Geen uitleg.`,
    options: ['meeting', 'task', 'information', 'feedback', 'hr', 'client_inbound', 'external', 'other'],
  },
  reservation: {
    system: `Je bepaalt het type reservering. Kies exact één:

restaurant
travel_flight
travel_hotel
travel_train
calendar_invite
other

Geef alleen de naam. Geen uitleg.`,
    options: ['restaurant', 'travel_flight', 'travel_hotel', 'travel_train', 'calendar_invite', 'other'],
  },
  order: null,
  personal: null,
  admin: null,
  marketing: null,
  unknown: null,
};

export const EXTRACTION_PROMPTS: Partial<Record<MainCategory, string>> = {
  reservation: `Extract de reservering data uit deze email. Output alleen een JSON object met deze velden (laat velden weg die niet in de email staan):

{
  "restaurant_name": string,
  "date": "YYYY-MM-DD",
  "time": "HH:mm",
  "party_size": number,
  "location": string,
  "confirmation_number": string
}

Alleen JSON. Geen uitleg.`,
  order: `Extract de order data uit deze email. Output alleen een JSON object:

{
  "retailer": string,
  "items": string[],
  "status": "placed" | "shipped" | "delivered" | "cancelled",
  "delivery_date": "YYYY-MM-DD",
  "tracking": string
}

Alleen JSON. Geen uitleg.`,
  work: `Extract context uit deze werk-email. Output alleen een JSON object:

{
  "sender_role": "boss" | "colleague" | "hr" | "client" | "external",
  "action_required": "yes" | "no",
  "deadline": "YYYY-MM-DD of beschrijving"
}

Alleen JSON. Geen uitleg.`,
};

export const INTENT_SYSTEM = `Je analyseert of deze email een actie van de ontvanger vereist.

Output alleen een JSON object met:

{
  "has_question": boolean,
  "has_action": boolean,
  "has_deadline": boolean,
  "deadline": string | null,
  "summary": string (max 15 woorden, in de taal van de email)
}

Alleen JSON. Geen uitleg.`;

export const NODE_TITLE_SYSTEM = `Je maakt een korte, menselijke titel voor een email onderwerp in REST.
Regels:
- Maximum 6 woorden
- Geen aanhalingstekens
- Beschrijvend en rustig
- Gebruik de taal van de email

Output alleen de titel.`;

export const NODE_SUMMARY_SYSTEM = `Je maakt een 1-2 zinnen samenvatting van wat er speelt in deze emails voor REST.
Regels:
- Max 2 zinnen, samen max 40 woorden
- Focus op wat er openstaat of beslist moet worden
- Schrijf in de taal van de emails
- Rustige, volwassen toon

Output alleen de samenvatting. Geen uitleg.`;
