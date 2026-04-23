import type { RawEmail } from '@/types/email';
import { getClassification, insertContextEntity, getContextEntities } from '@/lib/storage/queries';

export interface DetectedPattern {
  kind: 'employer' | 'retailer' | 'family';
  label: string;
  data: Record<string, unknown>;
  count: number;
}

export async function detectPatterns(userId: string, emails: RawEmail[]): Promise<DetectedPattern[]> {
  const domainCount = new Map<string, number>();
  const senderCount = new Map<string, { name: string | null; count: number }>();
  const retailerCount = new Map<string, number>();

  for (const e of emails) {
    const cls = getClassification(e.id);
    const domain = (e.from_email.split('@')[1] || '').toLowerCase();

    if (cls?.main_category === 'work') {
      domainCount.set(domain, (domainCount.get(domain) ?? 0) + 1);
    }

    if (cls?.main_category === 'order') {
      retailerCount.set(domain, (retailerCount.get(domain) ?? 0) + 1);
    }

    if (cls?.main_category === 'personal' && e.from_name) {
      const key = e.from_email.toLowerCase();
      const s = senderCount.get(key) ?? { name: e.from_name, count: 0 };
      s.count++;
      senderCount.set(key, s);
    }
  }

  const patterns: DetectedPattern[] = [];

  const topWorkDomain = [...domainCount.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topWorkDomain && topWorkDomain[1] >= 3) {
    patterns.push({
      kind: 'employer',
      label: `Looks like you work at ${topWorkDomain[0]}. Add as your employer?`,
      data: { domain: topWorkDomain[0] },
      count: topWorkDomain[1],
    });
  }

  for (const [domain, count] of retailerCount.entries()) {
    if (count >= 2) {
      patterns.push({
        kind: 'retailer',
        label: `I see you order from ${domain} regularly. Track orders automatically?`,
        data: { domain },
        count,
      });
    }
  }

  for (const [email, info] of senderCount.entries()) {
    if (info.count >= 3 && info.name) {
      patterns.push({
        kind: 'family',
        label: `${info.name} shows up often — add as family/friend?`,
        data: { email, name: info.name },
        count: info.count,
      });
    }
  }

  return patterns.slice(0, 5);
}

export function saveEntity(userId: string, pattern: DetectedPattern) {
  insertContextEntity(userId, {
    entity_type: pattern.kind === 'employer' ? 'employer' : pattern.kind === 'retailer' ? 'retailer' : 'family',
    data: pattern.data,
    confidence: 0.8,
    user_confirmed: true,
  });
}

export function userHasEntities(userId: string): boolean {
  return getContextEntities(userId).length > 0;
}
