'use client'

/*
 * apps/web/src/app/(auth)/assets/page.tsx
 *
 * [CHANGE TYPE]: NEW FILE
 * [R-PHASE]: R20 — Assets & Inventory Management
 * [PURPOSE]: Full UI for the new assets domain — asset register (CRUD),
 *   allocation/return, condition/disposal, self-service "my assigned
 *   items", and the equipment-requisition workflow. Follows the
 *   established page conventions from (auth)/library/page.tsx: RoleGuard
 *   at the page boundary, PermissionGuard around individual actions
 *   (never a second, redundant role check), hand-rolled modals (no
 *   dialog library in use elsewhere in this app), StatCard for the
 *   summary row.
 * [DEPENDS ON]: apps/web/src/hooks/useAssets.ts (same phase),
 *   apps/web/src/hooks/useHR.ts (useStaffDirectory — existing, for the
 *   allocation staff picker), packages/shared/types/permissions.ts
 *   (assets.* — same phase), packages/shared/constants/pageAccess.ts
 *   ('/assets' — same phase)
 */

import { useState } from 'react'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { ModuleSurface } from '@/components/shared/ModuleSurface'
import { PermissionGuard } from '@/components/shared/PermissionGuard'
import { StatCard, StatCardGrid } from '@/components/shared/StatCard'
import { useStaffDirectory } from '@/hooks/useHR'
import {
  useAssets,
  useAsset,
  useInventoryStats,
  useCreateAsset,
  useUpdateAsset,
  useMarkAssetCondition,
  useDisposeAsset,
  useAllocateAsset,
  useReturnAsset,
  useAssetAssignments,
  useMyAssignedAssets,
  useRoomInventory,
  useAssetRequests,
  useMyAssetRequests,
  useCreateAssetRequest,
  useApproveAssetRequest,
  useRejectAssetRequest,
  useRequestsByDepartment,
  useAdvances,
  useRecordAdvance,
  useReconcileAdvance,
  useWriteOffAdvance,
} from '@/hooks/useAssets'
import type { ApiAsset, ApiAssetAssignment, ApiAssetRequest } from '@shared/types/api'
import { formatMWK } from '@shared/constants/malawi'
import {
  Boxes,
  Plus,
  X as XIcon,
  Search,
  Wrench,
  Trash2,
  UserPlus,
  Undo2,
  ClipboardList,
  PackageCheck,
  PackageX,
  Check,
  Loader2,
  DoorOpen,
  HandCoins,
} from 'lucide-react'

const CATEGORIES = [
  'FURNITURE',
  'IT_EQUIPMENT',
  'LAB_EQUIPMENT',
  'SPORTS_EQUIPMENT',
  'KITCHEN_EQUIPMENT',
  'VEHICLE',
  'MAINTENANCE_TOOL',
  'OTHER',
]
const CONDITIONS = ['NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED']
const STATUSES = ['IN_STORE', 'ALLOCATED', 'UNDER_REPAIR', 'DISPOSED', 'LOST']

function humanize(s: string) {
  return s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ')
}

const STATUS_COLOR: Record<string, string> = {
  IN_STORE: 'bg-brand-teal/10 text-brand-teal',
  ALLOCATED: 'bg-brand-navy/10 text-brand-navy',
  UNDER_REPAIR: 'bg-amber-100 text-amber-700',
  DISPOSED: 'bg-base text-muted',
  LOST: 'bg-brand-coral/10 text-brand-coral',
}

type Tab = 'register' | 'rooms' | 'mine' | 'requests'
const TABS = [
  { id: 'register' as Tab, label: 'Register', icon: Boxes },
  { id: 'rooms' as Tab, label: 'By Room/Dept', icon: DoorOpen },
  { id: 'mine' as Tab, label: 'My Assigned', icon: PackageCheck },
  { id: 'requests' as Tab, label: 'Requests', icon: ClipboardList },
]

export default function AssetsPage() {
  return (
    <RoleGuard
      allowed={[
        'admin',
        'high_rank',
        'finance',
        'library',
        'lower_rank',
        'academic',
        'hr',
        'exam_officer',
      ]}
    >
      <AssetsContent />
    </RoleGuard>
  )
}

function AssetsContent() {
  const [tab, setTab] = useState<Tab>('register')
  const { data: stats } = useInventoryStats()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading font-bold text-xl text-brand-navy">Assets &amp; Inventory</h1>
          <p className="text-sm text-muted mt-0.5">
            Furniture, IT/lab/sports/kitchen equipment, vehicles and tools — not library books.
          </p>
        </div>
      </div>

      <ModuleSurface>
      <PermissionGuard permission="assets.viewInventoryReports">
        <StatCardGrid className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard
            index={0}
            label="Assets in store"
            icon={Boxes}
            value={stats ? (stats.byStatus.find((s) => s.status === 'IN_STORE')?.count ?? 0) : '…'}
          />
          <StatCard
            index={1}
            label="Currently allocated"
            icon={PackageCheck}
            iconColor="bg-brand-navy/10"
            iconText="text-brand-navy"
            value={stats ? (stats.byStatus.find((s) => s.status === 'ALLOCATED')?.count ?? 0) : '…'}
          />
          <StatCard
            index={2}
            label="Register valuation"
            icon={Wrench}
            iconColor="bg-amber-100"
            iconText="text-amber-700"
            value={stats ? formatMWK(stats.totalValuationMWK) : '…'}
            subLabel="excludes disposed items"
          />
          <StatCard
            index={3}
            label="Pending requests"
            icon={ClipboardList}
            iconColor="bg-brand-coral/10"
            iconText="text-brand-coral"
            value={stats ? stats.pendingRequests : '…'}
            href="/assets?tab=requests"
          />
          <PermissionGuard permission="assets.viewAdvances">
            <StatCard
              index={4}
              label="Outstanding advances"
              icon={HandCoins}
              iconColor="bg-amber-100"
              iconText="text-amber-700"
              value={stats ? formatMWK(stats.outstandingAdvancesMWK) : '…'}
              subLabel="not yet reconciled"
              href="/assets?tab=requests"
            />
          </PermissionGuard>
        </StatCardGrid>
      </PermissionGuard>

      <div className="flex gap-1 border-b border-base overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap min-h-11 ${
              tab === t.id
                ? 'border-brand-navy text-brand-navy'
                : 'border-transparent text-muted hover:text-brand-navy'
            }`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'register' && <RegisterTab />}
      {tab === 'rooms' && <RoomsTab />}
      {tab === 'mine' && <MyAssignedTab />}
      {tab === 'requests' && <RequestsTab />}
      </ModuleSurface>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// REGISTER TAB
// ═══════════════════════════════════════════════════════════

function RegisterTab() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('')
  const [formAsset, setFormAsset] = useState<ApiAsset | null | undefined>(undefined) // undefined = closed, null = create, ApiAsset = edit
  const [allocateAsset, setAllocateAsset] = useState<ApiAsset | null>(null)
  const [conditionAsset, setConditionAsset] = useState<ApiAsset | null>(null)
  const [detailAssetId, setDetailAssetId] = useState<string | null>(null)

  const { data: assets, isLoading } = useAssets({
    search: search || undefined,
    category: category || undefined,
    status: status || undefined,
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-50">
          <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            aria-label="Search assets"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, serial number, location…"
            className="w-full pl-9 border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11"
          />
        </div>
        <select
          aria-label="Filter by category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {humanize(c)}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </select>
        <PermissionGuard permission="assets.manageRegister">
          <button
            type="button"
            onClick={() => setFormAsset(null)}
            className="inline-flex items-center gap-1.5 bg-brand-navy text-white rounded-lg px-4 py-2.5 text-sm font-semibold min-h-11 shrink-0"
          >
            <Plus className="w-4 h-4" /> Add Asset
          </button>
        </PermissionGuard>
      </div>

      <div className="bg-surface border border-base rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-base text-left text-xs text-muted">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Qty</th>
              <th className="px-4 py-3 font-medium">Condition</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Location</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted">
                  <Loader2 className="w-5 h-5 animate-spin inline" />
                </td>
              </tr>
            )}
            {!isLoading && assets?.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted">
                  No assets match these filters.
                </td>
              </tr>
            )}
            {assets?.map((a) => (
              <tr key={a.id} className="border-b border-base last:border-0 hover:bg-page">
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setDetailAssetId(a.id)}
                    className="font-medium text-left hover:underline"
                  >
                    {a.name}
                  </button>
                  {a.serialNumber && <p className="text-xs text-muted">S/N {a.serialNumber}</p>}
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs bg-base rounded px-2 py-0.5">
                    {humanize(a.category)}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">{a.quantity}</td>
                <td className="px-4 py-3 text-xs">{humanize(a.condition)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`text-xs rounded px-2 py-0.5 font-medium ${STATUS_COLOR[a.status] ?? 'bg-base text-muted'}`}
                  >
                    {humanize(a.status)}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted text-xs">{a.location ?? '—'}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <PermissionGuard permission="assets.allocateItem">
                      {a.status === 'IN_STORE' && (
                        <button
                          type="button"
                          onClick={() => setAllocateAsset(a)}
                          aria-label={`Allocate ${a.name}`}
                          className="text-brand-teal min-h-11 min-w-11 flex items-center justify-center"
                        >
                          <UserPlus className="w-4 h-4" />
                        </button>
                      )}
                    </PermissionGuard>
                    <PermissionGuard permission="assets.markCondition">
                      <button
                        type="button"
                        onClick={() => setConditionAsset(a)}
                        aria-label={`Update condition of ${a.name}`}
                        className="text-muted min-h-11 min-w-11 flex items-center justify-center"
                      >
                        <Wrench className="w-4 h-4" />
                      </button>
                    </PermissionGuard>
                    <PermissionGuard permission="assets.manageRegister">
                      <button
                        type="button"
                        onClick={() => setFormAsset(a)}
                        aria-label={`Edit ${a.name}`}
                        className="text-brand-navy min-h-11 min-w-11 flex items-center justify-center text-xs font-semibold"
                      >
                        Edit
                      </button>
                    </PermissionGuard>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {formAsset !== undefined && (
        <AssetFormModal asset={formAsset} onClose={() => setFormAsset(undefined)} />
      )}
      {allocateAsset && (
        <AllocateModal asset={allocateAsset} onClose={() => setAllocateAsset(null)} />
      )}
      {conditionAsset && (
        <ConditionModal asset={conditionAsset} onClose={() => setConditionAsset(null)} />
      )}
      {detailAssetId && (
        <AssetDetailModal assetId={detailAssetId} onClose={() => setDetailAssetId(null)} />
      )}
    </div>
  )
}

function AssetFormModal({ asset, onClose }: { asset: ApiAsset | null; onClose: () => void }) {
  const createAsset = useCreateAsset()
  const updateAsset = useUpdateAsset()

  const [name, setName] = useState(asset?.name ?? '')
  const [category, setCategory] = useState(asset?.category ?? 'FURNITURE')
  const [serialNumber, setSerialNumber] = useState(asset?.serialNumber ?? '')
  const [quantity, setQuantity] = useState(asset?.quantity?.toString() ?? '1')
  const [condition, setCondition] = useState(asset?.condition ?? 'GOOD')
  const [location, setLocation] = useState(asset?.location ?? '')
  const [acquisitionCost, setAcquisitionCost] = useState(asset?.acquisitionCost?.toString() ?? '')
  const [supplier, setSupplier] = useState(asset?.supplier ?? '')
  const [notes, setNotes] = useState(asset?.notes ?? '')

  const pending = createAsset.isPending || updateAsset.isPending
  const error = createAsset.error ?? updateAsset.error

  function handleSave() {
    if (!name.trim()) return
    const data = {
      name: name.trim(),
      category: category as never,
      serialNumber: serialNumber.trim() || undefined,
      quantity: Number(quantity) || 1,
      condition: condition as never,
      location: location.trim() || undefined,
      acquisitionCost: acquisitionCost ? Number(acquisitionCost) : undefined,
      supplier: supplier.trim() || undefined,
      notes: notes.trim() || undefined,
    }
    if (asset) {
      updateAsset.mutate({ id: asset.id, data }, { onSuccess: onClose })
    } else {
      createAsset.mutate(data, { onSuccess: onClose })
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto bg-surface rounded-2xl shadow-xl">
        <div className="sticky top-0 z-10 bg-surface flex items-center justify-between px-6 py-4 border-b border-base">
          <h2 className="font-heading font-bold text-brand-navy">
            {asset ? 'Edit Asset' : 'Add Asset'}
          </h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 hover:bg-page rounded-lg">
            <XIcon className="w-4 h-4 text-muted" />
          </button>
        </div>
        <div className="p-6 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="asset-name" className="text-xs text-muted mb-1 block">
                Name
              </label>
              <input
                id="asset-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11"
              />
            </div>
            <div>
              <label htmlFor="asset-category" className="text-xs text-muted mb-1 block">
                Category
              </label>
              <select
                id="asset-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as never)}
                className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {humanize(c)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="asset-condition" className="text-xs text-muted mb-1 block">
                Condition
              </label>
              <select
                id="asset-condition"
                value={condition}
                onChange={(e) => setCondition(e.target.value as never)}
                className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11"
              >
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {humanize(c)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="asset-serial" className="text-xs text-muted mb-1 block">
                Serial Number{' '}
                <span className="text-muted/70">(individually-tracked items only)</span>
              </label>
              <input
                id="asset-serial"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11"
              />
            </div>
            <div>
              <label htmlFor="asset-qty" className="text-xs text-muted mb-1 block">
                Quantity
              </label>
              <input
                id="asset-qty"
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="asset-location" className="text-xs text-muted mb-1 block">
                Location <span className="text-muted/70">(while in store)</span>
              </label>
              <input
                id="asset-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Science Lab storeroom"
                className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11"
              />
            </div>
            <div>
              <label htmlFor="asset-cost" className="text-xs text-muted mb-1 block">
                Acquisition Cost (MWK)
              </label>
              <input
                id="asset-cost"
                type="number"
                min="0"
                value={acquisitionCost}
                onChange={(e) => setAcquisitionCost(e.target.value)}
                className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11"
              />
            </div>
            <div>
              <label htmlFor="asset-supplier" className="text-xs text-muted mb-1 block">
                Supplier
              </label>
              <input
                id="asset-supplier"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="asset-notes" className="text-xs text-muted mb-1 block">
                Notes
              </label>
              <textarea
                id="asset-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={pending || !name.trim()}
            className="w-full bg-brand-navy text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60 min-h-11"
          >
            {pending ? 'Saving…' : asset ? 'Save Changes' : 'Add to Register'}
          </button>
          {error && (
            <p className="text-sm text-brand-coral">
              {error instanceof Error ? error.message : 'Something went wrong.'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function AllocateModal({ asset, onClose }: { asset: ApiAsset; onClose: () => void }) {
  const allocate = useAllocateAsset()
  const { data: staff } = useStaffDirectory()
  const [assignedToType, setAssignedToType] = useState<'STAFF' | 'DEPARTMENT' | 'ROOM'>('STAFF')
  const [staffId, setStaffId] = useState('')
  const [departmentOrRoom, setDepartmentOrRoom] = useState('')
  const [notes, setNotes] = useState('')

  const valid = assignedToType === 'STAFF' ? !!staffId : !!departmentOrRoom.trim()

  function handleAllocate() {
    if (!valid) return
    allocate.mutate(
      {
        assetId: asset.id,
        data: {
          quantity: asset.quantity,
          assignedToType,
          staffId: staffId || undefined,
          departmentOrRoom: departmentOrRoom.trim() || undefined,
          notes: notes.trim() || undefined,
        },
      },
      { onSuccess: onClose }
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-surface rounded-2xl shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-base">
          <h2 className="font-heading font-bold text-brand-navy">Allocate — {asset.name}</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 hover:bg-page rounded-lg">
            <XIcon className="w-4 h-4 text-muted" />
          </button>
        </div>
        <div className="p-6 space-y-3">
          <div>
            <label htmlFor="allocate-type" className="text-xs text-muted mb-1 block">
              Assign to
            </label>
            <select
              id="allocate-type"
              value={assignedToType}
              onChange={(e) => setAssignedToType(e.target.value as never)}
              className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11"
            >
              <option value="STAFF">A staff member</option>
              <option value="DEPARTMENT">A department</option>
              <option value="ROOM">A room</option>
            </select>
          </div>
          {assignedToType === 'STAFF' ? (
            <div>
              <label htmlFor="allocate-staff" className="text-xs text-muted mb-1 block">
                Staff member
              </label>
              <select
                id="allocate-staff"
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11"
              >
                <option value="">Select…</option>
                {(
                  staff as
                    | { id: string; firstName: string; lastName: string; department: string }[]
                    | undefined
                )?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.firstName} {s.lastName} — {s.department}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label htmlFor="allocate-doR" className="text-xs text-muted mb-1 block">
                {assignedToType === 'DEPARTMENT' ? 'Department' : 'Room'} name
              </label>
              <input
                id="allocate-doR"
                value={departmentOrRoom}
                onChange={(e) => setDepartmentOrRoom(e.target.value)}
                className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11"
              />
            </div>
          )}
          <div>
            <label htmlFor="allocate-notes" className="text-xs text-muted mb-1 block">
              Notes
            </label>
            <textarea
              id="allocate-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page"
            />
          </div>
          <button
            type="button"
            onClick={handleAllocate}
            disabled={allocate.isPending || !valid}
            className="w-full bg-brand-navy text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60 min-h-11"
          >
            {allocate.isPending ? 'Allocating…' : 'Allocate'}
          </button>
          {allocate.error && (
            <p className="text-sm text-brand-coral">
              {allocate.error instanceof Error ? allocate.error.message : 'Something went wrong.'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function ConditionModal({ asset, onClose }: { asset: ApiAsset; onClose: () => void }) {
  const markCondition = useMarkAssetCondition()
  const disposeAsset = useDisposeAsset()
  const [condition, setCondition] = useState(asset.condition)
  const [notes, setNotes] = useState('')
  const [confirmDispose, setConfirmDispose] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-surface rounded-2xl shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-base">
          <h2 className="font-heading font-bold text-brand-navy">Condition — {asset.name}</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 hover:bg-page rounded-lg">
            <XIcon className="w-4 h-4 text-muted" />
          </button>
        </div>
        <div className="p-6 space-y-3">
          <div>
            <label htmlFor="condition-select" className="text-xs text-muted mb-1 block">
              Condition
            </label>
            <select
              id="condition-select"
              value={condition}
              onChange={(e) => setCondition(e.target.value as never)}
              className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11"
            >
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {humanize(c)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="condition-notes" className="text-xs text-muted mb-1 block">
              Notes
            </label>
            <textarea
              id="condition-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page"
            />
          </div>
          <button
            type="button"
            onClick={() =>
              markCondition.mutate(
                {
                  id: asset.id,
                  data: { condition: condition as never, notes: notes.trim() || undefined },
                },
                { onSuccess: onClose }
              )
            }
            disabled={markCondition.isPending}
            className="w-full bg-brand-navy text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60 min-h-11"
          >
            {markCondition.isPending ? 'Saving…' : 'Update Condition'}
          </button>
          {markCondition.error && (
            <p className="text-sm text-brand-coral">
              {markCondition.error instanceof Error
                ? markCondition.error.message
                : 'Something went wrong.'}
            </p>
          )}

          <PermissionGuard permission="assets.dispose">
            <div className="pt-4 mt-2 border-t border-base">
              {confirmDispose ? (
                <div className="flex items-center gap-3">
                  <p className="text-xs text-muted flex-1">
                    Mark this asset disposed? It leaves the active register (must not be currently
                    allocated).
                  </p>
                  <button
                    type="button"
                    disabled={disposeAsset.isPending}
                    onClick={() =>
                      disposeAsset.mutate(
                        { id: asset.id, data: { notes: notes.trim() || undefined } },
                        { onSuccess: onClose }
                      )
                    }
                    className="text-xs font-semibold text-brand-coral hover:underline shrink-0"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDispose(false)}
                    className="text-xs text-muted hover:underline shrink-0"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDispose(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-coral hover:underline"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Mark disposed
                </button>
              )}
              {disposeAsset.error && (
                <p className="text-sm text-brand-coral mt-2">
                  {disposeAsset.error instanceof Error
                    ? disposeAsset.error.message
                    : 'Something went wrong.'}
                </p>
              )}
            </div>
          </PermissionGuard>
        </div>
      </div>
    </div>
  )
}

function AssetDetailModal({ assetId, onClose }: { assetId: string; onClose: () => void }) {
  const { data: asset } = useAsset(assetId)
  const { data: assignments } = useAssetAssignments(assetId)
  const returnAsset = useReturnAsset()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto bg-surface rounded-2xl shadow-xl">
        <div className="sticky top-0 z-10 bg-surface flex items-center justify-between px-6 py-4 border-b border-base">
          <h2 className="font-heading font-bold text-brand-navy">{asset?.name ?? 'Asset'}</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 hover:bg-page rounded-lg">
            <XIcon className="w-4 h-4 text-muted" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {asset && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted">Category</p>
                <p>{humanize(asset.category)}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Status</p>
                <p>{humanize(asset.status)}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Condition</p>
                <p>{humanize(asset.condition)}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Quantity</p>
                <p>{asset.quantity}</p>
              </div>
              {asset.acquisitionCost !== undefined && (
                <div>
                  <p className="text-xs text-muted">Acquisition cost</p>
                  <p>{formatMWK(asset.acquisitionCost)}</p>
                </div>
              )}
              {asset.supplier && (
                <div>
                  <p className="text-xs text-muted">Supplier</p>
                  <p>{asset.supplier}</p>
                </div>
              )}
            </div>
          )}
          <div>
            <h3 className="text-xs font-semibold text-muted mb-2">Custody history</h3>
            <div className="space-y-2">
              {assignments?.length === 0 && <p className="text-xs text-muted">Never allocated.</p>}
              {assignments?.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between bg-page rounded-lg px-3 py-2 text-xs"
                >
                  <div>
                    <p className="font-medium">
                      {a.assignedToType === 'STAFF'
                        ? 'Staff member'
                        : (a.departmentOrRoom ?? a.assignedToType)}
                    </p>
                    <p className="text-muted">
                      {new Date(a.assignedAt).toLocaleDateString()}{' '}
                      {a.returnedAt
                        ? `→ ${new Date(a.returnedAt).toLocaleDateString()}`
                        : '(active)'}
                    </p>
                  </div>
                  <PermissionGuard permission="assets.allocateItem">
                    {a.status === 'ACTIVE' && (
                      <button
                        type="button"
                        disabled={returnAsset.isPending}
                        onClick={() => returnAsset.mutate({ assignmentId: a.id, data: {} })}
                        className="inline-flex items-center gap-1 text-brand-teal font-semibold min-h-11 px-2"
                      >
                        <Undo2 className="w-3.5 h-3.5" /> Return
                      </button>
                    )}
                  </PermissionGuard>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// BY ROOM / DEPARTMENT TAB
// ═══════════════════════════════════════════════════════════

function RoomsTab() {
  const { data: groups, isLoading } = useRoomInventory()

  if (isLoading)
    return (
      <div className="text-center py-8 text-muted">
        <Loader2 className="w-5 h-5 animate-spin inline" />
      </div>
    )

  if (groups?.length === 0) {
    return (
      <div className="bg-surface border border-base rounded-xl p-8 text-center text-muted text-sm">
        Nothing is currently allocated to a room or department.
      </div>
    )
  }

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {groups?.map((g) => (
        <div
          key={`${g.assignedToType}:${g.departmentOrRoom}`}
          className="bg-surface border border-base rounded-xl p-5"
        >
          <div className="flex items-center gap-2 mb-3">
            <DoorOpen className="w-4 h-4 text-brand-navy" />
            <h3 className="font-heading font-semibold text-sm text-brand-navy">
              {g.departmentOrRoom}
            </h3>
            <span className="text-xs bg-base rounded px-2 py-0.5 text-muted">
              {g.assignedToType === 'ROOM' ? 'Room' : 'Department'}
            </span>
          </div>
          <ul className="space-y-1.5">
            {g.items.map((item) => (
              <li key={item.id} className="flex items-center justify-between text-xs">
                <span>
                  {item.name}
                  {item.serialNumber ? ` (S/N ${item.serialNumber})` : ''}
                </span>
                <span className="text-muted">{humanize(item.condition)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// MY ASSIGNED TAB
// ═══════════════════════════════════════════════════════════

function MyAssignedTab() {
  const { data: assignments, isLoading } = useMyAssignedAssets()

  return (
    <div className="bg-surface border border-base rounded-xl overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-base text-left text-xs text-muted">
            <th className="px-4 py-3 font-medium">Asset</th>
            <th className="px-4 py-3 font-medium">Category</th>
            <th className="px-4 py-3 font-medium">Assigned</th>
            <th className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {isLoading && (
            <tr>
              <td colSpan={4} className="px-4 py-8 text-center text-muted">
                <Loader2 className="w-5 h-5 animate-spin inline" />
              </td>
            </tr>
          )}
          {!isLoading && assignments?.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-8 text-center text-muted">
                Nothing currently assigned to you.
              </td>
            </tr>
          )}
          {assignments?.map((a: ApiAssetAssignment) => (
            <tr key={a.id} className="border-b border-base last:border-0">
              <td className="px-4 py-3 font-medium">{a.asset?.name ?? '—'}</td>
              <td className="px-4 py-3">
                <span className="text-xs bg-base rounded px-2 py-0.5">
                  {a.asset ? humanize(a.asset.category) : '—'}
                </span>
              </td>
              <td className="px-4 py-3 text-muted text-xs">
                {new Date(a.assignedAt).toLocaleDateString()}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`text-xs rounded px-2 py-0.5 font-medium ${a.status === 'ACTIVE' ? 'bg-brand-navy/10 text-brand-navy' : 'bg-base text-muted'}`}
                >
                  {a.status === 'ACTIVE' ? 'With you' : 'Returned'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// REQUESTS TAB
// ═══════════════════════════════════════════════════════════

function RequestsTab() {
  const [showForm, setShowForm] = useState(false)
  const [deptFilter, setDeptFilter] = useState('')
  const { data: myRequests } = useMyAssetRequests()
  const { data: pendingRequests } = useAssetRequests({
    status: 'PENDING',
    department: deptFilter || undefined,
  })
  const { data: byDept } = useRequestsByDepartment()

  const pendingByDept = (byDept ?? []).filter((d) => d.status === 'PENDING')

  return (
    <div className="space-y-6">
      <PermissionGuard permission="assets.requestItem">
        <div className="bg-surface border border-base rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-heading font-semibold text-brand-navy text-sm">My Requests</h2>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-navy hover:underline"
            >
              <Plus className="w-3.5 h-3.5" /> New Request
            </button>
          </div>
          <div className="space-y-2">
            {myRequests?.length === 0 && (
              <p className="text-xs text-muted">You have not submitted any equipment requests.</p>
            )}
            {myRequests?.map((r: ApiAssetRequest) => (
              <div
                key={r.id}
                className="flex items-center justify-between bg-page rounded-lg px-3 py-2 text-xs"
              >
                <div>
                  <p className="font-medium">{r.title}</p>
                  <p className="text-muted">
                    {humanize(r.category)} · qty {r.quantity}
                    {r.department ? ` · ${r.department}` : ''}
                  </p>
                </div>
                <span
                  className={`rounded px-2 py-0.5 font-medium ${
                    r.status === 'PENDING'
                      ? 'bg-amber-100 text-amber-700'
                      : r.status === 'REJECTED'
                        ? 'bg-brand-coral/10 text-brand-coral'
                        : 'bg-brand-teal/10 text-brand-teal'
                  }`}
                >
                  {humanize(r.status)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </PermissionGuard>

      <PermissionGuard permission="assets.approveRequest">
        <div className="bg-surface border border-base rounded-xl p-5">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <h2 className="font-heading font-semibold text-brand-navy text-sm">Pending Review</h2>
            <input
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              placeholder="Filter by department…"
              className="border border-base rounded-lg px-3 py-1.5 text-xs bg-page min-h-9 w-48"
            />
          </div>
          {pendingByDept.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {pendingByDept.map((d) => (
                <button
                  key={d.department}
                  type="button"
                  onClick={() => setDeptFilter(d.department)}
                  className="text-xs bg-page rounded-full px-3 py-1 hover:bg-base"
                >
                  {d.department} <span className="font-semibold">({d.count})</span>
                </button>
              ))}
            </div>
          )}
          <div className="space-y-2">
            {pendingRequests?.length === 0 && (
              <p className="text-xs text-muted">
                No requests waiting for review{deptFilter ? ` for "${deptFilter}"` : ''}.
              </p>
            )}
            {pendingRequests?.map((r: ApiAssetRequest) => (
              <ReviewRequestRow key={r.id} request={r} />
            ))}
          </div>
        </div>
      </PermissionGuard>

      <PermissionGuard permission="assets.viewAdvances">
        <AdvancesPanel />
      </PermissionGuard>

      {showForm && <RequestFormModal onClose={() => setShowForm(false)} />}
    </div>
  )
}

function AdvancesPanel() {
  const { data: approvedRequests } = useAssetRequests({ status: 'APPROVED' })
  const { data: pendingAdvances } = useAdvances('PENDING')
  const [advancingRequestId, setAdvancingRequestId] = useState<string | null>(null)
  const reconcile = useReconcileAdvance()
  const writeOff = useWriteOffAdvance()

  return (
    <div className="bg-surface border border-base rounded-xl p-5">
      <h2 className="font-heading font-semibold text-brand-navy text-sm mb-3">
        Procurement Advances
      </h2>

      <PermissionGuard permission="assets.manageAdvances">
        {approvedRequests && approvedRequests.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-muted mb-2">Approved — awaiting procurement</p>
            <div className="space-y-2">
              {approvedRequests.map((r: ApiAssetRequest) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between bg-page rounded-lg px-3 py-2 text-xs"
                >
                  <div>
                    <p className="font-medium">{r.title}</p>
                    <p className="text-muted">
                      {humanize(r.category)} · qty {r.quantity}
                      {r.department ? ` · ${r.department}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAdvancingRequestId(r.id)}
                    className="inline-flex items-center gap-1 text-brand-navy font-semibold min-h-11 px-2"
                  >
                    <HandCoins className="w-3.5 h-3.5" /> Record Advance
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </PermissionGuard>

      <p className="text-xs font-semibold text-muted mb-2">Outstanding advances</p>
      <div className="space-y-2">
        {pendingAdvances?.length === 0 && (
          <p className="text-xs text-muted">Nothing currently outstanding.</p>
        )}
        {pendingAdvances?.map((a) => (
          <div
            key={a.id}
            className="flex items-center justify-between bg-page rounded-lg px-3 py-2 text-xs"
          >
            <div>
              <p className="font-medium">
                {a.supplier} — {formatMWK(a.amount)}
              </p>
              <p className="text-muted">
                {a.assetRequest?.title ?? 'Request deleted'} · advanced{' '}
                {new Date(a.advancedAt).toLocaleDateString()}
              </p>
            </div>
            <PermissionGuard permission="assets.manageAdvances">
              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  disabled={reconcile.isPending}
                  onClick={() => reconcile.mutate({ id: a.id, data: {} })}
                  className="text-brand-teal font-semibold min-h-11 px-1"
                >
                  Reconcile
                </button>
                <button
                  type="button"
                  disabled={writeOff.isPending}
                  onClick={() => writeOff.mutate({ id: a.id, data: {} })}
                  className="text-brand-coral font-semibold min-h-11 px-1"
                >
                  Write off
                </button>
              </div>
            </PermissionGuard>
          </div>
        ))}
      </div>

      {advancingRequestId && (
        <RecordAdvanceModal
          requestId={advancingRequestId}
          onClose={() => setAdvancingRequestId(null)}
        />
      )}
    </div>
  )
}

function RecordAdvanceModal({ requestId, onClose }: { requestId: string; onClose: () => void }) {
  const recordAdvance = useRecordAdvance()
  const [supplier, setSupplier] = useState('')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm bg-surface rounded-2xl shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-base">
          <h2 className="font-heading font-bold text-brand-navy">Record Advance</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 hover:bg-page rounded-lg">
            <XIcon className="w-4 h-4 text-muted" />
          </button>
        </div>
        <div className="p-6 space-y-3">
          <div>
            <label htmlFor="adv-supplier" className="text-xs text-muted mb-1 block">
              Supplier
            </label>
            <input
              id="adv-supplier"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11"
            />
          </div>
          <div>
            <label htmlFor="adv-amount" className="text-xs text-muted mb-1 block">
              Amount (MWK)
            </label>
            <input
              id="adv-amount"
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11"
            />
          </div>
          <div>
            <label htmlFor="adv-notes" className="text-xs text-muted mb-1 block">
              Notes
            </label>
            <textarea
              id="adv-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page"
            />
          </div>
          <button
            type="button"
            disabled={recordAdvance.isPending || !supplier.trim() || !amount}
            onClick={() =>
              recordAdvance.mutate(
                {
                  requestId,
                  data: {
                    supplier: supplier.trim(),
                    amount: Number(amount),
                    notes: notes.trim() || undefined,
                  },
                },
                { onSuccess: onClose }
              )
            }
            className="w-full bg-brand-navy text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60 min-h-11"
          >
            {recordAdvance.isPending ? 'Recording…' : 'Record Advance'}
          </button>
          {recordAdvance.error && (
            <p className="text-sm text-brand-coral">
              {recordAdvance.error instanceof Error
                ? recordAdvance.error.message
                : 'Something went wrong.'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function ReviewRequestRow({ request }: { request: ApiAssetRequest }) {
  const approve = useApproveAssetRequest()
  const reject = useRejectAssetRequest()
  const [rejecting, setRejecting] = useState(false)
  const [notes, setNotes] = useState('')

  return (
    <div className="bg-page rounded-lg px-3 py-2 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">{request.title}</p>
          <p className="text-muted">
            {humanize(request.category)} · qty {request.quantity}
            {request.department ? ` · ${request.department}` : ''}
          </p>
          {request.justification && <p className="text-muted mt-0.5">{request.justification}</p>}
        </div>
        {!rejecting && (
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              disabled={approve.isPending}
              onClick={() => approve.mutate({ id: request.id, data: {} })}
              className="inline-flex items-center gap-1 text-brand-teal font-semibold min-h-11 px-2"
            >
              <Check className="w-3.5 h-3.5" /> Approve
            </button>
            <button
              type="button"
              onClick={() => setRejecting(true)}
              className="inline-flex items-center gap-1 text-brand-coral font-semibold min-h-11 px-2"
            >
              <PackageX className="w-3.5 h-3.5" /> Reject
            </button>
          </div>
        )}
      </div>
      {rejecting && (
        <div className="flex items-center gap-2">
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Reason (optional)"
            className="flex-1 border border-base rounded-lg px-2 py-1.5 text-xs bg-surface min-h-9"
          />
          <button
            type="button"
            disabled={reject.isPending}
            onClick={() =>
              reject.mutate(
                { id: request.id, data: { reviewNotes: notes.trim() || undefined } },
                { onSuccess: () => setRejecting(false) }
              )
            }
            className="text-brand-coral font-semibold shrink-0"
          >
            Confirm
          </button>
          <button type="button" onClick={() => setRejecting(false)} className="text-muted shrink-0">
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

function RequestFormModal({ onClose }: { onClose: () => void }) {
  const createRequest = useCreateAssetRequest()
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('IT_EQUIPMENT')
  const [quantity, setQuantity] = useState('1')
  const [department, setDepartment] = useState('')
  const [justification, setJustification] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-surface rounded-2xl shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-base">
          <h2 className="font-heading font-bold text-brand-navy">Request Equipment</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 hover:bg-page rounded-lg">
            <XIcon className="w-4 h-4 text-muted" />
          </button>
        </div>
        <div className="p-6 space-y-3">
          <div>
            <label htmlFor="req-title" className="text-xs text-muted mb-1 block">
              What do you need?
            </label>
            <input
              id="req-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. 10 microscopes for Form 3 Biology"
              className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="req-category" className="text-xs text-muted mb-1 block">
                Category
              </label>
              <select
                id="req-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {humanize(c)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="req-qty" className="text-xs text-muted mb-1 block">
                Quantity
              </label>
              <input
                id="req-qty"
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11"
              />
            </div>
          </div>
          <div>
            <label htmlFor="req-dept" className="text-xs text-muted mb-1 block">
              Department
            </label>
            <input
              id="req-dept"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="e.g. Biology Department"
              className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11"
            />
          </div>
          <div>
            <label htmlFor="req-justification" className="text-xs text-muted mb-1 block">
              Why is this needed?
            </label>
            <textarea
              id="req-justification"
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              rows={2}
              className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page"
            />
          </div>
          <button
            type="button"
            disabled={createRequest.isPending || !title.trim()}
            onClick={() =>
              createRequest.mutate(
                {
                  title: title.trim(),
                  category: category as never,
                  quantity: Number(quantity) || 1,
                  department: department.trim() || undefined,
                  justification: justification.trim() || undefined,
                },
                { onSuccess: onClose }
              )
            }
            className="w-full bg-brand-navy text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60 min-h-11"
          >
            {createRequest.isPending ? 'Submitting…' : 'Submit Request'}
          </button>
          {createRequest.error && (
            <p className="text-sm text-brand-coral">
              {createRequest.error instanceof Error
                ? createRequest.error.message
                : 'Something went wrong.'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
