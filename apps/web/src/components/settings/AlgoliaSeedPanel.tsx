'use client'
import { useState }   from 'react'
import { getAuth }    from 'firebase/auth'
import { Loader2, RefreshCw, CheckCircle, AlertTriangle, Settings2 } from 'lucide-react'

// [ALGOLIA ROLLOUT — items 2/6/7/8/10/11] Route slugs are listed explicitly
// (rather than derived via `seed-${entity}`) since several of these don't
// kebab-case-match the camelCase entity key the /status response uses
// (seed-user-accounts vs userAccounts, seed-placements vs placements for
// the university_placements index).
type Entity =
  | 'students' | 'staff' | 'books' | 'userAccounts'
  | 'applications' | 'invoices' | 'placements' | 'assets' | 'announcements'

interface SeedState {
  status:  'idle' | 'loading' | 'success' | 'error'
  indexed: number
  message: string
}

const ENTITY_LABELS: Record<Entity, string> = {
  students:      'Students',
  staff:         'Staff Profiles',
  books:         'Library Books',
  userAccounts:  'User Accounts',
  applications:  'Applications',
  invoices:      'Invoices',
  placements:    'University Placements',
  assets:        'Assets & Inventory',
  announcements: 'Announcements',
}

const ENTITY_ROUTE_SLUGS: Record<Entity, string> = {
  students:      'seed-students',
  staff:         'seed-staff',
  books:         'seed-books',
  userAccounts:  'seed-user-accounts',
  applications:  'seed-applications',
  invoices:      'seed-invoices',
  placements:    'seed-placements',
  assets:        'seed-assets',
  announcements: 'seed-announcements',
}

async function seedEntity(entity: Entity): Promise<{ indexed: number }> {
  const token = await getAuth().currentUser?.getIdToken()
  const res   = await fetch(`/api/algolia-admin/${ENTITY_ROUTE_SLUGS[entity]}`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token ?? ''}` },
  })
  const body = await res.json().catch(() => null) as { indexed?: number; error?: string } | null
  // [FIX] The route now distinguishes "Algolia not configured" (503) from
  // "configured but the write failed" (502) and sends a real `error`
  // message in the body for both — surface it instead of a bare status
  // code, so a misconfigured server env is diagnosable from this panel
  // rather than looking like an unexplained failure.
  if (!res.ok) throw new Error(body?.error ?? `Seed failed: ${res.status}`)
  return { indexed: body?.indexed ?? 0 }
}

// [ALGOLIA ROLLOUT — Tier 2 item 8] Firestore-backed entities (announcements)
// have no cheap Postgres count() — /status simply omits that key, so this
// is a Partial, and the "X in DB" badge below only renders where a count
// actually came back.
async function getStatus(): Promise<{ postgres: Partial<Record<Entity, number>> }> {
  const token = await getAuth().currentUser?.getIdToken()
  const res   = await fetch('/api/algolia-admin/status', {
    headers: { Authorization: `Bearer ${token ?? ''}` },
  })
  if (!res.ok) throw new Error('Status check failed')
  return res.json() as Promise<{ postgres: Partial<Record<Entity, number>> }>
}

type ConfigureState = { status: 'idle' | 'loading' | 'success' | 'error'; message: string }

export function AlgoliaSeedPanel() {
  const [states, setStates] = useState<Record<Entity, SeedState>>({
    students:      { status: 'idle', indexed: 0, message: '' },
    staff:         { status: 'idle', indexed: 0, message: '' },
    books:         { status: 'idle', indexed: 0, message: '' },
    userAccounts:  { status: 'idle', indexed: 0, message: '' },
    applications:  { status: 'idle', indexed: 0, message: '' },
    invoices:      { status: 'idle', indexed: 0, message: '' },
    placements:    { status: 'idle', indexed: 0, message: '' },
    assets:        { status: 'idle', indexed: 0, message: '' },
    announcements: { status: 'idle', indexed: 0, message: '' },
  })
  const [dbCounts, setDbCounts] = useState<Partial<Record<Entity, number>> | null>(null)
  const [checkingStatus, setCheckingStatus] = useState(false)
  const [configureState, setConfigureState] = useState<ConfigureState>({ status: 'idle', message: '' })

  async function seed(entity: Entity) {
    setStates((p) => ({ ...p, [entity]: { status: 'loading', indexed: 0, message: '' } }))
    try {
      const { indexed } = await seedEntity(entity)
      setStates((p) => ({ ...p, [entity]: { status: 'success', indexed, message: `${indexed} records indexed` } }))
    } catch (err) {
      setStates((p) => ({ ...p, [entity]: { status: 'error', indexed: 0, message: err instanceof Error ? err.message : 'Failed' } }))
    }
  }

  // [ALGOLIA ROLLOUT — Tier 0] Pushes searchableAttributes/
  // attributesForFaceting/replicas for every declared index. Run this at
  // least once before relying on any facet filter or sort-order dropdown —
  // see algoliaService.ts's INDEX_CONFIGS / configureAllIndices() comments.
  async function configureIndices() {
    setConfigureState({ status: 'loading', message: '' })
    try {
      const token = await getAuth().currentUser?.getIdToken()
      const res   = await fetch('/api/algolia-admin/configure-indices', {
        method:  'POST',
        headers: { Authorization: `Bearer ${token ?? ''}` },
      })
      const body = await res.json().catch(() => null) as { error?: string } | null
      if (!res.ok) throw new Error(body?.error ?? `Configure failed: ${res.status}`)
      setConfigureState({ status: 'success', message: 'Facets, searchable attributes, and sort-order replicas are up to date.' })
    } catch (err) {
      setConfigureState({ status: 'error', message: err instanceof Error ? err.message : 'Failed' })
    }
  }

  async function checkStatus() {
    setCheckingStatus(true)
    try {
      const { postgres } = await getStatus()
      setDbCounts(postgres)
    } catch { /* ignore */ }
    finally { setCheckingStatus(false) }
  }

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-base rounded-2xl p-5 space-y-4">
        <div>
          <h3 className="font-heading font-semibold text-brand-navy">Algolia Search Index</h3>
          <p className="text-xs text-muted mt-0.5">
            Bulk-seed search indices from the live Neon database. Safe to re-run, existing records are overwritten.
          </p>
        </div>

        <div className="border border-dashed border-base rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-brand-navy">Configure index settings</p>
              <p className="text-xs text-muted mt-0.5">Facets, searchable attributes &amp; sort-order replicas. Run this once, and again any time a new facet or sort order is added.</p>
            </div>
          </div>
          {configureState.status === 'success' && (
            <div className="flex items-center gap-1.5 text-xs text-brand-teal">
              <CheckCircle className="w-3.5 h-3.5" /> {configureState.message}
            </div>
          )}
          {configureState.status === 'error' && (
            <div className="flex items-center gap-1.5 text-xs text-brand-coral">
              <AlertTriangle className="w-3.5 h-3.5" /> {configureState.message}
            </div>
          )}
          <button
            onClick={configureIndices}
            disabled={configureState.status === 'loading'}
            className="flex items-center justify-center gap-2 py-2 px-4 text-xs font-semibold bg-brand-navy text-white rounded-lg disabled:opacity-50 hover:bg-brand-navy/80 transition-colors"
          >
            {configureState.status === 'loading'
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Configuring…</>
              : <><Settings2 className="w-3.5 h-3.5" /> Configure Indices</>
            }
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {(Object.keys(ENTITY_LABELS) as Entity[]).map((entity) => {
            const s = states[entity]
            return (
              <div key={entity} className="border border-base rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-brand-navy">{ENTITY_LABELS[entity]}</p>
                  {dbCounts && dbCounts[entity] !== undefined && (
                    <span className="text-xs text-muted">{dbCounts[entity]} in DB</span>
                  )}
                </div>

                {s.status === 'success' && (
                  <div className="flex items-center gap-1.5 text-xs text-brand-teal">
                    <CheckCircle className="w-3.5 h-3.5" />
                    {s.message}
                  </div>
                )}
                {s.status === 'error' && (
                  <div className="flex items-center gap-1.5 text-xs text-brand-coral">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {s.message}
                  </div>
                )}

                <button
                  onClick={() => seed(entity)}
                  disabled={s.status === 'loading'}
                  className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold bg-brand-navy text-white rounded-lg disabled:opacity-50 hover:bg-brand-navy/80 transition-colors"
                >
                  {s.status === 'loading'
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Indexing…</>
                    : <><RefreshCw className="w-3.5 h-3.5" /> Seed Index</>
                  }
                </button>
              </div>
            )
          })}
        </div>

        <button
          onClick={checkStatus}
          disabled={checkingStatus}
          className="flex items-center gap-2 text-xs text-muted hover:text-brand-navy transition-colors"
        >
          {checkingStatus ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Check database record counts
        </button>
      </div>
    </div>
  )
}