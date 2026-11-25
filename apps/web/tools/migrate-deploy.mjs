#!/usr/bin/env node
/*
 * apps/web/tools/migrate-deploy.mjs
 *
 * Applies pending Prisma migrations as part of a PRODUCTION Vercel build.
 *
 * [WHY — 2026-11-25]
 *   The build was `prisma generate && next build`: it generated a client that
 *   knows about every model in schema.prisma but never touched the database.
 *   A migration committed to the repo (20261122180000_maneb_candidate_registration)
 *   therefore never reached production, and the new code failed at runtime with
 *   P2021 "The table `public.maneb_registrations` does not exist".
 *   Running `prisma migrate deploy` before `next build` means a deploy can no
 *   longer ship code that is ahead of the schema — and if a migration fails,
 *   the build fails and the previous deployment keeps serving traffic.
 *
 * [BEHAVIOUR]
 *   • Only runs when VERCEL_ENV === 'production'. Preview and local builds skip
 *     it, so a preview deployment can never alter the production database.
 *   • Needs DIRECT_URL (the non-pooled Neon connection string — migrations take
 *     an advisory lock that Neon's pgbouncer pooler does not support). If it is
 *     missing the step is skipped with a loud warning rather than blocking the
 *     deploy, because skipping is what the build did before this script existed.
 *   • SKIP_DB_MIGRATE=1 turns the step off (e.g. to ship a hotfix while a
 *     migration is being reviewed).
 *   • `migrate deploy` only applies migrations that are already committed; it
 *     never creates, resets or drops anything on its own.
 */
import { spawnSync } from 'node:child_process'

const isProduction = process.env.VERCEL_ENV === 'production'

if (!isProduction) {
  console.log(`[migrate-deploy] skipped (VERCEL_ENV=${process.env.VERCEL_ENV ?? 'unset'}, not production).`)
  process.exit(0)
}

if (process.env.SKIP_DB_MIGRATE === '1') {
  console.log('[migrate-deploy] skipped (SKIP_DB_MIGRATE=1).')
  process.exit(0)
}

if (!process.env.DIRECT_URL) {
  console.warn(
    '[migrate-deploy] WARNING: DIRECT_URL is not set in this environment, so pending migrations were NOT applied.\n' +
    '                 Add DIRECT_URL (Neon direct, non-pooled connection string) to the Vercel Production environment,\n' +
    '                 or run `pnpm --filter web db:migrate:deploy` yourself before relying on new tables/columns.',
  )
  process.exit(0)
}

console.log('[migrate-deploy] applying pending Prisma migrations to production…')
const result = spawnSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], { stdio: 'inherit', shell: process.platform === 'win32' })

if (result.status !== 0) {
  console.error('[migrate-deploy] prisma migrate deploy failed — aborting the build so code is not deployed ahead of its schema.')
  process.exit(result.status ?? 1)
}
console.log('[migrate-deploy] done.')
