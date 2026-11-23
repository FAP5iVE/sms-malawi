/**
 * Assets, stocktakes, procurement and inventory reports — run end to end against
 * a controlled dataset whose figures were worked out by hand, then checked
 * against each other and against Finance's open-commitment calculation.
 *
 * Procurement scenario (all inside the window):
 *   PR-1 approved, est 95,000   PO-1 PARTIALLY_RECEIVED  100,000  6/10 received → received 60,000, open 40,000 (late)
 *                               expense 60,000 approved + paid
 *   PR-2 closed,   est 210,000  PO-2 FULLY_RECEIVED      200,000  5/5            → received 200,000
 *                               expenses 150,000 paid + 50,000 owed (approved, unpaid) + 1,000 pending
 *   PR-3 approved, est 40,000   PO-3 PENDING_APPROVAL     40,000  not ordered yet
 *   PR-4 under review, est 50,000
 *   PR-5 approved, est 80,000   PO-4 CANCELLED after approval 80,000, 2/8 received → received 20,000, released 60,000
 *   ordered 380,000 = received 280,000 + released 60,000 + open 40,000
 */
import { describe, it, expect, vi } from 'vitest'
import { makeFakePrisma } from '../../../../../test/fakePrisma'

const NOW = Date.now()
const ago = (d: number) => new Date(NOW - d * 86_400_000)

const buildingMain = { name: 'Main' }
const roomLab = { id: 'r-lab', name: 'Lab', building: buildingMain, buildingId: 'b-main', departmentId: 'd-sci', custodianUid: 'u-banda', custodian: { firstName: 'Tiyamike', lastName: 'Banda' } }
const roomStore = { id: 'r-store', name: 'Store', building: buildingMain, buildingId: 'b-main', departmentId: null, custodianUid: null, custodian: null }
const dept = { name: 'Science' }

const asset = (id: string, over: Record<string, unknown> = {}) => ({
  id, name: `Asset ${id}`, assetTag: `T-${id}`, category: 'FURNITURE', status: 'IN_STORE', condition: 'GOOD', quantity: 1,
  acquisitionCost: 1000, warrantyExpiry: null, location: null, acquisitionDate: ago(100),
  roomId: 'r-store', roomRef: roomStore, departmentId: null, departmentRef: null, assignments: [], ...over,
})

const assets = [
  asset('a1', { quantity: 40, acquisitionCost: 400_000 }),
  asset('a2', { status: 'ALLOCATED', category: 'IT_EQUIPMENT', acquisitionCost: 900_000, roomId: 'r-lab', roomRef: roomLab, departmentId: 'd-sci', departmentRef: dept,
    assignments: [{ status: 'ACTIVE', assignedToType: 'STAFF', departmentOrRoom: null, staff: { uid: 'u-phiri', firstName: 'Mary', lastName: 'Phiri' }, departmentRef: null, roomRef: null }] }),
  asset('a3', { status: 'ALLOCATED', category: 'IT_EQUIPMENT', acquisitionCost: 500_000, roomId: 'r-lab', roomRef: roomLab, departmentId: 'd-sci', departmentRef: dept }), // no assignment → room custodian
  asset('a4', { condition: 'DAMAGED', acquisitionCost: 50_000 }),
  asset('a5', { status: 'UNDER_REPAIR', category: 'VEHICLE', acquisitionCost: 8_000_000, acquisitionDate: ago(400) }),
  asset('a6', { status: 'LOST', acquisitionCost: 20_000 }),
  asset('a7', { status: 'DISPOSED', acquisitionCost: 700_000, condition: 'DAMAGED' }),
  asset('a8', { roomId: null, roomRef: null, acquisitionCost: null }),
]

const line = (o: number, r: number, total: number, c = 0) => ({ quantityOrdered: o, quantityReceived: r, quantityCancelled: c, lineTotal: total })
const supplier = { name: 'Acme' }
const pos = [
  { id: 'po1', poNumber: 'PO-1', status: 'PARTIALLY_RECEIVED', approvedAt: ago(20), expectedDeliveryDate: ago(7), supplier, lines: [line(10, 6, 100_000)] },
  { id: 'po2', poNumber: 'PO-2', status: 'FULLY_RECEIVED', approvedAt: ago(40), expectedDeliveryDate: ago(30), supplier, lines: [line(5, 5, 200_000)] },
  { id: 'po3', poNumber: 'PO-3', status: 'PENDING_APPROVAL', approvedAt: null, expectedDeliveryDate: null, supplier, lines: [line(4, 0, 40_000)] },
  { id: 'po4', poNumber: 'PO-4', status: 'CANCELLED', approvedAt: ago(50), expectedDeliveryDate: null, supplier, lines: [line(8, 2, 80_000)] },
]
const req = (id: string, status: string, est: number, purchaseOrders: unknown[], submittedAgo = 30) => ({
  id, requisitionNumber: `PR-${id}`, status, submittedAt: ago(submittedAgo), createdAt: ago(submittedAgo + 1), departmentId: 'd-sci',
  department: dept, lines: [{ estimatedTotal: est }], purchaseOrders,
})
const requisitions = [
  req('1', 'APPROVED', 95_000, [pos[0]]),
  req('2', 'CLOSED', 210_000, [pos[1]]),
  req('3', 'APPROVED', 40_000, [pos[2]]),
  req('4', 'UNDER_REVIEW', 50_000, [], 12),
  req('5', 'APPROVED', 80_000, [pos[3]]),
]
const expenses = [
  { purchaseOrderId: 'po1', status: 'APPROVED', amount: 60_000, paidAt: ago(2) },
  { purchaseOrderId: 'po2', status: 'APPROVED', amount: 150_000, paidAt: ago(20) },
  { purchaseOrderId: 'po2', status: 'APPROVED', amount: 50_000, paidAt: null },
  { purchaseOrderId: 'po2', status: 'PENDING', amount: 1_000, paidAt: null },
  { purchaseOrderId: null, status: 'APPROVED', amount: 999_999, paidAt: ago(1) }, // direct expense — not procurement
]

const stocktakes = [
  { id: 's1', stocktakeNumber: 'ST-1', academicYear: '2025/2026', term: 2, status: 'COMPLETED', roomId: 'r-lab', departmentId: 'd-sci', startedByUid: 'u-banda', custodianUid: null,
    startedAt: ago(10), completedAt: ago(8), createdAt: ago(11), room: roomLab, department: dept,
    lines: [{ expectedQuantity: 60, actualQuantity: 56 }, { expectedQuantity: 40, actualQuantity: 40 }],
    variances: [{ status: 'OPEN', varianceType: 'SHORTAGE', varianceQuantity: -4 }] },
  { id: 's2', stocktakeNumber: 'ST-2', academicYear: '2025/2026', term: 2, status: 'IN_PROGRESS', roomId: 'r-store', departmentId: null, startedByUid: null, custodianUid: null,
    startedAt: ago(30), completedAt: null, createdAt: ago(31), room: roomStore, department: null,
    lines: [{ expectedQuantity: 10, actualQuantity: 10 }], variances: [] },
  { id: 's3', stocktakeNumber: 'ST-3', academicYear: '2024/2025', term: 2, status: 'COMPLETED', roomId: 'r-lab', departmentId: 'd-sci', startedByUid: null, custodianUid: null,
    startedAt: ago(400), completedAt: ago(399), createdAt: ago(401), room: roomLab, department: dept, lines: [], variances: [] },
]

const tx = (id: string, itemId: string, type: string, qty: number, agoD: number) => ({
  id, inventoryItemId: itemId, transactionType: type, quantity: qty, createdAt: ago(agoD),
  sourceRoomId: null, destinationRoomId: null, departmentId: null, reason: null, sourceRoom: null, destinationRoom: null, department: null,
})

vi.mock('@/lib/prisma', () => ({
  prisma: makeFakePrisma({
    asset: assets,
    assetRequest: [{ status: 'PENDING' }, { status: 'PENDING' }, { status: 'APPROVED' }],
    assetAdvance: [{ status: 'PENDING', amount: 30_000 }, { status: 'RECONCILED', amount: 99_000 }],
    stocktake: stocktakes,
    room: [roomLab, roomStore, { id: 'r-hall', name: 'Hall', building: { name: 'Annex' }, buildingId: 'b-annex', departmentId: null, isActive: true }, { id: 'r-old', name: 'Old', building: buildingMain, buildingId: 'b-main', departmentId: null, isActive: false }]
      .map((r) => ({ isActive: true, ...r })),
    staffProfile: [{ uid: 'u-banda', firstName: 'Tiyamike', lastName: 'Banda' }],
    purchaseRequisition: requisitions,
    purchaseOrder: pos,
    expense: expenses,
    inventoryItem: [
      { id: 'i1', itemCode: 'CH-1', name: 'Chalk', category: 'Stationery', unitOfMeasure: 'box', reorderLevel: 20, reorderQuantity: 40, isActive: true },
      { id: 'i2', itemCode: 'PN-1', name: 'Pens', category: 'Stationery', unitOfMeasure: 'box', reorderLevel: 5, reorderQuantity: 10, isActive: true },
    ],
    inventoryTransaction: [tx('t1', 'i1', 'OPENING_BALANCE', 50, 60), tx('t2', 'i1', 'ISSUE', 35, 3), tx('t3', 'i2', 'RECEIPT', 100, 2)],
  }),
}))

const { getAssetRegisterReport, getProcurementValue, getStockReport, getStocktakeReport } = await import ('../operationsAnalytics')
const { openCommitments } = await import ('../financeAnalytics')

describe('asset register report', () => {
  it('totals agree with the register: valuation excludes disposed rows only', async () => {
    const r = await getAssetRegisterReport({}, { advances: true })
    expect(r.totals).toEqual({ assets: 8, units: 47, recordedCost: 400_000 + 900_000 + 500_000 + 50_000 + 8_000_000 + 20_000, withoutCost: 1, needsAction: 4 })
    expect(r.byStatus.map((s) => [s.key, s.count])).toEqual([['IN_STORE', 3], ['ALLOCATED', 2], ['UNDER_REPAIR', 1], ['LOST', 1], ['DISPOSED', 1]])
    expect(r.byStatus.reduce((t, s) => t + s.count, 0)).toBe(r.totals.assets)
  })

  it('resolves custodians: assignment first, then the room custodian', async () => {
    const r = await getAssetRegisterReport({}, { advances: true })
    expect(r.byCustodian.map((c) => [c.label, c.kind, c.assets]).sort()).toEqual([['Mary Phiri', 'staff', 1], ['Tiyamike Banda', 'room-custodian', 1]])
    expect(r.attention).toMatchObject({ damaged: 1, under_repair: 1, lost: 1, no_location: 1, no_custodian: 0 })
  })

  it('locations roll up to the same assets as the status counts (disposed excluded)', async () => {
    const r = await getAssetRegisterReport({}, { advances: true })
    expect(r.byLocation.reduce((t, l) => t + l.assets, 0)).toBe(7)
    expect(r.byLocation.find((l) => l.label === 'Main · Lab')).toMatchObject({ assets: 2, recordedCost: 1_400_000 })
  })

  it('filters narrow every figure consistently', async () => {
    const lab = await getAssetRegisterReport({ roomId: 'r-lab' }, { advances: true })
    expect(lab.totals.assets).toBe(2)
    expect(lab.byStatus.find((s) => s.key === 'ALLOCATED')?.count).toBe(2)
    const dept = await getAssetRegisterReport({ departmentId: 'd-sci' }, { advances: true })
    expect(dept.totals.assets).toBe(2)
    const old = await getAssetRegisterReport({ to: new Date(NOW - 200 * 86_400_000).toISOString().slice(0, 10) }, { advances: true })
    expect(old.totals.assets).toBe(1) // only a5 was acquired > 200 days ago
    const custodian = await getAssetRegisterReport({ custodianUid: 'u-banda' }, { advances: true })
    expect(custodian.totals.assets).toBe(2) // both lab assets are in his room
  })

  it('outstanding advances are only returned to a caller allowed to see them', async () => {
    expect((await getAssetRegisterReport({}, { advances: true })).requests).toEqual({ pending: 2, outstandingAdvances: 30_000 })
    expect((await getAssetRegisterReport({}, { advances: false })).requests).toEqual({ pending: 2, outstandingAdvances: null })
  })
})

describe('stocktake report', () => {
  it('reports the period’s stocktakes, variances and room coverage', async () => {
    const r = await getStocktakeReport({ academicYear: '2025/2026' })
    expect(r.totals).toMatchObject({ stocktakes: 2, incomplete: 1, stale: 1, lines: 3, expected: 110, counted: 106, netVariance: -4, varianceLines: 1, unresolvedVariances: 1 })
    expect(r.coverage).toMatchObject({ activeRooms: 3, counted: 1, inProgress: 1, notStarted: 1 })
    expect(r.coverage.notStartedRooms.map((x) => x.label)).toEqual(['Annex · Hall'])
    expect(r.rows.find((x) => x.id === 's1')?.responsible).toBe('Tiyamike Banda')
    expect(r.rows.find((x) => x.id === 's2')).toMatchObject({ stale: true, openDays: 30 })
  })

  it('filters by room and ignores other academic years', async () => {
    const lab = await getStocktakeReport({ academicYear: '2025/2026', roomId: 'r-lab' })
    expect(lab.rows.map((x) => x.id)).toEqual(['s1'])
    expect(lab.coverage.activeRooms).toBe(1)
    const prior = await getStocktakeReport({ academicYear: '2024/2025' })
    expect(prior.rows.map((x) => x.id)).toEqual(['s3'])
    expect(prior.totals.varianceRate).toBeNull()
  })
})

describe('procurement value report', () => {
  it('keeps requested, approved, ordered, received, expensed and paid as separate measures', async () => {
    const r = await getProcurementValue({ days: 365 })
    const v = (k: string) => r.stages.find((s) => s.key === k)?.value
    expect(v('requested')).toBe(95_000 + 210_000 + 40_000 + 50_000 + 80_000)
    expect(v('approved')).toBe(95_000 + 210_000 + 40_000 + 80_000)
    expect(v('ordered')).toBe(380_000)
    expect(v('received')).toBe(280_000)
    expect(v('expensed')).toBe(260_000)
    expect(v('paid')).toBe(210_000)
  })

  it('ordered = received + released + open, and open equals Finance’s open commitments', async () => {
    const r = await getProcurementValue({ days: 365 })
    expect(r.orders).toEqual({ ordered: 380_000, received: 280_000, released: 60_000, open: 40_000, reconciles: true })
    const finance = await openCommitments()
    expect(r.openNow).toEqual(finance)
    expect(r.openNow.value).toBe(r.orders.open)
  })

  it('does not count direct (non-procurement) expenses or unapproved ones as procurement spend', async () => {
    const r = await getProcurementValue({ days: 365 })
    expect(r.expenses).toMatchObject({ approved: 260_000, paid: 210_000, payable: 50_000, pendingApproval: 1_000, receivedNotExpensed: 20_000, expensedAheadOfDelivery: 0 })
  })

  it('shows what is waiting, late and part-delivered', async () => {
    const r = await getProcurementValue({ days: 365 })
    expect(r.awaitingApproval).toEqual({ requisitions: { count: 1, value: 50_000, oldestDays: 12 }, purchaseOrders: { count: 1, value: 40_000 } })
    expect(r.delayed.map((p) => [p.poNumber, p.daysLate])).toEqual([['PO-1', 7]])
    expect(r.partiallyDelivered.map((p) => p.poNumber)).toEqual(['PO-1'])
  })

  it('the requisition table sums to the stage totals', async () => {
    const r = await getProcurementValue({ days: 365 })
    expect(r.requisitions.reduce((t, x) => t + x.ordered, 0)).toBe(380_000)
    expect(r.requisitions.reduce((t, x) => t + x.received, 0)).toBe(280_000)
    expect(r.requisitions.reduce((t, x) => t + x.paid, 0)).toBe(210_000)
  })

  it('a department filter with no requisitions reports null values, not zeros', async () => {
    const r = await getProcurementValue({ days: 365, departmentId: 'd-none' })
    expect(r.stages.every((s) => s.value === null && s.count === 0)).toBe(true)
  })

  it('a window that excludes everything is empty', async () => {
    const r = await getProcurementValue({ days: 365, from: '2000-01-01', to: '2000-12-31' })
    expect(r.stages[0]?.count).toBe(0)
  })
})

describe('stock level report', () => {
  it('uses transaction-derived balances and explains low stock with the window’s movements', async () => {
    const r = await getStockReport({ days: 30 })
    expect(r.totals).toMatchObject({ items: 2, belowReorder: 1, outOfStock: 0, withoutReorderLevel: 0 })
    expect(r.low).toHaveLength(1)
    expect(r.low[0]).toMatchObject({ itemCode: 'CH-1', balance: 15, reorderLevel: 20, shortfall: 5, issuedInWindow: 35, netChangeInWindow: -35 })
    expect(r.movements.map((m) => m.id)).toEqual(['t3', 't2'])
    expect(r.movementsByType.map((m) => [m.type, m.count])).toEqual([['ISSUE', 1], ['RECEIPT', 1]])
  })

  it('a longer window brings in older movements; a category filter narrows the items', async () => {
    const wide = await getStockReport({ days: 90 })
    expect(wide.movements).toHaveLength(3)
    const none = await getStockReport({ days: 30, category: 'Nope' })
    expect(none.totals.items).toBe(0)
    expect(none.low).toEqual([])
  })
})
