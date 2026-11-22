import { describe, it, expect } from 'vitest'
import { assetFlags, locationLabel, resolveHolder, summariseRegister, type AssetRow } from '../assetRegisterLogic'

const NOW = new Date('2026-03-10T00:00:00Z')
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000)

const asset = (over: Partial<AssetRow> & { id: string }): AssetRow => ({
  name: `Asset ${over.id}`,
  assetTag: `TAG-${over.id}`,
  category: 'FURNITURE',
  status: 'IN_STORE',
  condition: 'GOOD',
  quantity: 1,
  acquisitionCost: 1000,
  warrantyExpiry: null,
  buildingName: 'Main',
  roomName: 'Store',
  roomId: 'r-store',
  departmentName: null,
  locationText: null,
  holder: null,
  ...over,
})

const register: AssetRow[] = [
  asset({ id: 'a1', quantity: 40, acquisitionCost: 400_000 }), // 40 chairs in store
  asset({ id: 'a2', status: 'ALLOCATED', category: 'IT_EQUIPMENT', acquisitionCost: 900_000, roomName: 'Lab', roomId: 'r-lab', holder: { name: 'Mr Banda', kind: 'staff', uid: 'u-banda' } }),
  asset({ id: 'a3', status: 'ALLOCATED', category: 'IT_EQUIPMENT', acquisitionCost: 500_000, roomName: 'Lab', roomId: 'r-lab', holder: null }), // allocated, no custodian
  asset({ id: 'a4', condition: 'DAMAGED', acquisitionCost: 50_000 }),
  asset({ id: 'a5', status: 'UNDER_REPAIR', category: 'VEHICLE', acquisitionCost: 8_000_000 }),
  asset({ id: 'a6', status: 'LOST', acquisitionCost: 20_000 }),
  asset({ id: 'a7', status: 'DISPOSED', acquisitionCost: 700_000, condition: 'DAMAGED' }),
  asset({ id: 'a8', roomName: null, roomId: null, buildingName: null, acquisitionCost: null, warrantyExpiry: days(30) }), // no location, no cost, warranty soon
]

describe('asset register', () => {
  it('valuation excludes disposed rows only and never values a missing cost as 0 silently', () => {
    const s = summariseRegister(register, NOW)
    // 400,000 + 900,000 + 500,000 + 50,000 + 8,000,000 + 20,000 (lost still on the register); a7 disposed; a8 has no cost
    expect(s.totals.recordedCost).toBe(9_870_000)
    expect(s.totals.withoutCost).toBe(1)
    expect(s.totals.assets).toBe(8)
  })

  it('counts units, not just rows, for bulk lines', () => {
    expect(summariseRegister(register, NOW).totals.units).toBe(47) // 40 + 7 single items
  })

  it('reports every lifecycle status and condition, including zero counts', () => {
    const s = summariseRegister([asset({ id: 'x' })], NOW)
    expect(s.byStatus.map((r) => r.key)).toEqual(['IN_STORE', 'ALLOCATED', 'UNDER_REPAIR', 'LOST', 'DISPOSED'])
    expect(s.byStatus.find((r) => r.key === 'LOST')).toMatchObject({ count: 0, units: 0 })
    expect(s.byCondition.map((r) => r.key)).toEqual(['NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED'])
  })

  it('byStatus counts add up to the register size', () => {
    const s = summariseRegister(register, NOW)
    expect(s.byStatus.reduce((t, r) => t + r.count, 0)).toBe(s.totals.assets)
    expect(s.byCondition.reduce((t, r) => t + r.count, 0)).toBe(s.totals.assets)
    expect(s.byCategory.reduce((t, r) => t + r.count, 0)).toBe(s.totals.assets)
  })

  it('flags damaged only while the asset still exists, plus repair, lost, warranty, location and custodian gaps', () => {
    const s = summariseRegister(register, NOW)
    expect(s.attention).toMatchObject({
      damaged: 1, // a4; a7 is disposed
      under_repair: 1,
      lost: 1,
      warranty_expiring: 1,
      no_location: 1,
      no_custodian: 1, // a3
      no_cost: 1,
    })
  })

  it('does not flag a warranty that already expired or is far away', () => {
    expect(assetFlags(asset({ id: 'w1', warrantyExpiry: days(-5) }), NOW)).not.toContain('warranty_expiring')
    expect(assetFlags(asset({ id: 'w2', warrantyExpiry: days(200) }), NOW)).not.toContain('warranty_expiring')
  })

  it('groups assets by location, leaving disposed items out, and lists attention-heavy locations first', () => {
    const s = summariseRegister(register, NOW)
    const keys = s.byLocation.map((l) => l.label)
    expect(keys).not.toContain('')
    const store = s.byLocation.find((l) => l.label === 'Main · Store')
    // a1, a4, a5, a6 are in the store (a7 disposed)
    expect(store).toMatchObject({ assets: 4, units: 43, recordedCost: 8_470_000 })
    expect(s.byLocation.find((l) => l.label === 'No recorded location')?.assets).toBe(1)
    expect(s.byLocation.reduce((t, l) => t + l.assets, 0)).toBe(7) // 8 rows − 1 disposed
  })

  it('lists custodians for out-of-store assets only', () => {
    const s = summariseRegister(register, NOW)
    expect(s.byCustodian).toEqual([{ key: 'staff:u-banda', uid: 'u-banda', label: 'Mr Banda', kind: 'staff', assets: 1, units: 1 }])
  })

  it('puts the assets needing action in the record list, most flags first, without data-quality-only rows', () => {
    const s = summariseRegister([...register, asset({ id: 'nc', acquisitionCost: null })], NOW)
    expect(s.records.map((r) => r.id)).not.toContain('nc') // only a missing cost
    expect(s.records.map((r) => r.id)).toContain('a8')
    expect(s.records[0]?.flags.length).toBeGreaterThanOrEqual(s.records[s.records.length - 1]?.flags.length ?? 0)
  })

  it('has no attention items and zero totals for an empty register', () => {
    const s = summariseRegister([], NOW)
    expect(s.totals).toEqual({ assets: 0, units: 0, recordedCost: 0, withoutCost: 0, needsAction: 0 })
    expect(s.records).toEqual([])
  })
})

describe('location and custodian resolution', () => {
  it('prefers the structured room, then department, then legacy text', () => {
    expect(locationLabel(asset({ id: 'l1' }))).toBe('Main · Store')
    expect(locationLabel(asset({ id: 'l2', roomName: null, buildingName: null, departmentName: 'Science' }))).toBe('Science (department)')
    expect(locationLabel(asset({ id: 'l3', roomName: null, buildingName: null, locationText: ' Staff room ' }))).toBe('Staff room')
  })

  it('uses the active assignment, falling back to the room custodian', () => {
    expect(resolveHolder({ type: 'STAFF', staffName: 'Ms Phiri', staffUid: 'u-phiri', departmentName: null, roomName: null, legacyText: null }, 'Mr Room')).toEqual({ name: 'Ms Phiri', kind: 'staff', uid: 'u-phiri' })
    expect(resolveHolder({ type: 'DEPARTMENT', staffName: null, departmentName: 'Science', roomName: null, legacyText: null }, null)).toEqual({ name: 'Science', kind: 'department', uid: null })
    expect(resolveHolder(null, 'Mr Room', 'u-room')).toEqual({ name: 'Mr Room', kind: 'room-custodian', uid: 'u-room' })
    expect(resolveHolder(null, null)).toBeNull()
  })
})
