import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Prediction {
  approval_probability: number
  estimated_time_to_close_days: number
  confidence: number
  similar_outcomes: { approved: number; declined: number; review: number }
  basis: 'historical' | 'insufficient_data'
}

const MIN_HISTORICAL = 20

// ─── Main Entry Point ────────────────────────────────────────────────────────

export async function predictOutcome(
  applicationId: string,
  orgId: string
): Promise<{ success: true; data: Prediction } | { success: false; error: string }> {
  const supabase = getSupabase()
  if (!supabase) return { success: false, error: 'Database not configured' }

  // Fetch the target application
  const { data: app, error: appErr } = await supabase
    .from('applications')
    .select('id, employment_type, loan_amount, monthly_income, created_at')
    .eq('id', applicationId)
    .eq('organization_id', orgId)
    .single()

  if (appErr || !app) return { success: false, error: 'Application not found' }

  // Fetch all scored/decided applications in this org for historical analysis
  const { data: historicalApps } = await supabase
    .from('applications')
    .select('id, employment_type, loan_amount, monthly_income, status, created_at')
    .eq('organization_id', orgId)
    .in('status', ['scored', 'approved', 'declined', 'more_info'])
    .neq('id', applicationId)
    .is('deleted_at', null)

  if (!historicalApps || historicalApps.length < MIN_HISTORICAL) {
    return {
      success: true,
      data: {
        approval_probability: 0.5,
        estimated_time_to_close_days: 7,
        confidence: 0.1,
        similar_outcomes: { approved: 0, declined: 0, review: 0 },
        basis: 'insufficient_data',
      },
    }
  }

  // Build peer cohort: same employment_type + loan_amount within ±50%
  const loanMin = app.loan_amount * 0.5
  const loanMax = app.loan_amount * 1.5
  const peers = historicalApps.filter(
    a => a.employment_type === app.employment_type
      && a.loan_amount >= loanMin
      && a.loan_amount <= loanMax
  )

  // Fall back to full org history if peer cohort is too small
  const cohort = peers.length >= 10 ? peers : historicalApps

  // Count outcomes
  const outcomes = { approved: 0, declined: 0, review: 0 }
  for (const a of cohort) {
    if (a.status === 'approved') outcomes.approved++
    else if (a.status === 'declined') outcomes.declined++
    else outcomes.review++
  }

  const total = outcomes.approved + outcomes.declined + outcomes.review
  const approvalProb = total > 0
    ? Math.round((outcomes.approved / total) * 100) / 100
    : 0.5

  // Estimate time to close: average days from creation to terminal status
  const terminalApps = cohort.filter(a => a.status === 'approved' || a.status === 'declined')
  let avgDaysToClose = 7

  if (terminalApps.length >= 5) {
    // Fetch the most recent workflow event for each terminal app to compute duration
    const terminalIds = terminalApps.map(a => a.id)
    const { data: events } = await supabase
      .from('workflow_events')
      .select('entity_id, created_at')
      .eq('entity_type', 'application')
      .eq('organization_id', orgId)
      .in('entity_id', terminalIds)
      .in('to_state', ['approved', 'declined'])
      .order('created_at', { ascending: false })

    if (events && events.length > 0) {
      const durations: number[] = []
      const seenIds = new Set<string>()

      for (const e of events) {
        if (seenIds.has(e.entity_id)) continue
        seenIds.add(e.entity_id)
        const app = terminalApps.find(a => a.id === e.entity_id)
        if (app) {
          const days = (new Date(e.created_at).getTime() - new Date(app.created_at).getTime()) / 86_400_000
          if (days >= 0) durations.push(days)
        }
      }

      if (durations.length > 0) {
        avgDaysToClose = Math.round((durations.reduce((s, d) => s + d, 0) / durations.length) * 10) / 10
      }
    }
  }

  // Confidence: based on cohort size and whether we used peers or full history
  const usedPeers = peers.length >= 10
  const confidence = Math.min(
    Math.round(((usedPeers ? 0.3 : 0.1) + Math.min(cohort.length / 100, 0.7)) * 100) / 100,
    1
  )

  return {
    success: true,
    data: {
      approval_probability: approvalProb,
      estimated_time_to_close_days: avgDaysToClose,
      confidence,
      similar_outcomes: outcomes,
      basis: 'historical',
    },
  }
}
