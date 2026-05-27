
-- EthosFi-AI MVP Schema
-- Run this in your Supabase SQL editor

-- Borrower applications
create table applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),

  -- Personal
  full_name text not null,
  email text not null,

  -- Financial signals
  monthly_income numeric not null,
  employment_type text not null check (employment_type in ('employed','self_employed','gig','freelance','unemployed')),
  employer_name text,
  months_at_current_job integer,

  -- Alternative data
  rent_months_paid integer default 0,
  rent_monthly_amount numeric default 0,
  gig_platforms text[], -- e.g. ['deliveroo','uber','fiverr']
  gig_monthly_avg numeric default 0,
  savings_amount numeric default 0,

  -- Loan request
  loan_amount numeric not null,
  loan_purpose text not null,
  loan_term_months integer not null default 12,

  -- Status
  status text not null default 'pending'
    check (status in ('pending','scored','approved','declined','more_info')),

  -- Consent
  consent_data_use boolean not null default false,
  consent_ai_decision boolean not null default false
);

-- AI scoring results
create table scores (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references applications(id) on delete cascade,
  created_at timestamptz default now(),

  -- Score
  etho_score integer not null check (etho_score between 0 and 100),
  risk_band text not null check (risk_band in ('low','medium','high')),

  -- Explainability (EU AI Act compliant)
  ai_summary text not null,
  factors jsonb not null, -- [{name, weight, score, rationale}]
  recommendation text not null check (recommendation in ('approve','decline','review')),

  -- Raw AI response stored for audit
  raw_prompt text,
  raw_response text,
  model_version text default 'claude-sonnet-4-6'
);

-- Lender decisions (audit trail)
create table decisions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references applications(id) on delete cascade,
  score_id uuid references scores(id),
  created_at timestamptz default now(),

  decision text not null check (decision in ('approved','declined','more_info')),
  decided_by text not null default 'lender',
  notes text,

  -- Compliance
  override_reason text, -- if lender overrides AI recommendation
  eu_ai_act_logged boolean default true
);

-- Row level security (enable after setup)
alter table applications enable row level security;
alter table scores enable row level security;
alter table decisions enable row level security;

-- Indexes
create index on applications(status);
create index on applications(created_at desc);
create index on scores(application_id);
create index on decisions(application_id);

-- ─── Compliance Operations ────────────────────────────────────────────────────

-- Compliance investigations (cases)
create table cases (
  id uuid primary key default gen_random_uuid(),
  case_ref text not null unique,
  entity_name text not null,
  case_type text not null,
  jurisdiction text,
  exposure_amount numeric default 0,
  severity text not null check (severity in ('critical','high','medium','low')),
  sla_hours integer not null default 24,
  sla_remaining_hours numeric not null,
  status text not null default 'open'
    check (status in ('open','escalated','pending_info','cleared')),
  assigned_to text,
  opened_at timestamptz default now(),
  risk_score integer check (risk_score between 0 and 100),
  ai_summary text
);

-- Risk signals per case
create table signals (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references cases(id) on delete cascade,
  name text not null,
  score integer not null check (score between 0 and 100),
  rationale text
);

-- Analyst actions on cases (escalate / clear / request_info)
create table case_actions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references cases(id) on delete cascade,
  action text not null,
  acted_by text not null,
  notes text,
  created_at timestamptz default now()
);

-- Persistent audit event log
create table audit_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references cases(id) on delete cascade,
  case_ref text not null,
  analyst text not null,
  action text not null,
  severity text,
  created_at timestamptz default now()
);

create index on cases(status);
create index on cases(severity);
create index on cases(opened_at desc);
create index on signals(case_id);
create index on case_actions(case_id);
create index on audit_events(created_at desc);

-- Transaction intelligence metrics
create table tx_metrics (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  value text not null,
  trend text not null check (trend in ('up','down','flat')),
  note text,
  sort_order integer default 0,
  updated_at timestamptz default now()
);

create index on tx_metrics(sort_order);

-- ─── Seed Data ────────────────────────────────────────────────────────────────
-- Run once to bootstrap the compliance dashboard with initial cases.

insert into cases (id, case_ref, entity_name, case_type, jurisdiction, exposure_amount, severity, sla_hours, sla_remaining_hours, status, assigned_to, opened_at, risk_score, ai_summary) values
(
  '00000000-0000-0000-0000-000000000001',
  'INV-1047', 'Meridian Capital Ltd', 'Sanctions Match', 'OFAC / EU',
  2400000, 'critical', 4, 1.2, 'open', 'S. Chen',
  now() - interval '3 hours', 89,
  'Meridian Capital Ltd has been flagged against two OFAC SDN list entries and one EU Consolidated Sanctions List entry. Transaction flows totalling £2.4M were routed through correspondent accounts in three jurisdictions over a 72-hour window. The entity''s beneficial ownership structure presents opacity consistent with evasion typologies. Immediate escalation and account freeze recommended pending full investigation.'
),
(
  '00000000-0000-0000-0000-000000000002',
  'INV-1038', 'Vega Trade Finance', 'Velocity Anomaly', 'UK / UAE',
  890000, 'high', 8, 3.5, 'open', 'R. Okonkwo',
  now() - interval '4 hours 30 minutes', 74,
  'Vega Trade Finance has exhibited a sustained surge in transaction frequency over the past 5 days, with volumes 280% above the established baseline. Activity is concentrated between 01:00–04:00 UTC. Two counterparties were previously flagged in unrelated structuring investigations. Enhanced due diligence and ongoing account monitoring recommended.'
),
(
  '00000000-0000-0000-0000-000000000003',
  'INV-1021', 'Nakamura Holdings', 'PEP Relationship', 'Japan / Singapore',
  1100000, 'high', 24, 14.8, 'escalated', 'S. Chen',
  now() - interval '9 hours', 68,
  'Nakamura Holdings is beneficially owned (32%) by a first-degree family member of a current Japanese cabinet minister — Tier 1 PEP under internal classification. Three inbound transfers totalling £1.1M from Singapore entities have no apparent commercial nexus to the entity''s stated activities. Escalated to senior compliance review pending EDD completion.'
),
(
  '00000000-0000-0000-0000-000000000004',
  'INV-1015', 'Atlas Logistics Co', 'Geographic Anomaly', 'Netherlands / UAE / Nigeria',
  340000, 'medium', 48, 31.0, 'pending_info', 'M. Vasquez',
  now() - interval '17 hours', 51,
  'Atlas Logistics Co has initiated transfers to Nigerian counterparties, which falls outside the geographic risk profile established at onboarding (EU / UAE operations only). An information request was issued on 18 May 2026; response is pending. No sanctions or PEP matches identified at this time. Monitoring continued.'
),
(
  '00000000-0000-0000-0000-000000000005',
  'INV-1009', 'Elara Commodities', 'Structuring Pattern', 'UK / Switzerland',
  520000, 'medium', 48, 22.4, 'open', 'R. Okonkwo',
  now() - interval '26 hours', 55,
  'Elara Commodities has made 11 transactions over 7 days, each below the £50,000 automated reporting threshold. The aggregate value is £520,000. Statistical distribution of amounts is concentrated in the £45,000–£49,900 range, inconsistent with commodity trading payment patterns. Consistent with deliberate structuring to avoid detection. Enhanced monitoring initiated.'
);

insert into signals (case_id, name, score, rationale) values
('00000000-0000-0000-0000-000000000001', 'Sanctions Exposure',    94, 'Entity matches 2 OFAC SDN entries and 1 EU Consolidated List entry with 98.4% confidence. Mandatory review within 4-hour SLA.'),
('00000000-0000-0000-0000-000000000001', 'Velocity Anomaly',      82, '17 transactions within 6 hours on 3 May — 3.2× the 90-day baseline. Pattern consistent with layering behaviour.'),
('00000000-0000-0000-0000-000000000001', 'Geographic Dispersion', 71, 'Counterparties across 8 jurisdictions including FATF high-risk: Iran, Myanmar, Russia.'),
('00000000-0000-0000-0000-000000000001', 'Ownership Opacity',     88, '4 shell layers across BVI, Seychelles, Malta. Ultimate beneficial owner not positively identified.'),

('00000000-0000-0000-0000-000000000002', 'Velocity Anomaly',       86, '280% above 90-day baseline; concentrated in low-activity hours (01:00–04:00 UTC) over 5 consecutive days.'),
('00000000-0000-0000-0000-000000000002', 'Counterparty Risk',      72, 'Two counterparties appear in historical structuring case files (INV-0891, INV-0934). No current sanctions designation.'),
('00000000-0000-0000-0000-000000000002', 'Geographic Dispersion',  61, 'Flows routed via UAE free-zone accounts before onward transfer to UK — common trade-based money laundering pathway.'),
('00000000-0000-0000-0000-000000000002', 'Round-Sum Transactions', 58, '14 transactions at £49,500–£49,900 — consistent with threshold avoidance below the £50,000 reporting trigger.'),

('00000000-0000-0000-0000-000000000003', 'PEP Association',     82, 'UBO holds 32% equity through a family member who is a sitting Japanese cabinet minister (Tier 1 PEP). Annual enhanced review required.'),
('00000000-0000-0000-0000-000000000003', 'Unexplained Inflows', 74, 'Three transfers totalling £1.1M from Singapore entities with no identifiable commercial nexus to stated activities (property management).'),
('00000000-0000-0000-0000-000000000003', 'Source of Funds',     61, 'SOF documentation received for 2 of 3 transfers. Outstanding request issued 8 days ago; no response received.'),
('00000000-0000-0000-0000-000000000003', 'Counterparty Risk',   44, 'One Singapore counterparty incorporated 3 months prior to transfer; no trading history identified. Possible shell vehicle.'),

('00000000-0000-0000-0000-000000000004', 'Geographic Anomaly', 68, 'Transfers to Nigeria fall outside account-opening profile (EU / UAE only). Updated customer risk assessment required.'),
('00000000-0000-0000-0000-000000000004', 'Profile Deviation',  62, 'Stated business is European freight logistics. Nigeria-directed payments are inconsistent with known activities.'),
('00000000-0000-0000-0000-000000000004', 'Counterparty Risk',  41, 'Nigerian counterparty incorporated 6 months ago; no verifiable trade history. KYC documentation outstanding.'),
('00000000-0000-0000-0000-000000000004', 'Velocity Anomaly',   29, 'Transaction frequency within normal parameters. No threshold avoidance patterns detected.'),

('00000000-0000-0000-0000-000000000005', 'Structuring Pattern',    78, '11 transactions over 7 days, all below £50,000 threshold. Aggregate £520,000. Distribution inconsistent with legitimate trading.'),
('00000000-0000-0000-0000-000000000005', 'Round-Sum Transactions', 71, '9 of 11 transactions are exact multiples of £5,000 in the £45,000–£49,900 band. Probability of random occurrence: <0.3%.'),
('00000000-0000-0000-0000-000000000005', 'Frequency Deviation',    54, 'Average transaction count 220% above monthly baseline for this value band. No business justification provided.'),
('00000000-0000-0000-0000-000000000005', 'Geographic Dispersion',  32, 'Counterparties are UK and Switzerland domiciled — within expected profile. No high-risk jurisdiction exposure.');

insert into tx_metrics (label, value, trend, note, sort_order) values
('Transactions flagged (24h)', '143',   'up',   '+18% vs prior 24h',                1),
('Avg. signal confidence',     '81.4%', 'up',   '+2.1pp this week',                 2),
('High-risk jurisdictions',    '9',     'flat', 'Iran, Myanmar, Russia + 6 others',  3),
('Threshold avoidance hits',   '27',    'up',   'Up from 19 yesterday',             4),
('Network clusters detected',  '4',     'down', '1 resolved since 08:00',           5);

insert into audit_events (case_id, case_ref, analyst, action, severity, created_at) values
('00000000-0000-0000-0000-000000000001', 'INV-1047', 'S. Chen',     'Escalated to Senior Compliance',   'critical', now() - interval '21 minutes'),
('00000000-0000-0000-0000-000000000002', 'INV-1038', 'R. Okonkwo',  'Evidence package uploaded',         null,       now() - interval '32 minutes'),
('00000000-0000-0000-0000-000000000004', 'INV-1015', 'M. Vasquez',  'Information request sent',          null,       now() - interval '45 minutes'),
('00000000-0000-0000-0000-000000000005', 'INV-1009', 'L. Hartmann', 'Case notes updated',                null,       now() - interval '66 minutes'),
('00000000-0000-0000-0000-000000000003', 'INV-1021', 'S. Chen',     'PEP match confirmed — Tier 1',      'high',     now() - interval '83 minutes'),
('00000000-0000-0000-0000-000000000002', 'INV-1038', 'R. Okonkwo',  'Velocity threshold breach logged',  null,       now() - interval '108 minutes'),
('00000000-0000-0000-0000-000000000004', 'INV-1015', 'M. Vasquez',  'Case assigned from queue',          null,       now() - interval '122 minutes'),
('00000000-0000-0000-0000-000000000001', 'INV-1047', 'S. Chen',     'Sanctions hit confirmed — OFAC',    'critical', now() - interval '147 minutes');
