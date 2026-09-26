/**
 * Partner-facing redaction of AI vendor/model identifiers.
 *
 * Partners (anything behind /api/v1/* API-key auth, plus outbound
 * webhooks) must never see the underlying AI vendor or model name — the
 * same rule the UI already follows (see app/score/[id]/page.tsx and
 * app/intelligence/score/[id]/components/ProvenanceBar.tsx). Internal
 * records keep the real identifiers: scores.model_version, the
 * model_versions registry and workflow_events.metadata are stored
 * untouched, and this module is only ever applied on the way out.
 *
 * Deliberately an allowlist on the value side (anything that isn't a
 * known non-vendor label becomes PARTNER_MODEL_LABEL) so a new model
 * identifier can't leak just because nobody added it to a list.
 */

export const PARTNER_MODEL_LABEL = 'ethoscore-v1'

// Labels that are already EthosFi-owned and safe to show as-is. 'mock-v1'
// is kept so a partner can tell a sandbox mock score from a real one.
const PASSTHROUGH_LABELS = new Set(['mock-v1'])

export function toPartnerModelVersion(modelVersion: string | null | undefined): string {
  if (modelVersion && PASSTHROUGH_LABELS.has(modelVersion)) return modelVersion
  return PARTNER_MODEL_LABEL
}

// workflow_events.metadata keys that carry vendor/model identity.
// prompt_version is included because its values name the target model
// (e.g. '2.0.0-fable5'); fable5_assessment is the raw model output.
// provider / provider_* identify the upstream data vendor (bank-statement
// verification) and its internal ids — also internal-only.
const MODEL_METADATA_KEYS = new Set([
  'model_version',
  'model_requested',
  'model_responded',
  'model_id',
  'prompt_version',
  'fable5_assessment',
  'provider',
  'provider_book_uuid',
  'provider_doc_uuid',
  'provider_reference',
])

export function redactPartnerMetadata(
  metadata: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!metadata) return {}
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(metadata)) {
    if (!MODEL_METADATA_KEYS.has(key)) out[key] = value
  }
  return out
}

export function redactPartnerEvents<T extends { metadata?: Record<string, unknown> | null }>(
  events: T[] | null | undefined
): T[] {
  return (events ?? []).map((e) => ({ ...e, metadata: redactPartnerMetadata(e.metadata) }))
}
