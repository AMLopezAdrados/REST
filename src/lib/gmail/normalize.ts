import type { gmail_v1 } from 'googleapis';
import type { NormalizedEmail } from '@/types/email';

function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf-8');
}

function parseFrom(header: string): { email: string; name: string | null } {
  const match = header.match(/^(?:"?([^"<]*?)"?\s*)?<?([^<>\s]+@[^<>\s]+)>?$/);
  if (match) {
    const [, name, email] = match;
    return { email: email.trim(), name: name?.trim() || null };
  }
  return { email: header.trim(), name: null };
}

function parseAddressList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => parseFrom(s.trim()).email)
    .filter(Boolean);
}

function findHeader(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const h = headers.find((h) => h.name?.toLowerCase() === name.toLowerCase());
  return h?.value ?? undefined;
}

function extractBody(payload: gmail_v1.Schema$MessagePart | undefined): { plaintext: string; html: string } {
  if (!payload) return { plaintext: '', html: '' };

  let plaintext = '';
  let html = '';

  const walk = (part: gmail_v1.Schema$MessagePart) => {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      plaintext += decodeBase64Url(part.body.data);
    } else if (part.mimeType === 'text/html' && part.body?.data) {
      html += decodeBase64Url(part.body.data);
    }
    if (part.parts) part.parts.forEach(walk);
  };

  walk(payload);

  if (!plaintext && html) {
    plaintext = html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return { plaintext, html };
}

export function normalizeMessage(msg: gmail_v1.Schema$Message): NormalizedEmail | null {
  if (!msg.id) return null;

  const headers = msg.payload?.headers;
  const fromHeader = findHeader(headers, 'From') ?? '';
  const toHeader = findHeader(headers, 'To');
  const subject = findHeader(headers, 'Subject') ?? null;
  const dateHeader = findHeader(headers, 'Date');

  const { email: fromEmail, name: fromName } = parseFrom(fromHeader);
  const toEmails = parseAddressList(toHeader);

  const internalDate = msg.internalDate ? parseInt(msg.internalDate, 10) : null;
  const receivedAt = internalDate ?? (dateHeader ? Date.parse(dateHeader) : Date.now());

  const { plaintext, html } = extractBody(msg.payload);

  return {
    gmail_id: msg.id,
    thread_id: msg.threadId ?? null,
    received_at: receivedAt,
    from_email: fromEmail,
    from_name: fromName,
    to_emails: toEmails,
    subject,
    body_plaintext: plaintext.slice(0, 100000),
    body_html: html.slice(0, 200000),
    labels: msg.labelIds ?? [],
  };
}
