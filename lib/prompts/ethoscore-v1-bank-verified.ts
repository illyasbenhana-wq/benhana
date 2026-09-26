// v1 scoring prompt + independently verified bank-statement data.
//
// A new prompt_version, never an edit to v1 (CLAUDE.md, Ocrolus reference
// design, point 3): decisions scored under v1 stay explainable against
// the exact prompt that produced them. Output schema is identical to v1,
// so parsing, ScoreResult and every downstream consumer are unchanged.
//
// Deliberately NOT in this prompt: document-authenticity / fraud signals.
// Those go only to lib/decision-engine.ts, where they can force human
// review and nothing else. Letting the model see them would give a fraud
// signal a second path — through the score — to an automatic decline.

import { ETHOSCORE_SYSTEM_PROMPT as V1_SYSTEM_PROMPT } from './ethoscore-v1'

export const PROMPT_VERSION = '1.1.0-bank-verified'

const VERIFIED_DATA_GUIDANCE = `

Verified bank-statement data:
Some applications include a VERIFIED BANK STATEMENT DATA section, extracted by an independent document-verification provider from the applicant's real bank statements.
- Where verified figures and self-reported figures disagree, rely on the verified figures and say so in the relevant factor rationale.
- Treat verified income consistency and balance history as stronger evidence than any self-reported equivalent.
- Missing or partial verified fields are not negative evidence — fall back to the self-reported value.
- Keep the same output schema below.`

export const ETHOSCORE_SYSTEM_PROMPT = V1_SYSTEM_PROMPT.replace(
  '\n\nEU AI Act compliance:',
  `${VERIFIED_DATA_GUIDANCE}\n\nEU AI Act compliance:`
)
