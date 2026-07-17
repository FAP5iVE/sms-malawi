'use client'
import { useState }   from 'react'
import { getAuth }    from 'firebase/auth'
import { Loader2, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react'

type Entity = 'students' | 'staff' | 'books'

interface SeedState {
  status:  'idle' | 'loading' | 'success' | 'error'
  indexed: number
  message: string
}

const ENTITY_LABELS: Record<Entity, string> = {
  students: 'Students',
  staff:    'Staff Profiles',
  books:    'Library Books',
}

async function seedEntity(entity: Entity): Promise<{ indexed: number }> {
  const token = await getAuth().currentUser?.getIdToken()
  const res   = await fetch(`/api/algolia-admin/seed-${entity}`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token ?? ''}` },
  })
  if (!res.ok) throw new Error(`Seed failed: ${res.status}`)
  return res.json() as Promise<{ indexed: number }>
}

async function getStatus(): Promise<{ postgres: Record<Entity, number> }> {
  const token = await getAuth().currentUser?.getIdToken()
  const res   = await fetch('/api/algolia-admin/status', {
    headers: { Authorization: `Bearer ${token ?? ''}` },
  })
  if (!res.ok) throw new Error('Status check failed')
  return res.json() as Promise<{ postgres: Record<Entity, number> }>
}

export function AlgoliaSeedPanel() {
  const [states, setStates] = useState<Record<Entity, SeedState>>({
    students: { status: 'idle', indexed: 0, message: '' },
    staff:    { status: 'idle', indexed: 0, message: '' },
    books:    { status: 'idle', indexed: 0, message: '' },
  })
  const [dbCounts, setDbCounts] = useState<Record<Entity, number> | null>(null)
  const [checkingStatus, setCheckingStatus] = useState(false)

  async function seed(entity: Entity) {
    setStates((p) => ({ ...p, [entity]: { status: 'loading', indexed: 0, message: '' } }))
    try {
      const { indexed } = await seedEntity(entity)
      setStates((p) => ({ ...p, [entity]: { status: 'success', indexed, message: `${indexed} records indexed` } }))
    } catch (err) {
      setStates((p) => ({ ...p, [entity]: { status: 'error', indexed: 0, message: err instanceof Error ? err.message : 'Failed' } }))
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
            Bulk-seed search indices from the live Neon database. Safe to re-run — existing records are overwritten.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(Object.keys(ENTITY_LABELS) as Entity[]).map((entity) => {
            const s = states[entity]
            return (
              <div key={entity} className="border border-base rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-brand-navy">{ENTITY_LABELS[entity]}</p>
                  {dbCounts && (
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