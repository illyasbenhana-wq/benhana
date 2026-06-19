import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey, hasScope, ApiKeyScope, ApiKeyRecord } from './api-keys'
import { checkRateLimit } from './rate-limiter'

export interface PartnerContext {
  orgId: string
  keyId: string
  scopes: ApiKeyScope[]
}

export async function requirePartnerAuth(
  req: NextRequest,
  requiredScope: ApiKeyScope
): Promise<{ context: PartnerContext } | { error: NextResponse }> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer etho_ak_')) {
    return {
      error: NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Missing or invalid API key. Use: Authorization: Bearer etho_ak_...' } },
        { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } }
      ),
    }
  }

  const key = authHeader.slice(7)
  const record = await validateApiKey(key)

  if (!record) {
    return {
      error: NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Invalid, expired, or revoked API key' } },
        { status: 401 }
      ),
    }
  }

  // Rate limiting
  const limit = checkRateLimit(record.id, record.rateLimitRpm)
  if (!limit.allowed) {
    return {
      error: NextResponse.json(
        { error: { code: 'RATE_LIMITED', message: `Rate limit exceeded. Limit: ${record.rateLimitRpm} requests/minute` } },
        {
          status: 429,
          headers: {
            'Retry-After': Math.ceil((limit.resetAt.getTime() - Date.now()) / 1000).toString(),
            'X-RateLimit-Limit': record.rateLimitRpm.toString(),
            'X-RateLimit-Remaining': '0',
          },
        }
      ),
    }
  }

  // Scope check
  if (!hasScope(record.scopes, requiredScope)) {
    return {
      error: NextResponse.json(
        { error: { code: 'FORBIDDEN', message: `API key missing required scope: ${requiredScope}` } },
        { status: 403 }
      ),
    }
  }

  return {
    context: {
      orgId: record.organizationId,
      keyId: record.id,
      scopes: record.scopes,
    },
  }
}
