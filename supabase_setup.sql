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
  status text not null default 'open' check (status in ('open','escalated','pending_info','cleared')),
  assigned_to text,
  opened_at timestamptz default now(),
  risk_score integer check (risk_score between 0 and 100),
  ai_summary text
);

create table signals (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references cases(id) on delete cascade,
  name text not null,
  score integer not null check (score between 0 and 100),
  rationale text
);

create table case_actions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references cases(id) on delete cascade,
  action text not null,
  acted_by text not null,
  notes text,
  created_at timestamptz default now()
);

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

insert into cases (id, case_ref, entity_name, case_type, jurisdiction, exposure_amount, severity, sla_hours, sla_remaining_hours, status, assigned_to, opened_at, risk_score, ai_summary) values
('00000000-0000-0000-0000-000000000001', 'INV-1047', 'Meridian Capital Ltd', 'Sanctions Match', 'OFAC / EU', 2400000, 'critical', 4, 1.2, 'open', 'S. Chen', now() - interval '3 hours', 89, 'Meridian Capital Ltd has been flagged against two OFAC SDN list entries and one EU Consolidated Sanctions List entry. Transaction flows totalling £2.4M were routed through correspondent accounts in three jurisdictions over a 72-hour window. The entity''s beneficial ownership structure presents opacity consistent with evasion typologies. Immediate escalation and account freeze recommended pending full investigation.'),
('00000000-0000-0000-0000-000000000002', 'INV-1038', 'Vega Trade Finance', 'Velocity Anomaly', 'UK / UAE', 890000, 'high', 8, 3.5, 'open', 'R. Okonkwo', now() - interval '4 hours 30 minutes', 74, 'Vega Trade Finance has exhibited a sustained surge in transaction frequency over the past 5 days, with volumes 280% above the established baseline. Activity is concentrated between 01:00–04:00 UTC. Two counterparties were previously flagged in unrelated structuring investigations. Enhanced due diligence and ongoing account monitoring recommended.'),
('00000000-0000-0000-0000-000000000003', 'INV-1021', 'Nakamura Holdings', 'PEP Relationship', 'Japan / Singapore', 1100000, 'high', 24, 14.8, 'escalated', 'S. Chen', now() - interval '9 hours', 68, 'Nakamura Holdings is beneficially owned (32%) by a first-degree family member of a current Japanese cabinet minister — Tier 1 PEP under internal classification. Three inbound transfers totalling £1.1M from Singapore entities have no apparent commercial nexus to the entity''s stated activities. Escalated to senior compliance review pending EDD completion.'),
('00000000-0000-0000-0000-000000000004', 'INV-1015', 'Atlas Logistics Co', 'Geographic Anomaly', 'Netherlands / UAE / Nigeria', 340000, 'medium', 48, 31.0, 'pending_info', 'M. Vasquez', now() - interval '17 hours', 51, 'Atlas Logistics Co has initiated transfers to Nigerian counterparties, which falls outside the geographic risk profile established at onboarding (EU / UAE operations only). An information request was issued on 18 May 2026; response is pending. No sanctions or PEP matches identified at this time. Monitoring continued.'),
('00000000-0000-0000-0000-000000000005', 'INV-1009', 'Elara Commodities', 'Structuring Pattern', 'UK / Switzerland', 520000, 'medium', 48, 22.4, 'open', 'R. Okonkwo', now() - interval '26 hours', 55, 'Elara Commodities has made 11 transactions over 7 days, each below the £50,000 automated reporting threshold. The aggregate value is £520,000. Statistical distribution of amounts is concentrated in the £45,000–£49,900 range, inconsistent with commodity trading payment patterns. Consistent with deliberate structuring to avoid detection. Enhanced monitoring initiated.');

insert into signals (case_id, name, score, rationale) values
('00000000-0000-0000-0000-000000000001', 'Sanctions Exposure', 94, 'Entity matches 2 OFAC SDN entries and 1 EU Consolidated List entry with 98.4% confidence. Mandatory review within 4-hour SLA.'),
('00000000-0000-0000-0000-000000000001', 'Velocity Anomaly', 82, '17 transactions within 6 hours on 3 May — 3.2x the 90-day baseline. Pattern consistent with layering behaviour.'),
('00000000-0000-0000-0000-000000000001', 'Geographic Dispersion', 71, 'Counterparties across 8 jurisdictions including FATF high-risk: Iran, Myanmar, Russia.'),
('00000000-0000-0000-0000-000000000001', 'Ownership Opacity', 88, '4 shell layers across BVI, Seychelles, Malta. Ultimate beneficial owner not positively identified.'),
('00000000-0000-0000-0000-000000000002', 'Velocity Anomaly', 86, '280% above 90-day baseline; concentrated in low-activity hours (01:00-04:00 UTC) over 5 consecutive days.'),
('00000000-0000-0000-0000-000000000002', 'Counterparty Risk', 72, 'Two counterparties appear in historical structuring case files (INV-0891, INV-0934). No current sanctions designation.'),
('00000000-0000-0000-0000-000000000002', 'Geographic Dispersion', 61, 'Flows routed via UAE free-zone accounts before onward transfer to UK — common trade-based money laundering pathway.'),
('00000000-0000-0000-0000-000000000002', 'Round-Sum Transactions', 58, '14 transactions at £49,500-£49,900 — consistent with threshold avoidance below the £50,000 reporting trigger.'),
('00000000-0000-0000-0000-000000000003', 'PEP Association', 82, 'UBO holds 32% equity through a family member who is a sitting Japanese cabinet minister (Tier 1 PEP). Annual enhanced review required.'),
('00000000-0000-0000-0000-000000000003', 'Unexplained Inflows', 74, 'Three transfers totalling £1.1M from Singapore entities with no identifiable commercial nexus to stated activities (property management).'),
('00000000-0000-0000-0000-000000000003', 'Source of Funds', 61, 'SOF documentation received for 2 of 3 transfers. Outstanding request issued 8 days ago; no response received.'),
('00000000-0000-0000-0000-000000000003', 'Counterparty Risk', 44, 'One Singapore counterparty incorporated 3 months prior to transfer; no trading history identified. Possible shell vehicle.'),
('00000000-0000-0000-0000-000000000004', 'Geographic Anomaly', 68, 'Transfers to Nigeria fall outside account-opening profile (EU / UAE only). Updated customer risk assessment required.'),
('00000000-0000-0000-0000-000000000004', 'Profile Deviation', 62, 'Stated business is European freight logistics. Nigeria-directed payments are inconsistent with known activities.'),
('00000000-0000-0000-0000-000000000004', 'Counterparty Risk', 41, 'Nigerian counterparty incorporated 6 months ago; no verifiable trade history. KYC documentation outstanding.'),
('00000000-0000-0000-0000-000000000004', 'Velocity Anomaly', 29, 'Transaction frequency within normal parameters. No threshold avoidance patterns detected.'),
('00000000-0000-0000-0000-000000000005', 'Structuring Pattern', 78, '11 transactions over 7 days, all below £50,000 threshold. Aggregate £520,000. Distribution inconsistent with legitimate trading.'),
('00000000-0000-0000-0000-000000000005', 'Round-Sum Transactions', 71, '9 of 11 transactions are exact multiples of £5,000 in the £45,000-£49,900 band. Probability of random occurrence: less than 0.3%.'),
('00000000-0000-0000-0000-000000000005', 'Frequency Deviation', 54, 'Average transaction count 220% above monthly baseline for this value band. No business justification provided.'),
('00000000-0000-0000-0000-000000000005', 'Geographic Dispersion', 32, 'Counterparties are UK and Switzerland domiciled — within expected profile. No high-risk jurisdiction exposure.');

insert into audit_events (case_id, case_ref, analyst, action, severity, created_at) values
('00000000-0000-0000-0000-000000000001', 'INV-1047', 'S. Chen', 'Escalated to Senior Compliance', 'critical', now() - interval '21 minutes'),
('00000000-0000-0000-0000-000000000002', 'INV-1038', 'R. Okonkwo', 'Evidence package uploaded', null, now() - interval '32 minutes'),
('00000000-0000-0000-0000-000000000004', 'INV-1015', 'M. Vasquez', 'Information request sent', null, now() - interval '45 minutes'),
('00000000-0000-0000-0000-000000000005', 'INV-1009', 'L. Hartmann', 'Case notes updated', null, now() - interval '66 minutes'),
('00000000-0000-0000-0000-000000000003', 'INV-1021', 'S. Chen', 'PEP match confirmed - Tier 1', 'high', now() - interval '83 minutes'),
('00000000-0000-0000-0000-000000000002', 'INV-1038', 'R. Okonkwo', 'Velocity threshold breach logged', null, now() - interval '108 minutes'),
('00000000-0000-0000-0000-000000000004', 'INV-1015', 'M. Vasquez', 'Case assigned from queue', null, now() - interval '122 minutes'),
('00000000-0000-0000-0000-000000000001', 'INV-1047', 'S. Chen', 'Sanctions hit confirmed - OFAC', 'critical', now() - interval '147 minutes');
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVobWluZ2J2a25hdmVoY2pna291Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5Mjk3MzQsImV4cCI6MjA5NDUwNTczNH0.IuG6z5pBORVF8cabjcWIy5LxgRNCHRa3HVwarLQ6_yQ

eyJhbGciOiJIUzI1N
iIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVobWluZ2J2a25hdmVoY2pna291Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODkyOTczNCwiZXhwIjoyMDk0NTA1NzM0fQ.Mg21_OiO5SesztjyO_NQvhLRhoZduUkkLGpfUl3XYh8
npm run dev


