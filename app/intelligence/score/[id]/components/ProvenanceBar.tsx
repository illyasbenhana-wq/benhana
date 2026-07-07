import { colors, font, space } from '../../../../../lib/intelligence/tokens'

export interface ProvenanceData {
  model_requested: string | null
  model_responded: string | null
  prompt_version: string | null
  created_at: string // ISO 8601, from `scores.created_at`
  confidence_overall: 'high' | 'medium' | 'low' | null
}

const CONFIDENCE_LEVEL: Record<'high' | 'medium' | 'low', keyof typeof colors.risk> = {
  high: 'low',    // high confidence -> green
  medium: 'medium',
  low: 'high',    // low confidence -> red
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontFamily: font.body, fontSize: 10, letterSpacing: '0.05em', textTransform: 'uppercase', color: colors.text.disabled }}>
        {label}
      </span>
      <span style={{ fontFamily: font.mono, fontSize: 12, color: colors.text.primary, whiteSpace: 'nowrap' }}>
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
  const confColor = confidence ? colors.risk[CONFIDENCE_LEVEL[confidence]] : colors.risk.neutral

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: space.xl,
        flexWrap: 'wrap',
        padding: `${space.sm}px ${space.lg}px`,
        background: colors.bg.inset,
        border: `1px solid ${colors.border.subtle}`,
        borderRadius: 4,
      }}
    >
      <Field label="Model Requested" value={data.model_requested ?? 'n/a'} />
      <Field label="Model Responded" value={data.model_responded ?? 'n/a'} />
      <Field label="Prompt Version" value={data.prompt_version ?? 'n/a'} />
      <Field label="Scored At (UTC)" value={data.created_at} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginLeft: 'auto' }}>
        <span style={{ fontFamily: font.body, fontSize: 10, letterSpacing: '0.05em', textTransform: 'uppercase', color: colors.text.disabled }}>
          Overall Confidence
        </span>
        {confidence ? (
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontFamily: font.body, fontSize: 11.5, fontWeight: 600,
              color: confColor.fg,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: confColor.fg }} />
            {confidence.toUpperCase()}
          </span>
        ) : (
          <span style={{ fontFamily: font.mono, fontSize: 12, color: colors.text.disabled }}>n/a</span>
        )}
      </div>
    </div>
  )
}
