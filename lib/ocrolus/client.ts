/**
 * Ocrolus bank-statement verification client (server-only).
 *
 * Endpoints follow Ocrolus's "Getting Started" deck and the integration
 * brief (2026-09-25). UNCONFIRMED with Ocrolus as of writing — every item
 * below is configurable rather than hard-coded, and must be checked
 * against real sandbox behavior before production:
 *   - OAuth 2.0 flow: assumed client_credentials against OCROLUS_TOKEN_URL
 *     with OCROLUS_AUDIENCE (grant type, token lifetime, scopes pending)
 *   - Response envelopes: parsed defensively (`response.uuid` or `uuid`)
 *   - `Book not found` (1401) treated as possibly transient: retried once
 *
 * Mode selection is explicit (OCROLUS_MODE). Unset = feature unavailable —
 * never a silent fallback to mock data, which would present simulated
 * results as verified ones.
 */

export type OcrolusMode = 'live' | 'mock'

export type OcrolusErrorKind =
  | 'config'          // missing credentials / mode
  | 'auth'            // token request failed
  | 'invalid_pdf'     // user must re-upload
  | 'book_not_found'  // persisted after one retry
  | 'permission'      // auth/scope problem — never retried silently
  | 'programming'     // "Required pk or book uuid" — should never happen
  | 'http'            // anything else

export class OcrolusError extends Error {
  constructor(public kind: OcrolusErrorKind, message: string, public status?: number, public code?: number) {
    super(message)
    this.name = 'OcrolusError'
  }
}

export interface UploadResult {
  docUuid: string | null
  // "MixedDoc.pdf already exists": Ocrolus returns the original document,
  // so the verification simply continues with it.
  duplicate: boolean
}

export interface OcrolusClient {
  mode: OcrolusMode
  createBook(name: string): Promise<{ bookUuid: string }>
  uploadStatement(bookUuid: string, file: Blob, fileName: string): Promise<UploadResult>
  getDetectSignals(bookUuid: string): Promise<unknown>
  getCashFlowFeatures(bookUuid: string): Promise<unknown>
}

// Classifies Ocrolus's documented upload errors (integration brief table).
// Message matching is deliberate: only one numeric code (1401) is
// documented; the rest are identified by message text alone.
export function classifyUploadError(status: number, body: { code?: number; message?: string } | null): OcrolusError {
  const msg = body?.message ?? `HTTP ${status}`
  if (body?.code === 1401 || /book not found/i.test(msg)) return new OcrolusError('book_not_found', msg, status, body?.code)
  if (/not a valid pdf/i.test(msg)) return new OcrolusError('invalid_pdf', msg, status, body?.code)
  if (/no permission/i.test(msg)) return new OcrolusError('permission', msg, status, body?.code)
  if (/required pk|required parameter|book uuid/i.test(msg)) return new OcrolusError('programming', msg, status, body?.code)
  return new OcrolusError('http', msg, status, body?.code)
}

export function isDuplicateUpload(body: { message?: string } | null): boolean {
  return /already exists/i.test(body?.message ?? '')
}

// Ocrolus wraps most payloads as { status, message, response: {...} }.
function unwrap(json: any): any {
  return json && typeof json === 'object' && 'response' in json ? json.response : json
}

function pickUuid(obj: any): string | null {
  const o = unwrap(obj)
  return (o?.uuid ?? o?.book_uuid ?? o?.doc_uuid ?? null) as string | null
}

interface LiveConfig {
  apiBase: string
  tokenUrl: string
  audience: string
  clientId: string
  clientSecret: string
}

export class LiveOcrolusClient implements OcrolusClient {
  mode: OcrolusMode = 'live'
  private token: { value: string; expiresAt: number } | null = null

  constructor(private cfg: LiveConfig, private fetchImpl: typeof fetch = fetch, private sleep = (ms: number) => new Promise(r => setTimeout(r, ms))) {}

  private async getToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt) return this.token.value
    const res = await this.fetchImpl(this.cfg.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: this.cfg.clientId,
        client_secret: this.cfg.clientSecret,
        audience: this.cfg.audience,
      }),
    })
    const json: any = await res.json().catch(() => null)
    if (!res.ok || !json?.access_token) throw new OcrolusError('auth', `Ocrolus token request failed (HTTP ${res.status})`, res.status)
    // Refresh 60s early; default 1h if the lifetime isn't reported.
    const ttl = typeof json.expires_in === 'number' ? json.expires_in : 3600
    this.token = { value: json.access_token, expiresAt: Date.now() + Math.max(ttl - 60, 30) * 1000 }
    return this.token.value
  }

  private async request(path: string, init: RequestInit = {}): Promise<{ res: Response; json: any }> {
    const token = await this.getToken()
    const res = await this.fetchImpl(`${this.cfg.apiBase}${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
    })
    const json: any = await res.json().catch(() => null)
    return { res, json }
  }

  async createBook(name: string): Promise<{ bookUuid: string }> {
    const { res, json } = await this.request('/v1/book/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const bookUuid = pickUuid(json)
    if (!res.ok || !bookUuid) throw new OcrolusError('http', `Book creation failed: ${json?.message ?? `HTTP ${res.status}`}`, res.status, json?.code)
    return { bookUuid }
  }

  async uploadStatement(bookUuid: string, file: Blob, fileName: string): Promise<UploadResult> {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const form = new FormData()
      form.append('upload', file, fileName)
      form.append('book_uuid', bookUuid)
      form.append('doc_name', fileName)
      const { res, json } = await this.request('/v1/book/upload/mixed', { method: 'POST', body: form })
      const ok = res.ok && (json?.status === undefined || json.status === 200)
      if (ok) return { docUuid: pickUuid(json), duplicate: false }
      if (isDuplicateUpload(json)) return { docUuid: pickUuid(json), duplicate: true }
      const err = classifyUploadError(res.status, json)
      // Possible propagation delay right after /book/add — one retry only.
      if (err.kind === 'book_not_found' && attempt === 1) { await this.sleep(1500); continue }
      throw err
    }
    throw new OcrolusError('book_not_found', 'Book not found after retry')
  }

  async getDetectSignals(bookUuid: string): Promise<unknown> {
    const { res, json } = await this.request(`/v2/detect/book/${encodeURIComponent(bookUuid)}/signals`)
    if (!res.ok) throw new OcrolusError('http', `Detect signals failed: ${json?.message ?? `HTTP ${res.status}`}`, res.status, json?.code)
    return unwrap(json)
  }

  async getCashFlowFeatures(bookUuid: string): Promise<unknown> {
    const { res, json } = await this.request(`/v2/book/${encodeURIComponent(bookUuid)}/cash_flow_features`)
    if (!res.ok) throw new OcrolusError('http', `Cash flow features failed: ${json?.message ?? `HTTP ${res.status}`}`, res.status, json?.code)
    return unwrap(json)
  }
}
