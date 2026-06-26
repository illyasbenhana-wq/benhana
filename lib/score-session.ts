import { Recommendation, RiskBand, ScoreFactor } from '@/types'

/** Session payload written after POST /api/score — avoids client-side Supabase reads (RLS-safe). */
export type ScoreSessionPayload = {
  application_id: string
  score_id: string
  full_name: string
  etho_score: number
  risk_band: RiskBand
  recommendation: Recommendation
  ai_summary: string
  factors: ScoreFactor[]
  model_version?: string
}

export function scoreSessionKey(applicationId: string) {
  return `ethosfi:score:${applicationId}`
}

export function saveScoreSession(payload: ScoreSessionPayload) {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(scoreSessionKey(payload.application_id), JSON.stringify(payload))
}

export function readScoreSession(applicationId: string): ScoreSessionPayload | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(scoreSessionKey(applicationId))
    if (!raw) return null
    return JSON.parse(raw) as ScoreSessionPayload
  } catch {
    // Intentionally silent: corrupt sessionStorage data is non-critical,
    // the score page will re-fetch from the API. Client-side only.
    return null
  }
}
