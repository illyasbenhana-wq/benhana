# EthosFi-AI MVP

Alternative credit scoring for underserved borrowers. Built with Next.js, Supabase, and Claude API.

## What's built

| Page | Route | Who sees it |
|------|-------|-------------|
| Landing page | `/` | Public — investors, borrowers, lenders |
| Application form | `/apply` | Borrowers — 3-step form |
| EthoScore results | `/score/[id]` | Borrower — score + explanation |
| Lender dashboard | `/dashboard` | Lenders — review + decide |

## Stack

- **Next.js 15** (App Router) — frontend + API routes
- **Supabase** — Postgres database + auth
- **Claude API** (`claude-sonnet-4-6`) — AI scoring engine
- **Vercel** — deployment

## Setup

### 1. Supabase
1. Create project at [supabase.com](https://supabase.com)
2. Go to SQL Editor → paste contents of `supabase-schema.sql` → Run
3. Copy your URL and keys from Settings → API

### 2. Environment variables
```bash
cp .env.local.example .env.local
# Fill in your Supabase URL, anon key, service key, and Anthropic API key
```

### 3. Install and run
```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Deploy to Vercel
```bash
npx vercel
# Add the 4 env vars in Vercel dashboard → Settings → Environment Variables
```

## How the scoring works

1. Borrower submits form → saved to `applications` table
2. API route calls `lib/scoring-engine.ts` → Claude API with structured prompt
3. Claude returns JSON: `etho_score`, `risk_band`, `recommendation`, `factors[]`, `ai_summary`
4. Score saved to `scores` table with full audit trail
5. Borrower redirected to `/score/[id]` to see results
6. Lender reviews in `/dashboard` → approves/declines → logged to `decisions` table

## EU AI Act compliance
- Every decision is explained with 5 factors + rationale
- Borrower informed of right to human review (Article 22)
- Full audit trail in `decisions` table
- Raw AI prompt + response stored for explainability audit
