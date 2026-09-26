/**
 * Turns an Ocrolus Detect result into the single input the decision
 * engine accepts: reviewRequired (lib/decision-engine.ts).
 *
 * Deliberately conservative while Ocrolus hasn't confirmed the score
 * scale, the full signal/reason-code lists, or per-document vs book-level
 * scoring: ANY signal, ANY reason code, an "unable to process" outcome,
 * or no analysed form at all requires human review. Given the policy
 * (review only — never an automatic decline), a false positive costs a
 * manual look; a false negative lets a tampered statement through.
 *
 * OCROLUS_AUTHENTICITY_REVIEW_BELOW optionally adds a score threshold once
 * the scale is confirmed. Unset = score is recorded, not used.
 */

export type DetectOutcome = 'found' | 'not_found' | 'unable'

export interface DocumentAuthenticitySummary {
  reviewRequired: boolean
  formsAnalyzed: number
  signalCount: number
  reasonCodes: string[]
  lowestAuthenticityScore: number | null
  detectOutcome: DetectOutcome | null
}

export function summarizeDetect(raw: unknown, outcome: DetectOutcome | null, reviewBelow: number | null = envThreshold()): DocumentAuthenticitySummary {
  const forms: any[] = Array.isArray((raw as any)?.form_analysis) ? (raw as any).form_analysis : []
  let signalCount = 0
  const reasonCodes: string[] = []
  const scores: number[] = []

  for (const f of forms) {
    if (Array.isArray(f?.signals)) signalCount += f.signals.length
    const auth = f?.form_authenticity
    if (typeof auth?.score === 'number') scores.push(auth.score)
    if (Array.isArray(auth?.reason_codes)) {
      for (const rc of auth.reason_codes) if (rc?.code) reasonCodes.push(String(rc.code))
    }
  }

  const lowest = scores.length > 0 ? Math.min(...scores) : null
  const reviewRequired =
    outcome === 'found' ||
    outcome === 'unable' ||
    forms.length === 0 ||
    signalCount > 0 ||
    reasonCodes.length > 0 ||
    (reviewBelow !== null && lowest !== null && lowest < reviewBelow)

  return { reviewRequired, formsAnalyzed: forms.length, signalCount, reasonCodes, lowestAuthenticityScore: lowest, detectOutcome: outcome }
}

function envThreshold(): number | null {
  const v = Number(process.env.OCROLUS_AUTHENTICITY_REVIEW_BELOW)
  return Number.isFinite(v) && process.env.OCROLUS_AUTHENTICITY_REVIEW_BELOW !== undefined && process.env.OCROLUS_AUTHENTICITY_REVIEW_BELOW !== '' ? v : null
}
