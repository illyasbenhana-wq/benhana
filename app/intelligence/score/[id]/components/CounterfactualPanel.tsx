import { colors, font, type, space } from '../../../../../lib/intelligence/tokens'

// Renders the `counterfactuals` array verbatim from the Fable 5
// raw_response (see lib/prompts/ethoscore-llm-v2.ts / validateFable5Output
// in lib/scoring-engine.ts, which guarantees each item is a grounded,
// non-generic sentence starting with "To improve this score, the
// applicant could:"). No paraphrasing, no icons, no card gradient — a
// numbered list is deliberately the least "marketing" treatment available.
export function CounterfactualPanel({ counterfactuals }: { counterfactuals: string[] }) {
  if (counterfactuals.length === 0) {
    return (
      <div style={{ background: colors.bg.surface, border: `1px solid ${colors.border.default}`, borderRadius: 6, padding: space.lg }}>
        <p style={type.sectionLabel}>Counterfactual Guidance</p>
        <p style={{ ...type.body, marginTop: space.sm, color: colors.text.disabled }}>
          None recorded for this assessment.
        </p>
      </div>
    )
  }

  return (
    <div style={{ background: colors.bg.surface, border: `1px solid ${colors.border.default}`, borderRadius: 6, padding: space.lg }}>
      <p style={type.sectionLabel}>Counterfactual Guidance</p>
      <ol style={{ margin: `${space.md}px 0 0`, padding: 0, listStyle: 'none' }}>
        {counterfactuals.map((text, i) => (
          <li
            key={i}
            style={{
              display: 'flex',
              gap: space.md,
              padding: `${space.sm}px 0`,
              borderTop: i > 0 ? `1px solid ${colors.border.subtle}` : 'none',
            }}
          >
            <span style={{ fontFamily: font.mono, fontSize: 12, color: colors.text.tertiary, flexShrink: 0, width: 16 }}>
              {i + 1}.
            </span>
            <span style={{ ...type.body, fontSize: 13 }}>{text}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
