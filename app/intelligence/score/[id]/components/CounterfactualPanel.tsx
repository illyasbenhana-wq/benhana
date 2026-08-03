import { C, F, SP, cardCss, labelCss } from './styles'

// Renders the `counterfactuals` array verbatim from the Fable 5
// raw_response (see lib/prompts/ethoscore-llm-v2.ts / validateFable5Output
// in lib/scoring-engine.ts, which guarantees each item is a grounded,
// non-generic sentence starting with "To improve this score, the
// applicant could:"). No paraphrasing, no icons — a numbered list is
// deliberately the least "marketing" treatment available.
export function CounterfactualPanel({ counterfactuals }: { counterfactuals: string[] }) {
  if (counterfactuals.length === 0) {
    return (
      <div style={{ ...cardCss, padding: SP.lg }}>
        <p style={labelCss}>Counterfactual Guidance</p>
        <p style={{ fontFamily: F.sans, fontSize: 13, lineHeight: 1.55, marginTop: SP.sm, color: C.textMuted }}>
          None recorded for this assessment.
        </p>
      </div>
    )
  }

  return (
    <div style={{ ...cardCss, padding: SP.lg }}>
      <p style={labelCss}>Counterfactual Guidance</p>
      <ol style={{ margin: `${SP.md}px 0 0`, padding: 0, listStyle: 'none' }}>
        {counterfactuals.map((text, i) => (
          <li
            key={i}
            style={{
              display: 'flex',
              gap: SP.md,
              padding: `${SP.sm}px 0`,
              borderTop: i > 0 ? `1px solid ${C.border}` : 'none',
            }}
          >
            <span style={{ fontFamily: F.mono, fontSize: 12, color: C.textMuted, flexShrink: 0, width: 16 }}>
              {i + 1}.
            </span>
            <span style={{ fontFamily: F.sans, fontSize: 13, lineHeight: 1.55, color: C.textSecondary }}>{text}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
