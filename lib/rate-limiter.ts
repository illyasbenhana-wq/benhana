// In-memory sliding window rate limiter.
// State resets on serverless cold start — acceptable for v1.

const windows = new Map<string, number[]>()

const WINDOW_MS = 60_000

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: Date
}

export function checkRateLimit(keyId: string, rpm: number): RateLimitResult {
  const now = Date.now()
  const windowStart = now - WINDOW_MS

  let timestamps = windows.get(keyId)
  if (!timestamps) {
    timestamps = []
    windows.set(keyId, timestamps)
  }

  // Evict expired entries
  while (timestamps.length > 0 && timestamps[0] < windowStart) {
    timestamps.shift()
  }
  if (timestamps.length === 0) windows.delete(keyId)

  const remaining = Math.max(0, rpm - timestamps.length)
  const resetAt = new Date(now + WINDOW_MS)

  if (timestamps.length >= rpm) {
    return { allowed: false, remaining: 0, resetAt }
  }

  timestamps.push(now)
  return { allowed: true, remaining: remaining - 1, resetAt }
}
