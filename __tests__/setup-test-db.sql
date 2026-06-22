-- EthosFi Test Database Setup
-- Run against the test Supabase project ONLY

-- ─── Phase 1 Base Tables ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  plan        TEXT NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter', 'professional', 'enterprise')),
  settings    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_organizations_updated_at ON organizations;
CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  created_at timestamptz default now(),
  full_name text not null,
  email text not null,
  monthly_income numeric not null,
  employment_type text not null check (employment_type in ('employed','self_employed','gig','freelance','unemployed')),
  employer_name text,
  months_at_current_job integer,
  rent_months_paid integer default 0,
  rent_monthly_amount numeric default 0,
  gig_platforms text[],
  gig_monthly_avg numeric default 0,
  savings_amount numeric default 0,
  loan_amount numeric not null,
  loan_purpose text not null,
  loan_term_months integer not null default 12,
  status text not null default 'pending' check (status in ('pending','scored','approved','declined','more_info')),
  consent_data_use boolean not null default false,
  consent_ai_decision boolean not null default false,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS scores (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  application_id uuid references applications(id) on delete cascade,
  created_at timestamptz default now(),
  etho_score integer not null check (etho_score between 0 and 100),
  risk_band text not null check (risk_band in ('low','medium','high')),
  ai_summary text not null,
  factors jsonb not null,
  recommendation text not null check (recommendation in ('approve','decline','review')),
  raw_prompt text,
  raw_response text,
  model_version text default 'claude-sonnet-4-6',
  score_version text not null default 'v1' check (score_version in ('v1','v2')),
  score_pillars jsonb,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  application_id uuid references applications(id) on delete cascade,
  score_id uuid references scores(id),
  created_at timestamptz default now(),
  decision text not null check (decision in ('approved','declined','more_info')),
  decided_by text not null default 'lender',
  notes text,
  override_reason text,
  eu_ai_act_logged boolean default true,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  case_ref text not null unique,
  entity_name text not null,
  case_type text not null,
  jurisdiction text,
  exposure_amount numeric default 0,
  severity text not null check (severity in ('critical','high','medium','low')),
  sla_hours integer not null default 24,
  sla_remaining_hours numeric not null,
  status text not null default 'open' check (status in ('open','escalated','pending_info','cleared')),
  assigned_to text,
  opened_at timestamptz default now(),
  risk_score integer check (risk_score between 0 and 100),
  ai_summary text,
  application_id uuid references applications(id),
  priority text check (priority in ('critical','high','medium','low')),
  sla_deadline timestamptz,
  assigned_user_id uuid,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS signals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  case_id uuid references cases(id) on delete cascade,
  name text not null,
  score integer not null check (score between 0 and 100),
  rationale text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS case_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  case_id uuid references cases(id) on delete cascade,
  action text not null,
  acted_by text not null,
  previous_status text,
  new_status text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  case_id uuid references cases(id) on delete cascade,
  case_ref text not null,
  analyst text not null,
  action text not null,
  description text,
  severity text,
  created_at timestamptz default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ─── Phase 2 Tables ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS organization_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  organization_id uuid not null references organizations(id),
  role text not null check (role in ('owner','admin','analyst','viewer','partner')),
  invited_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(user_id, organization_id)
);

CREATE TABLE IF NOT EXISTS workflow_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  entity_type text not null check (entity_type in ('application','case')),
  entity_id uuid not null,
  event_type text not null check (event_type in ('status_change','assignment','note','score_complete','ai_review')),
  from_state text,
  to_state text not null,
  actor_id text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null,
  key_prefix text not null,
  key_hash text not null unique,
  scopes text[] not null default '{}',
  rate_limit_rpm integer not null default 60,
  last_used_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  url text not null,
  events text[] not null default '{}',
  secret text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS case_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  case_id uuid not null references cases(id),
  author_id text not null,
  body text not null,
  internal boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS case_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  case_id uuid not null references cases(id),
  title text not null,
  description text,
  assigned_to text not null,
  assigned_user_id uuid,
  status text not null default 'open' check (status in ('open','in_progress','done')),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  user_id uuid not null,
  type text not null check (type in ('case_escalated','case_cleared','case_assigned','application_scored','task_assigned','comment_added','sla_warning','info_requested')),
  title text not null,
  body text not null,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  organization_id uuid not null references organizations(id),
  event_type text not null check (event_type in ('case_escalated','case_cleared','case_assigned','application_scored','task_assigned','comment_added','sla_warning','info_requested')),
  channel_in_app boolean not null default true,
  channel_email boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, organization_id, event_type)
);

-- ─── Phase 3 Tables ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS risk_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  snapshot_at timestamptz not null default now(),
  total_exposure numeric not null default 0,
  avg_etho_score numeric,
  risk_distribution jsonb not null default '{}',
  top_risks jsonb not null default '[]',
  anomalies jsonb not null default '[]',
  created_at timestamptz not null default now()
);

-- ─── Test Seed Data ──────────────────────────────────────────────────────────

-- Two test organizations
INSERT INTO organizations (id, name, slug, plan) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Test Org Alpha', 'test-alpha', 'professional'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Test Org Beta', 'test-beta', 'starter')
ON CONFLICT (slug) DO NOTHING;

-- Org A: 3 applications with scores
INSERT INTO applications (id, organization_id, full_name, email, monthly_income, employment_type, employer_name, months_at_current_job, rent_months_paid, rent_monthly_amount, gig_platforms, gig_monthly_avg, savings_amount, loan_amount, loan_purpose, loan_term_months, status, consent_data_use, consent_ai_decision) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Alice Alpha', 'alice@alpha.com', 3500, 'employed', 'Alpha Corp', 36, 24, 950, '{}', 0, 5000, 8000, 'Business expansion', 24, 'scored', true, true),
  ('a1000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Bob Alpha', 'bob@alpha.com', 2800, 'self_employed', 'Bob Consulting', 18, 12, 800, '{Fiverr}', 400, 2000, 5000, 'Education', 12, 'scored', true, true),
  ('a1000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Carol Alpha', 'carol@alpha.com', 4200, 'employed', 'BigCo', 48, 30, 1100, '{}', 0, 8000, 12000, 'Home improvement', 36, 'approved', true, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO scores (id, organization_id, application_id, etho_score, risk_band, ai_summary, factors, recommendation, score_version, score_pillars) VALUES
  ('s1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 72, 'low', 'Strong applicant with stable employment.', '[{"name":"Income","weight":30,"score":75,"rationale":"Stable income"}]', 'approve', 'v2', '{"trust":{"score":220,"max":300},"track_record":{"score":195,"max":300},"financial_health":{"score":140,"max":200},"esg":{"score":100,"max":200}}'),
  ('s1000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 58, 'medium', 'Moderate risk, review recommended.', '[{"name":"Income","weight":30,"score":55,"rationale":"Variable income"}]', 'review', 'v2', '{"trust":{"score":160,"max":300},"track_record":{"score":140,"max":300},"financial_health":{"score":110,"max":200},"esg":{"score":100,"max":200}}'),
  ('s1000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003', 81, 'low', 'Excellent applicant, recommend approval.', '[{"name":"Income","weight":30,"score":85,"rationale":"High stable income"}]', 'approve', 'v2', '{"trust":{"score":260,"max":300},"track_record":{"score":230,"max":300},"financial_health":{"score":160,"max":200},"esg":{"score":100,"max":200}}')
ON CONFLICT (id) DO NOTHING;

-- Org A: 1 case with signals
INSERT INTO cases (id, organization_id, case_ref, entity_name, case_type, jurisdiction, exposure_amount, severity, sla_hours, sla_remaining_hours, status, assigned_to, risk_score, ai_summary) VALUES
  ('ca000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'TEST-A-001', 'Alpha Entity', 'Velocity Anomaly', 'UK', 500000, 'high', 24, 12.5, 'open', 'Analyst A', 74, 'Test case for Org Alpha.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO signals (organization_id, case_id, name, score, rationale) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'Velocity Anomaly', 78, 'Volume spike detected.'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'Geographic Risk', 45, 'Within normal profile.')
ON CONFLICT DO NOTHING;

-- Org B: 1 application with score, 1 case (completely separate data)
INSERT INTO applications (id, organization_id, full_name, email, monthly_income, employment_type, loan_amount, loan_purpose, loan_term_months, status, consent_data_use, consent_ai_decision) VALUES
  ('b1000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'Dave Beta', 'dave@beta.com', 2500, 'gig', 3000, 'Emergency fund', 6, 'scored', true, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO scores (id, organization_id, application_id, etho_score, risk_band, ai_summary, factors, recommendation, score_version) VALUES
  ('s2000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 45, 'high', 'High risk applicant.', '[{"name":"Income","weight":30,"score":35,"rationale":"Gig income volatile"}]', 'decline', 'v1')
ON CONFLICT (id) DO NOTHING;

INSERT INTO cases (id, organization_id, case_ref, entity_name, case_type, jurisdiction, exposure_amount, severity, sla_hours, sla_remaining_hours, status, assigned_to, risk_score, ai_summary) VALUES
  ('cb000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'TEST-B-001', 'Beta Entity', 'PEP Match', 'US', 200000, 'medium', 48, 30.0, 'open', 'Analyst B', 55, 'Test case for Org Beta.')
ON CONFLICT (id) DO NOTHING;
