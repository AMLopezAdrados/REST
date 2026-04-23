# REST — Email MVP

A spatial knowledge layer for email. Your inbox, organized in space.

## Quick Start

### 1. Setup Environment

Generate required secrets:
```bash
openssl rand -base64 32  # Copy this twice — use for NEXTAUTH_SECRET and DB_ENCRYPTION_KEY
```

### 2. Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project
3. Enable the Gmail API
4. Create an OAuth 2.0 credential (Web application)
5. Add authorized redirect: `http://localhost:3000/api/auth/callback/google`
6. Copy Client ID and Client Secret to `.env.local`

### 3. Anthropic API

1. Go to [Anthropic Console](https://console.anthropic.com)
2. Create an API key
3. Add to `.env.local` as `ANTHROPIC_API_KEY`

### 4. Run

```bash
npm install
npm run dev
```

Visit `http://localhost:3000` and connect your Gmail account.

## Architecture

- **Framework**: Next.js 14 with App Router + TypeScript
- **Database**: SQLite (better-sqlite3) — local, encrypted
- **Email**: Gmail API with OAuth2
- **AI**: Anthropic Claude (Haiku for classification, Sonnet for composition)
- **Frontend**: React with Tailwind CSS + spatial layout

## Core Features

- **Email Sync**: Fetches last 90 days, runs in background
- **Smart Classification**: Local patterns → Claude Haiku for categories → intent detection
- **Spatial Layout**: Topics organized in 6 sectors by category, positioned by urgency
- **Canvas**: Interactive spatial view of your email topics
- **Ledger**: Classic chronological email list
- **Smart Reply**: AI-powered reply suggestions with multiple templates
- **Privacy-First**: Emails never stored on external servers

## Database

SQLite schema stored in `src/lib/storage/schema.sql`. Tables:
- `users` — OAuth tokens (encrypted)
- `raw_emails` — Full email bodies
- `classifications` — Category, intent, extracted data
- `nodes` — Topic nodes with spatial positions
- `node_emails` — Edge list
- `context_entities` — Learned patterns (employers, retailers, etc.)
- `sync_progress` — Status tracking

## API Routes

- `POST /api/sync` — Fetch emails + classify + generate nodes
- `GET /api/sync` — Get sync progress
- `GET /api/nodes` — List all nodes for user
- `POST /api/nodes` — Get emails for a node
- `POST /api/reply` — Generate reply
- `PUT /api/reply` — Send reply via Gmail

## Classification Cascade

1. **Local patterns** (domains, labels, unsubscribe headers) → skip if confidence > 0.95
2. **Main category** via Claude Haiku (work/personal/reservation/order/admin/marketing/unknown)
3. **Subcategory** (e.g., meeting/task/restaurant/flight)
4. **Data extraction** (JSON with relevant fields per category)
5. **Intent detection** (has_question, has_action, has_deadline)

## Node Generation

Groups emails by thread or normalized subject + sender. Per group:
- Generate title (max 6 words) via Claude
- Generate summary (max 2 sentences) via Claude
- Compute urgency score based on intents and recency
- Assign sector by category
- Layout with force-directed positioning

## UI

### Canvas (`/canvas`)
Spatial view with nodes as cards. Filter by status (Action/Ongoing/Saved/Archive). Zoom, pan, click to detail.

### Node Detail
Summary, sender info, stats. "Draft reply" button opens reply composer.

### Ledger (`/ledger`)
Chronological list of emails in a topic. Shows consumption state.

### Smart Reply (`/components/reply/ReplyComposer`)
Templates: Yes/No, Suggest time, Custom. Select tone. AI generates reply. Review and send.

### Onboarding (`/onboarding`)
Welcome → Connect Gmail → Sync progress → Done → Open Canvas

## Development Notes

- All API routes require authentication (via NextAuth)
- Classification is concurrent (max 5 in parallel) to respect rate limits
- Node generation runs after sync completes
- Cost logging for all AI calls (see console)
- Error handling: unknown categories on failure, continues processing

## What's Next (Beyond MVP)

- Multi-user support with per-user encryption
- Incremental sync (only fetch new emails)
- Fine-tuning classifications based on user corrections
- Connection lines between related topics
- Custom folder/label sync
- Mobile app
- Batch processing and scheduling
- Advanced query/search
