import { C, F, SP, R, riskLevelColor } from './styles'

export interface ProvenanceData {
  model_requested: string | null
  model_responded: string | null
  prompt_version: string | null
  created_at: string // ISO 8601, from `scores.created_at`
  confidence_overall: 'high' | 'medium' | 'low' | null
}

// Confidence isn't a risk_band, but reuses the same low/medium/high ->
// green/amber/red mapping for visual consistency across the panel.
const CONFIDENCE_LEVEL: Record<'high' | 'medium' | 'low', 'low' | 'medium' | 'high'> = {
  high: 'low',    // high confidence -> green
  medium: 'medium',
  low: 'high',    // low confidence -> red
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontFamily: F.sans, fontSize: 10, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.textMuted }}>
        {label}
      </span>
      <span style={{ fontFamily: F.mono, fontSize: 12, color: C.textPrimary, whiteSpace: 'nowrap' }}>
        {value}
      </span>
    </div>
  )
}

// Dense single row — provenance is a traceability record, not a summary
// card. Timestamp is always rendered as raw ISO 8601, never "2 hours ago":
// an investigator or auditor needs the exact instant, not a relative guess
// that goes stale the moment the page is left open.
export function ProvenanceBar({ data }: { data: ProvenanceData }) {
  const confidence = data.confidence_overall
  const confColor = confidence ? riskLevelColor(CONFIDENCE_LEVEL[confidence]) : riskLevelColor('neutral')

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: SP.xl,
        flexWrap: 'wrap',
        padding: `${SP.sm}px ${SP.lg}px`,
        background: C.background,
        border: `1px solid ${C.border}`,
        borderRadius: R.control,
      }}
    >
      <Field label="Model Requested" value={data.model_requested ?? 'n/a'} />
      <Field label="Model Responded" value={data.model_responded ?? 'n/a'} />
      <Field label="Prompt Version" value={data.prompt_version ?? 'n/a'} />
      <Field label="Scored At (UTC)" value={data.created_at} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginLeft: 'auto' }}>
        <span style={{ fontFamily: F.sans, fontSize: 10, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.textMuted }}>
          Overall Confidence
        </span>
        {confidence ? (
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontFamily: F.sans, fontSize: 11.5, fontWeight: 600,
              color: confColor,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: confColor }} />
            {confidence.toUpperCase()}
          </span>
        ) : (
          <span style={{ fontFamily: F.mono, fontSize: 12, color: C.textMuted }}>n/a</span>
        )}
      </div>
    </div>
  )
}
