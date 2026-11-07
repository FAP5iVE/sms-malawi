/**
 * apps/web/src/lib/ratelimit-policies.ts
 *
 * [CHANGE TYPE]: NEW FILE (Issue 6)
 *
 * The endpoint inventory, as data. One entry per KIND of operation, sized by
 * what a single abusive caller could cost (provider quota, database time,
 * e-mail reputation, storage) — not one low limit shared by everything, so an
 * unrelated workflow can never starve another.
 *
 * Reading the table
 *   user — verified uid. The primary key on every authenticated route, so a
 *          school behind one NAT is never throttled as a single caller.
 *   ip   — a coarse backstop on authenticated routes (set well above the
 *          per-user figure × a plausible number of staff on one network) and the
 *          primary key on public routes.
 *   identifier — e.g. the e-mail being subscribed.
 *   global — a deployment-wide PROVIDER BUDGET.
 *
 *   store 'shared' = Redis (one quota across every serverless instance).
 *   store 'memory' = per instance — acceptable ONLY for the coarse volumetric
 *   backstop, where Vercel's edge already absorbs real floods.
 *
 *   Failure: 'fail-closed' → 503 when the shared store is unreachable;
 *   'local-fallback' → keep serving at half the limits from instance memory.
 *
 * | policy              | endpoints                                         | why this shape                                   |
 * |---------------------|---------------------------------------------------|--------------------------------------------------|
 * | global-ip           | every /api route                                  | volumetric backstop only; memory is fine         |
 * | login-telemetry     | POST /auth/log-login-failed (unauthenticated)     | audit-log spam; service also caps per identifier |
 * | public-application  | POST /applications/public                         | DB write, unauthenticated; shared-network friendly|
 * | public-newsletter   | POST /public/newsletter/subscribe                 | sends e-mail → per-address + provider budget     |
 * | public-contact      | POST /public/contact                              | sends e-mail to the school inbox                 |
 * | ai-explain          | POST /placements/advisory/explain                 | Gemini quota; fail-closed (UI has a non-AI path) |
 * | search              | GET /search/fallback                              | Algolia / Postgres `contains` per keystroke      |
 * | report-read         | /reports/*, /reporting/*, /analytics/*            | wide aggregate queries                           |
 * | export-generate     | POST /exams/report-card[/mine]                    | PDF render + storage write                       |
 * | bulk-mutation       | bulk invoices, payroll run, MANEB bulk/recompute, | many writes per request                          |
 * |                     | Algolia (re)seeding                               |                                                  |
 * | upload-ticket       | every upload-ticket route                        | mints storage credentials                        |
 * | guardian-staff      | /guardians/* writes (approve, revoke, ...)        | staff decisions; modest per-user cap             |
 * | guardian-invite     | POST /guardians/links/:id/invitations             | mints credentials and may send e-mail            |
 * | guardian-claim      | POST /guardian-claim (public)                     | credential guessing; fail-closed on store loss   |
 * | parent-read         | GET /parent/* (guardian reads)                    | public-facing; per-user with a larger IP backstop|
 * | cron                | /api/cron/* supplementary guard                   | legacy tier                                      |
 */

import type { RatePolicy } from './ratelimit-core'

const MIN = 60_000
const HOUR = 60 * MIN

export const RATE_POLICIES = {
  'global-ip': {
    id: 'global-ip',
    // [Issue 6] Was 300 / 15 min per IP. A whole school behind one NAT shares
    // one address: ~100 people × a dashboard that makes ~10 calls per page
    // exhausted that in minutes and locked out legitimate staff. Real
    // per-caller quotas now live in the per-user policies below; this is only
    // the runaway-client / volumetric backstop.
    dimensions: [{ by: 'ip', windowMs: 15 * MIN, max: 3000 }],
    store: 'memory',
    onStoreFailure: 'local-fallback',
    message: 'Too many requests — please slow down.',
  },

  'login-telemetry': {
    id: 'login-telemetry',
    dimensions: [{ by: 'ip', windowMs: MIN, max: 10 }],
    store: 'shared',
    onStoreFailure: 'local-fallback',
    message: 'Too many attempts — please wait a moment.',
  },

  'public-application': {
    id: 'public-application',
    // A family submits one or two applications; a school computer lab or
    // internet café can legitimately submit many from one address.
    dimensions: [{ by: 'ip', windowMs: 10 * MIN, max: 15 }],
    store: 'shared',
    onStoreFailure: 'local-fallback',
    message: 'Too many applications submitted from this network — please try again later.',
  },

  'public-newsletter': {
    id: 'public-newsletter',
    dimensions: [
      { by: 'identifier', windowMs: HOUR, max: 3, message: 'A confirmation e-mail was already sent to this address — please check your inbox.' },
      { by: 'ip', windowMs: 10 * MIN, max: 10 },
      { by: 'global', windowMs: HOUR, max: 300, alertAtRatio: 0.8, message: 'Subscriptions are busy right now — please try again later.' },
    ],
    store: 'shared',
    onStoreFailure: 'local-fallback',
    message: 'Too many requests — please try again later.',
  },

  'public-contact': {
    id: 'public-contact',
    dimensions: [
      { by: 'identifier', windowMs: HOUR, max: 5 },
      { by: 'ip', windowMs: 10 * MIN, max: 5 },
      { by: 'global', windowMs: HOUR, max: 200, alertAtRatio: 0.8, message: 'The contact form is busy right now — please try again later or contact us by phone.' },
    ],
    store: 'shared',
    onStoreFailure: 'local-fallback',
    message: 'Too many messages sent — please try again later.',
  },

  'ai-explain': {
    id: 'ai-explain',
    // Gemini free tier ≈ 10–15 requests/minute for the WHOLE deployment, so a
    // per-user figure alone cannot protect it: five users at 6/5 min each can
    // still exhaust the shared quota. The global bucket sits just under the
    // provider ceiling and is evaluated LAST, so a user already over their own
    // limit never spends it.
    dimensions: [
      { by: 'user', windowMs: 5 * MIN, max: 6 },
      { by: 'ip', windowMs: 5 * MIN, max: 60 },
      {
        by: 'global', windowMs: MIN, max: 12, alertAtRatio: 0.8,
        message: 'The AI explanation is busy right now — please try again in a minute, or read the standard explanation above.',
      },
    ],
    store: 'shared',
    // Real money / provider quota at stake, and the UI has a non-AI path.
    onStoreFailure: 'fail-closed',
    message: 'AI explanations are limited to a few per few minutes — please wait a moment, or read the standard explanation above.',
    slowMs: 20_000,
  },

  search: {
    id: 'search',
    dimensions: [
      { by: 'user', windowMs: MIN, max: 90 },
      { by: 'ip', windowMs: MIN, max: 900 },
    ],
    store: 'shared',
    onStoreFailure: 'local-fallback',
    message: 'Too many searches — please wait a moment.',
  },

  'report-read': {
    id: 'report-read',
    dimensions: [
      { by: 'user', windowMs: MIN, max: 90 },
      { by: 'ip', windowMs: MIN, max: 900 },
    ],
    store: 'shared',
    onStoreFailure: 'local-fallback',
    message: 'Too many report requests — please wait a moment.',
    slowMs: 10_000,
  },

  'export-generate': {
    id: 'export-generate',
    dimensions: [
      { by: 'user', windowMs: 10 * MIN, max: 60 },
      { by: 'ip', windowMs: 10 * MIN, max: 400 },
    ],
    store: 'shared',
    onStoreFailure: 'local-fallback',
    message: 'Too many documents requested — please wait a few minutes.',
    slowMs: 30_000,
  },

  'bulk-mutation': {
    id: 'bulk-mutation',
    dimensions: [
      { by: 'user', windowMs: 10 * MIN, max: 10 },
      { by: 'ip', windowMs: 10 * MIN, max: 60 },
    ],
    store: 'shared',
    // Month-end invoicing / payroll must not stop because a cache is down;
    // both are also guarded by database constraints and idempotency.
    onStoreFailure: 'local-fallback',
    message: 'Too many bulk operations — please wait a few minutes before running another.',
    slowMs: 30_000,
  },

  'upload-ticket': {
    id: 'upload-ticket',
    dimensions: [
      { by: 'user', windowMs: 10 * MIN, max: 40 },
      { by: 'ip', windowMs: 10 * MIN, max: 300 },
    ],
    store: 'shared',
    onStoreFailure: 'local-fallback',
    message: 'Too many uploads started — please wait a few minutes.',
  },

  // ── Guardian portal ────────────────────────────────────────────────────────
  'guardian-staff': {
    id: 'guardian-staff',
    dimensions: [
      { by: 'user', windowMs: 10 * MIN, max: 120 },
      { by: 'ip', windowMs: 10 * MIN, max: 600 },
    ],
    store: 'shared',
    onStoreFailure: 'local-fallback',
    message: 'Too many guardian changes — please wait a few minutes.',
  },

  'guardian-invite': {
    id: 'guardian-invite',
    dimensions: [
      { by: 'user', windowMs: 10 * MIN, max: 30 },
      { by: 'ip', windowMs: 10 * MIN, max: 150 },
    ],
    store: 'shared',
    onStoreFailure: 'local-fallback',
    message: 'Too many invitations issued — please wait a few minutes.',
  },

  // Unauthenticated and guessable-by-design (a short code), so it is the strictest
  // policy: a small per-IP allowance, a deployment-wide ceiling, and FAIL-CLOSED when
  // the shared store is unreachable (never "serve anyway"). The invitation row also
  // locks itself after a few wrong secrets; this is the layer above that.
  'guardian-claim': {
    id: 'guardian-claim',
    dimensions: [
      { by: 'ip', windowMs: 15 * MIN, max: 10 },
      { by: 'global', windowMs: HOUR, max: 300 },
    ],
    store: 'shared',
    onStoreFailure: 'fail-closed',
    message: 'Too many attempts — please wait a while before trying again.',
  },

  'parent-read': {
    id: 'parent-read',
    dimensions: [
      { by: 'user', windowMs: 10 * MIN, max: 240 },
      { by: 'ip', windowMs: 10 * MIN, max: 1500 },
    ],
    store: 'shared',
    onStoreFailure: 'local-fallback',
    message: 'Too many requests — please slow down.',
  },

  cron: {
    id: 'cron',
    dimensions: [{ by: 'global', windowMs: 10 * MIN, max: 3 }],
    store: 'memory',
    onStoreFailure: 'local-fallback',
    message: 'Cron rate limit exceeded.',
  },
} as const satisfies Record<string, RatePolicy>

export type RatePolicyId = keyof typeof RATE_POLICIES
