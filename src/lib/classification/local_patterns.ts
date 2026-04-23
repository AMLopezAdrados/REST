import type { RawEmail } from '@/types/email';
import type { MainCategory } from '@/types/classification';

const ORDER_DOMAINS = [
  'bol.com',
  'amazon.com',
  'amazon.nl',
  'amazon.de',
  'coolblue.nl',
  'coolblue.com',
  'mollie.com',
  'stripe.com',
  'wehkamp.nl',
  'zalando.com',
  'zalando.nl',
  'hm.com',
  'asos.com',
  'mediamarkt.nl',
];

const TRAVEL_DOMAINS = [
  'booking.com',
  'airbnb.com',
  'airbnb.nl',
  'klm.com',
  'easyjet.com',
  'ryanair.com',
  'ns.nl',
  'trainline.com',
  'transavia.com',
  'lufthansa.com',
];

const RESERVATION_DOMAINS = ['opentable.com', 'thefork.com', 'resengo.com', 'quandoo.com'];

export interface LocalMatch {
  category: MainCategory;
  subcategory: string | null;
  confidence: number;
  source: string;
}

export function runLocalPatterns(email: RawEmail): LocalMatch | null {
  const labels = email.labels ? (JSON.parse(email.labels) as string[]) : [];
  const fromEmail = (email.from_email || '').toLowerCase();
  const subject = (email.subject || '').toLowerCase();
  const body = (email.body_plaintext || '').toLowerCase();
  const bodyHtml = (email.body_html || '').toLowerCase();

  const fromDomain = fromEmail.split('@')[1] ?? '';

  if (ORDER_DOMAINS.some((d) => fromDomain.endsWith(d))) {
    return { category: 'order', subcategory: 'retail', confidence: 0.97, source: 'domain:order' };
  }
  if (TRAVEL_DOMAINS.some((d) => fromDomain.endsWith(d))) {
    return { category: 'reservation', subcategory: 'travel', confidence: 0.96, source: 'domain:travel' };
  }
  if (RESERVATION_DOMAINS.some((d) => fromDomain.endsWith(d))) {
    return { category: 'reservation', subcategory: 'restaurant', confidence: 0.96, source: 'domain:reservation' };
  }

  if (labels.includes('CATEGORY_PROMOTIONS')) {
    return { category: 'marketing', subcategory: 'promotion', confidence: 0.96, source: 'gmail:promotions' };
  }
  if (labels.includes('CATEGORY_FORUMS')) {
    return { category: 'marketing', subcategory: 'forum', confidence: 0.9, source: 'gmail:forums' };
  }
  if (labels.includes('CATEGORY_SOCIAL')) {
    return { category: 'personal', subcategory: 'social', confidence: 0.85, source: 'gmail:social' };
  }

  const hasUnsub = /list-unsubscribe/i.test(email.body_html || '') || /unsubscribe/i.test(body) || /afmelden/i.test(body);
  const looksBulk = /noreply|no-reply|newsletter|nieuwsbrief|marketing/i.test(fromEmail);
  if (hasUnsub && looksBulk) {
    return { category: 'marketing', subcategory: 'newsletter', confidence: 0.93, source: 'heuristic:newsletter' };
  }

  if (
    bodyHtml.includes('text/calendar') ||
    /begin:vcalendar/i.test(email.body_plaintext || '') ||
    /begin:vcalendar/i.test(email.body_html || '')
  ) {
    return { category: 'reservation', subcategory: 'calendar', confidence: 0.95, source: 'heuristic:ical' };
  }

  if (/invoice|receipt|factuur|payment/i.test(subject) && /noreply|billing|invoice/i.test(fromEmail)) {
    return { category: 'admin', subcategory: 'invoice', confidence: 0.9, source: 'heuristic:invoice' };
  }

  return null;
}
