/**
 * Issue 6 — structural invariants of the endpoint policy table, so a future
 * edit cannot quietly weaken the guarantees the audit asked for.
 */
import { describe, expect, it } from 'vitest'

import { RATE_POLICIES } from '../ratelimit-policies'
import type { RatePolicy } from '../ratelimit-core'

const all = Object.values(RATE_POLICIES) as RatePolicy[]

describe('RATE_POLICIES', () => {
  it('every policy id matches its key', () => {
    for (const [key, p] of Object.entries(RATE_POLICIES)) expect(p.id).toBe(key)
  })

  it('every policy has at least one dimension with a positive window and max', () => {
    for (const p of all) {
      expect(p.dimensions.length).toBeGreaterThan(0)
      for (const d of p.dimensions) {
        expect(d.max).toBeGreaterThan(0)
        expect(d.windowMs).toBeGreaterThan(0)
      }
    }
  })

  it('global (provider-budget) dimensions are always evaluated LAST', () => {
    // So a caller already blocked on their own quota never spends the shared budget.
    for (const p of all) {
      const idx = p.dimensions.findIndex((d) => d.by === 'global')
      if (idx !== -1) expect(p.dimensions.slice(idx).every((d) => d.by === 'global')).toBe(true)
    }
  })

  it('the AI policy is shared, fail-closed, per-user and carries a provider budget', () => {
    const ai = RATE_POLICIES['ai-explain']
    expect(ai.store).toBe('shared')
    expect(ai.onStoreFailure).toBe('fail-closed')
    expect(ai.dimensions[0]!.by).toBe('user')
    expect(ai.dimensions.some((d) => d.by === 'global')).toBe(true)
  })

  it('only the coarse backstop and the cron guard are allowed to be memory-only', () => {
    const memoryOnly = all.filter((p) => p.store === 'memory').map((p) => p.id).sort()
    expect(memoryOnly).toEqual(['cron', 'global-ip'])
  })

  it('authenticated-operation policies key on the user first, with a larger IP backstop', () => {
    for (const id of ['ai-explain', 'search', 'report-read', 'export-generate', 'bulk-mutation', 'upload-ticket'] as const) {
      const p = RATE_POLICIES[id] as RatePolicy
      const user = p.dimensions.find((d) => d.by === 'user')
      const ip = p.dimensions.find((d) => d.by === 'ip')
      expect(user).toBeDefined()
      expect(ip).toBeDefined()
      expect(p.dimensions[0]!.by).toBe('user')
      // shared networks: the IP ceiling must comfortably exceed one user's.
      expect(ip!.max).toBeGreaterThanOrEqual(user!.max * 5)
    }
  })

  it('public e-mail-sending policies limit per address, per IP and against a global e-mail budget', () => {
    for (const id of ['public-newsletter', 'public-contact'] as const) {
      const scopes = (RATE_POLICIES[id] as RatePolicy).dimensions.map((d) => d.by)
      expect(scopes).toContain('identifier')
      expect(scopes).toContain('ip')
      expect(scopes).toContain('global')
    }
  })

  it('the global IP backstop is no longer low enough to lock out a school behind one NAT', () => {
    const d = RATE_POLICIES['global-ip'].dimensions[0]!
    expect(d.max / (d.windowMs / 60_000)).toBeGreaterThanOrEqual(100) // ≥ 100 requests/minute per address
  })

  it('429 messages never mention infrastructure', () => {
    for (const p of all) {
      const texts = [p.message, ...p.dimensions.map((d) => d.message ?? '')]
      for (const t of texts) expect(t).not.toMatch(/redis|upstash|instance|lambda|vercel|serverless/i)
    }
  })
})
