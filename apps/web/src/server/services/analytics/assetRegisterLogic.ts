/**
 * Pure asset-register maths (no database access).
 *
 * Measures, so the report and the Assets screen agree:
 *   • Register valuation  = Σ acquisitionCost of rows that are not DISPOSED —
 *     the same rule as assetService.getInventoryStats(). Rows with no cost are
 *     counted separately, never valued at 0 silently.
 *   • Units               = Σ quantity (a bulk line such as "40 chairs" is one
 *     register row but 40 units).
 *   • Status / condition  = the lifecycle fields as stored. "Damaged" is a
 *     condition, "lost", "under repair" and "disposed" are statuses, and
 *     "unassigned" means in store — nothing is re-derived.
 */
import type {
  ApiAssetCountRow,
  ApiAssetCustodianRow,
  ApiAssetLocationRow,
  ApiAssetRecord,
  AssetFlag,
} from '@shared/types/reporting-operations'
import { round } from '@/server/services/reporting/kpi'

export const ASSET_STATUSES = ['IN_STORE', 'ALLOCATED', 'UNDER_REPAIR', 'LOST', 'DISPOSED'] as const
export const ASSET_CONDITIONS = ['NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED'] as const
export const WARRANTY_WINDOW_DAYS = 90
export const NO_LOCATION = 'No recorded location'
export const RECORD_CAP = 200

const DAY_MS = 86_400_000

export interface AssetHolder {
  name: string
  kind: ApiAssetCustodianRow['kind']
  /** Staff account id when the holder is a person (lets a report filter by custodian). */
  uid: string | null
}

export interface AssetRow {
  id: string
  name: string
  assetTag: string | null
  category: string
  status: string
  condition: string
  quantity: number
  acquisitionCost: number | null
  warrantyExpiry: Date | null
  buildingName: string | null
  roomName: string | null
  roomId: string | null
  departmentName: string | null
  /** Legacy free-text location. */
  locationText: string | null
  holder: AssetHolder | null
}

export const humanize = (s: string): string => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ')

const isDisposed = (r: AssetRow) => r.status === 'DISPOSED'
const units = (r: AssetRow) => (Number.isFinite(r.quantity) && r.quantity > 0 ? r.quantity : 1)

export function locationLabel(r: AssetRow): string {
  if (r.roomName) return r.buildingName ? `${r.buildingName} · ${r.roomName}` : r.roomName
  if (r.departmentName) return `${r.departmentName} (department)`
  if (r.locationText && r.locationText.trim()) return r.locationText.trim()
  return NO_LOCATION
}

/** Which attention flags apply to one row. */
export function assetFlags(r: AssetRow, now: Date): AssetFlag[] {
  const flags: AssetFlag[] = []
  const active = !isDisposed(r)
  if (r.condition === 'DAMAGED' && active && r.status !== 'LOST') flags.push('damaged')
  if (r.status === 'UNDER_REPAIR') flags.push('under_repair')
  if (r.status === 'LOST') flags.push('lost')
  if (active && r.warrantyExpiry) {
    const ms = r.warrantyExpiry.getTime() - now.getTime()
    if (ms >= 0 && ms <= WARRANTY_WINDOW_DAYS * DAY_MS) flags.push('warranty_expiring')
  }
  if (active && locationLabel(r) === NO_LOCATION) flags.push('no_location')
  if (r.status === 'ALLOCATED' && !r.holder) flags.push('no_custodian')
  if (active && r.acquisitionCost === null) flags.push('no_cost')
  return flags
}

/** Flags that mean the asset needs someone to act (a missing cost is a data-quality note only). */
const ACTION_FLAGS: readonly AssetFlag[] = ['damaged', 'under_repair', 'lost', 'warranty_expiring', 'no_location', 'no_custodian']

function countRows(keys: readonly string[], rows: readonly AssetRow[], pick: (r: AssetRow) => string): ApiAssetCountRow[] {
  const m = new Map<string, { count: number; units: number }>(keys.map((k) => [k, { count: 0, units: 0 }]))
  for (const r of rows) {
    const k = pick(r)
    const cur = m.get(k) ?? { count: 0, units: 0 }
    cur.count += 1
    cur.units += units(r)
    m.set(k, cur)
  }
  return Array.from(m, ([key, v]) => ({ key, label: humanize(key), count: v.count, units: v.units }))
}

export function summariseRegister(rows: readonly AssetRow[], now: Date) {
  const live = rows.filter((r) => !isDisposed(r))
  const recordedCost = live.reduce((s, r) => s + (r.acquisitionCost ?? 0), 0)

  const attention: Record<AssetFlag, number> = {
    damaged: 0, under_repair: 0, lost: 0, warranty_expiring: 0, no_location: 0, no_custodian: 0, no_cost: 0,
  }
  const flagged = rows.map((r) => ({ r, flags: assetFlags(r, now) }))
  for (const f of flagged) for (const flag of f.flags) attention[flag] += 1

  const byCategory = countRows([], rows, (r) => r.category).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))

  // Locations: assets that still exist (not disposed). Lost items are listed against
  // the place they were last recorded so they stay traceable.
  const locations = new Map<string, ApiAssetLocationRow>()
  for (const { r, flags } of flagged) {
    if (isDisposed(r)) continue
    const label = locationLabel(r)
    const key = r.roomId ? `room:${r.roomId}` : `label:${label}`
    const cur = locations.get(key) ?? {
      key, label, roomId: r.roomId, department: r.departmentName, assets: 0, units: 0, recordedCost: 0, needsAttention: 0,
    }
    cur.assets += 1
    cur.units += units(r)
    cur.recordedCost += r.acquisitionCost ?? 0
    if (flags.some((f) => ACTION_FLAGS.includes(f))) cur.needsAttention += 1
    locations.set(key, cur)
  }

  // Custodians: who is responsible for the assets that are out of store.
  const custodians = new Map<string, ApiAssetCustodianRow>()
  for (const r of rows) {
    if (!r.holder || isDisposed(r) || r.status === 'LOST') continue
    const key = `${r.holder.kind}:${r.holder.uid ?? r.holder.name}`
    const cur = custodians.get(key) ?? { key, uid: r.holder.uid, label: r.holder.name, kind: r.holder.kind, assets: 0, units: 0 }
    cur.assets += 1
    cur.units += units(r)
    custodians.set(key, cur)
  }

  const records: ApiAssetRecord[] = flagged
    .filter((f) => f.flags.some((x) => ACTION_FLAGS.includes(x)))
    .sort((a, b) => b.flags.length - a.flags.length || a.r.name.localeCompare(b.r.name))
    .map(({ r, flags }) => ({
      id: r.id,
      name: r.name,
      assetTag: r.assetTag,
      category: r.category,
      status: r.status,
      condition: r.condition,
      quantity: units(r),
      location: locationLabel(r),
      custodian: r.holder?.name ?? null,
      acquisitionCost: r.acquisitionCost,
      warrantyExpiry: r.warrantyExpiry ? r.warrantyExpiry.toISOString() : null,
      flags,
    }))

  return {
    totals: {
      assets: rows.length,
      units: rows.reduce((s, r) => s + units(r), 0),
      recordedCost: round(recordedCost, 2),
      withoutCost: attention.no_cost,
      needsAction: records.length,
    },
    byStatus: countRows(ASSET_STATUSES, rows, (r) => r.status),
    byCondition: countRows(ASSET_CONDITIONS, rows, (r) => r.condition),
    byCategory,
    attention,
    byLocation: Array.from(locations.values())
      .map((l) => ({ ...l, recordedCost: round(l.recordedCost, 2) }))
      .sort((a, b) => b.needsAttention - a.needsAttention || b.assets - a.assets || a.label.localeCompare(b.label)),
    byCustodian: Array.from(custodians.values()).sort((a, b) => b.assets - a.assets || a.label.localeCompare(b.label)),
    records: records.slice(0, RECORD_CAP),
    recordsTruncated: records.length > RECORD_CAP,
  }
}

/**
 * The person or place accountable for an asset: its active assignment when it
 * has one, otherwise the custodian of the room it is kept in.
 */
export function resolveHolder(
  activeAssignment: { type: string; staffName: string | null; staffUid?: string | null; departmentName: string | null; roomName: string | null; legacyText: string | null } | null,
  roomCustodianName: string | null,
  roomCustodianUid: string | null = null,
): AssetHolder | null {
  if (activeAssignment) {
    if (activeAssignment.type === 'STAFF' && activeAssignment.staffName) return { name: activeAssignment.staffName, kind: 'staff', uid: activeAssignment.staffUid ?? null }
    if (activeAssignment.type === 'DEPARTMENT') {
      const n = activeAssignment.departmentName ?? activeAssignment.legacyText
      if (n) return { name: n, kind: 'department', uid: null }
    }
    if (activeAssignment.type === 'ROOM') {
      const n = activeAssignment.roomName ?? activeAssignment.legacyText
      if (n) return { name: n, kind: 'room', uid: null }
    }
  }
  return roomCustodianName ? { name: roomCustodianName, kind: 'room-custodian', uid: roomCustodianUid } : null
}
