import { createClient } from '@supabase/supabase-js'

export type AiProvider = 'claude' | 'palantir' | 'fallback'

export interface AuditRecord {
  auditId: string
  applicationId: string
  inputSnapshot: Record<string, unknown>
  modelVersion: string
  promptVersion: string
  aiProvider: AiProvider
  rawPrompt: string
  rawResponse: string
  createdAt: string
}

export interface AuditInput {
  applicationId: string
  inputSnapshot: Record<string, unknown>
  modelVersion: string
  promptVersion: string
  aiProvider: AiProvider
  rawPrompt: string
  rawResponse: string
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export async function recordAuditEvent(input: AuditInput): Promise<AuditRecord> {
  const record: AuditRecord = {
    auditId: crypto.randomUUID(),
    applicationId: input.applicationId,
    inputSnapshot: input.inputSnapshot,
    modelVersion: input.modelVersion,
    promptVersion: input.promptVersion,
    aiProvider: input.aiProvider,
    rawPrompt: input.rawPrompt,
    rawResponse: input.rawResponse,
    createdAt: new Date().toISOString(),
  }

  const supabase = getSupabase()
  if (supabase) {
    const { error } = await supabase.from('audit_events').insert({
      audit_id: record.auditId,
      application_id: record.applicationId,
      input_snapshot: record.inputSnapshot,
      model_version: record.modelVersion,
      prompt_version: record.promptVersion,
      ai_provider: record.aiProvider,
      raw_prompt: record.rawPrompt,
      raw_response: record.rawResponse,
      created_at: record.createdAt,
    })
    if (error) {
      console.error('[audit-engine] Failed to persist audit event:', error.message)
    }
  } else {
    console.warn('[audit-engine] Supabase unavailable — audit event not persisted:', record.auditId)
  }

  return record
}
