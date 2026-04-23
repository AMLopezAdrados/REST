import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireUserId } from '@/lib/auth/session';
import { getGmailForUser } from '@/lib/gmail/client';
import { getEmailById, getEmailsForNode } from '@/lib/storage/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ReplyRequest {
  nodeId?: string;
  emailId?: string;
  intent: string;
  tone: 'professional' | 'friendly' | 'casual';
  template?: string;
}

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body: ReplyRequest = await req.json();
  const { nodeId, emailId, intent, tone, template } = body;

  let email;
  let threadEmails = [];

  if (emailId) {
    email = getEmailById(emailId);
  } else if (nodeId) {
    threadEmails = getEmailsForNode(nodeId);
    email = threadEmails[threadEmails.length - 1];
  }

  if (!email) return NextResponse.json({ error: 'email not found' }, { status: 404 });

  const toneDesc = {
    professional: 'professional and formal',
    friendly: 'warm and conversational',
    casual: 'casual and relaxed',
  }[tone];

  const context = threadEmails.length > 0
    ? threadEmails.map(e => `${e.from_name ?? e.from_email}: ${(e.body_plaintext || '').slice(0, 300)}`).join('\n---\n')
    : (email.body_plaintext || '').slice(0, 500);

  const prompt = template === 'yes_no'
    ? `Generate a brief ${toneDesc} reply to confirm "${intent}" to this email thread. Just one sentence.`
    : template === 'suggest_time'
    ? `Generate a brief ${toneDesc} reply suggesting a time for "${intent}". One sentence.`
    : `Generate a ${toneDesc} reply for this intent: "${intent}". Keep it 1-3 sentences.`;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const resp = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: `Email thread:\n${context}\n\n${prompt}`,
        },
      ],
    });

    const reply = resp.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as any).text)
      .join('');

    return NextResponse.json({ ok: true, reply });
  } catch (err: any) {
    console.error('[reply] generation failed', err);
    return NextResponse.json({ error: 'generation failed' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { emailId, replyText } = await req.json();
  const email = getEmailById(emailId);
  if (!email) return NextResponse.json({ error: 'email not found' }, { status: 404 });

  try {
    const { gmail } = await getGmailForUser(userId);

    const threadEmails = email.thread_id ? await (async () => {
      const res = await gmail.users.messages.list({
        userId: 'me',
        q: `threadId:${email.thread_id}`,
      });
      return res.data.messages?.map(m => m.id).filter(id => id) || [];
    })() : [];

    const subject = `Re: ${email.subject || '(no subject)'}`;
    const to = email.from_email;
    const messageContent = `${replyText}\n\n---\nOriginal message from ${email.from_name ?? email.from_email}\n`;

    const raw = [
      `From: ${(email.to_emails ? JSON.parse(email.to_emails)[0] : 'me') || 'me'}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      threadEmails.length > 0 ? `In-Reply-To: ${threadEmails[threadEmails.length - 1]}` : '',
      'Content-Type: text/plain; charset=utf-8',
      '',
      messageContent,
    ]
      .filter(Boolean)
      .join('\r\n');

    const encodedMessage = Buffer.from(raw).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encodedMessage },
    });

    return NextResponse.json({ ok: true, sent: true });
  } catch (err: any) {
    console.error('[reply] send failed', err);
    return NextResponse.json({ error: 'send failed' }, { status: 500 });
  }
}
