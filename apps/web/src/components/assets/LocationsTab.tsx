'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import { PermissionGuard } from '@/components/shared/PermissionGuard'
import { Loader2, Plus, Check, X, PlayCircle } from 'lucide-react'
import {
  useDepartments, useCreateDepartment, useBuildings, useCreateBuilding, useRooms, useCreateRoom,
  useLegacyMappings, useProposeDepartmentMappings, useProposeLocationMappings, useApproveMapping, useRejectMapping, useApplyApprovedMappings,
} from '@/hooks/useLocations'

// [CHANGE TYPE]: NEW FILE (R22) — locationService.ts/mappingService.ts and
// their routes existed with no UI at all. Without this, every requisition
// and room form in the app made you type a raw Department/Room ID by hand.

function humanize(s: string) { return s.replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase()) }

type Section = 'departments' | 'buildings' | 'rooms' | 'mappings'
const SECTIONS: Array<{ id: Section; label: string }> = [
  { id: 'departments', label: 'Departments' }, { id: 'buildings', label: 'Buildings' },
  { id: 'rooms', label: 'Rooms' }, { id: 'mappings', label: 'Legacy Data Mapping' },
]

export function LocationsTab() {
  const [section, setSection] = useState<Section>('departments')
  return <div className="space-y-4">
    <div>
      <h2 className="font-heading font-semibold text-brand-navy">Departments, Buildings &amp; Rooms</h2>
      <p className="text-sm text-muted">The canonical location register requisitions, rooms and stocktakes link against. Legacy free-text fields stay as-is until mapped below.</p>
    </div>
    <div className="flex gap-1 border-b border-base overflow-x-auto">
      {SECTIONS.map(s => <button key={s.id} type="button" onClick={() => setSection(s.id)}
        className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px ${section === s.id ? 'border-brand-navy text-brand-navy' : 'border-transparent text-muted hover:text-brand-navy'}`}>
        {s.label}
      </button>)}
    </div>
    {section === 'departments' && <DepartmentsSection />}
    {section === 'buildings' && <BuildingsSection />}
    {section === 'rooms' && <RoomsSection />}
    {section === 'mappings' && <MappingsSection />}
  </div>
}

function DepartmentsSection() {
  const { data = [], isLoading } = useDepartments()
  const create = useCreateDepartment()
  const [show, setShow] = useState(false); const [code, setCode] = useState(''); const [name, setName] = useState(''); const [description, setDescription] = useState('')
  function submit() { if (!code.trim() || !name.trim()) return; create.mutate({ code: code.trim(), name: name.trim(), description: description.trim() || undefined }, { onSuccess: () => { setCode(''); setName(''); setDescription(''); setShow(false) } }) }
  return <section className="space-y-4">
    <Header title="Departments" action={<PermissionGuard permission="location.manage"><button type="button" onClick={() => setShow(v => !v)} className="button-primary"><Plus className="w-4 h-4" /> New department</button></PermissionGuard>} />
    {show && <div className="bg-surface border border-base rounded-xl p-4 grid sm:grid-cols-3 gap-3">
      <Field label="Code"><input value={code} onChange={e => setCode(e.target.value)} className="input" placeholder="SCIENCE" /></Field>
      <Field label="Name"><input value={name} onChange={e => setName(e.target.value)} className="input" placeholder="Science Department" /></Field>
      <Field label="Description (optional)"><input value={description} onChange={e => setDescription(e.target.value)} className="input" /></Field>
      <div className="sm:col-span-3"><button type="button" onClick={submit} disabled={create.isPending} className="min-h-11 px-4 rounded-lg bg-brand-navy text-white text-sm font-semibold">{create.isPending ? 'Creating…' : 'Create'}</button>
        {create.error && <p className="text-sm text-brand-coral mt-2">{create.error instanceof Error ? create.error.message : 'Could not create department.'}</p>}</div>
    </div>}
    {isLoading ? <Loading /> : <DataTable headers={['Code', 'Name', 'Status']}>{data.map(d => <tr key={d.id} className="border-b border-base last:border-0">
      <td className="px-4 py-3 font-mono text-xs">{d.code}</td><td className="px-4 py-3 font-medium">{d.name}</td>
      <td className="px-4 py-3"><span className="text-xs rounded px-2 py-1 bg-base">{d.isActive ? 'Active' : 'Inactive'}</span></td>
    </tr>)}</DataTable>}
  </section>
}

function BuildingsSection() {
  const { data = [], isLoading } = useBuildings()
  const create = useCreateBuilding()
  const [show, setShow] = useState(false); const [code, setCode] = useState(''); const [name, setName] = useState('')
  function submit() { if (!code.trim() || !name.trim()) return; create.mutate({ code: code.trim(), name: name.trim() }, { onSuccess: () => { setCode(''); setName(''); setShow(false) } }) }
  return <section className="space-y-4">
    <Header title="Buildings" action={<PermissionGuard permission="location.manage"><button type="button" onClick={() => setShow(v => !v)} className="button-primary"><Plus className="w-4 h-4" /> New building</button></PermissionGuard>} />
    {show && <div className="bg-surface border border-base rounded-xl p-4 grid sm:grid-cols-2 gap-3">
      <Field label="Code"><input value={code} onChange={e => setCode(e.target.value)} className="input" placeholder="MAIN" /></Field>
      <Field label="Name"><input value={name} onChange={e => setName(e.target.value)} className="input" placeholder="Main Block" /></Field>
      <div className="sm:col-span-2"><button type="button" onClick={submit} disabled={create.isPending} className="min-h-11 px-4 rounded-lg bg-brand-navy text-white text-sm font-semibold">{create.isPending ? 'Creating…' : 'Create'}</button>
        {create.error && <p className="text-sm text-brand-coral mt-2">{create.error instanceof Error ? create.error.message : 'Could not create building.'}</p>}</div>
    </div>}
    {isLoading ? <Loading /> : <DataTable headers={['Code', 'Name', 'Rooms', 'Status']}>{data.map(b => <tr key={b.id} className="border-b border-base last:border-0">
      <td className="px-4 py-3 font-mono text-xs">{b.code}</td><td className="px-4 py-3 font-medium">{b.name}</td>
      <td className="px-4 py-3 text-right">{b._count?.rooms ?? 0}</td>
      <td className="px-4 py-3"><span className="text-xs rounded px-2 py-1 bg-base">{b.isActive ? 'Active' : 'Inactive'}</span></td>
    </tr>)}</DataTable>}
  </section>
}

function RoomsSection() {
  const { data: rooms = [], isLoading } = useRooms()
  const { data: buildings = [] } = useBuildings()
  const { data: departments = [] } = useDepartments()
  const create = useCreateRoom()
  const [show, setShow] = useState(false)
  const [buildingId, setBuildingId] = useState(''); const [code, setCode] = useState(''); const [name, setName] = useState(''); const [roomType, setRoomType] = useState(''); const [departmentId, setDepartmentId] = useState('')
  function submit() {
    if (!buildingId || !code.trim() || !name.trim() || !roomType.trim()) return
    create.mutate({ buildingId, code: code.trim(), name: name.trim(), roomType: roomType.trim(), departmentId: departmentId || undefined },
      { onSuccess: () => { setCode(''); setName(''); setRoomType(''); setDepartmentId(''); setShow(false) } })
  }
  return <section className="space-y-4">
    <Header title="Rooms" action={<PermissionGuard permission="location.manage"><button type="button" onClick={() => setShow(v => !v)} className="button-primary"><Plus className="w-4 h-4" /> New room</button></PermissionGuard>} />
    {show && <div className="bg-surface border border-base rounded-xl p-4 grid sm:grid-cols-2 gap-3">
      <Field label="Building"><select value={buildingId} onChange={e => setBuildingId(e.target.value)} className="input"><option value="">Select a building…</option>{buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
      <Field label="Code"><input value={code} onChange={e => setCode(e.target.value)} className="input" placeholder="LAB1" /></Field>
      <Field label="Name"><input value={name} onChange={e => setName(e.target.value)} className="input" placeholder="Science Lab 1" /></Field>
      <Field label="Room type"><input value={roomType} onChange={e => setRoomType(e.target.value)} className="input" placeholder="Laboratory" /></Field>
      <Field label="Department (optional)"><select value={departmentId} onChange={e => setDepartmentId(e.target.value)} className="input"><option value="">None</option>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
      <div className="sm:col-span-2"><button type="button" onClick={submit} disabled={create.isPending} className="min-h-11 px-4 rounded-lg bg-brand-navy text-white text-sm font-semibold">{create.isPending ? 'Creating…' : 'Create'}</button>
        {create.error && <p className="text-sm text-brand-coral mt-2">{create.error instanceof Error ? create.error.message : 'Could not create room.'}</p>}</div>
    </div>}
    {isLoading ? <Loading /> : <DataTable headers={['Room', 'Building', 'Type', 'Department', 'Custodian']}>{rooms.map(r => <tr key={r.id} className="border-b border-base last:border-0">
      <td className="px-4 py-3 font-medium">{r.name} <span className="text-xs text-muted font-mono">{r.code}</span></td>
      <td className="px-4 py-3">{r.building?.name ?? '—'}</td><td className="px-4 py-3">{r.roomType}</td>
      <td className="px-4 py-3">{r.department?.name ?? '—'}</td>
      <td className="px-4 py-3">{r.custodian ? `${r.custodian.firstName} ${r.custodian.lastName}` : '—'}</td>
    </tr>)}</DataTable>}
  </section>
}

function MappingsSection() {
  const { data: proposed = [], isLoading } = useLegacyMappings('PROPOSED')
  const proposeDept = useProposeDepartmentMappings(); const proposeLoc = useProposeLocationMappings()
  const approve = useApproveMapping(); const reject = useRejectMapping(); const apply = useApplyApprovedMappings()
  const [applyResult, setApplyResult] = useState<string | null>(null)
  return <section className="space-y-4">
    <Header title="Legacy data mapping"
      action={<PermissionGuard permission="location.manage"><div className="flex gap-2 flex-wrap">
        <button type="button" onClick={() => proposeDept.mutate()} disabled={proposeDept.isPending} className="min-h-11 px-3 rounded-lg border border-base text-sm">Scan department fields</button>
        <button type="button" onClick={() => proposeLoc.mutate()} disabled={proposeLoc.isPending} className="min-h-11 px-3 rounded-lg border border-base text-sm">Scan location fields</button>
        <button type="button" onClick={() => apply.mutate(undefined, { onSuccess: (res) => setApplyResult(`Applied ${(res as { applied?: number })?.applied ?? 0}, skipped ${(res as { skipped?: unknown[] })?.skipped?.length ?? 0}.`) })}
          disabled={apply.isPending} className="min-h-11 px-3 rounded-lg bg-brand-teal text-white text-sm font-semibold inline-flex items-center gap-1.5"><PlayCircle className="w-4 h-4" /> Apply approved</button>
      </div></PermissionGuard>} />
    <p className="text-xs text-muted">
      Scanning finds distinct legacy values (e.g. every spelling of a department name across Staff/Budget/AssetRequest) and proposes a match against an existing Department or Room by name/code —
      it never merges values automatically. Review and approve or reject each one below, then apply.
    </p>
    {applyResult && <p className="text-sm text-brand-navy bg-brand-teal/10 rounded-lg p-3">{applyResult}</p>}
    {(proposeDept.error || proposeLoc.error) && <p className="text-sm text-brand-coral">{(proposeDept.error ?? proposeLoc.error) instanceof Error ? (proposeDept.error ?? proposeLoc.error)?.message : 'Scan failed.'}</p>}
    {isLoading ? <Loading /> : proposed.length === 0 ? <p className="text-sm text-muted py-6 text-center">No pending mappings to review.</p> : <div className="space-y-2">
      {proposed.map(m => <div key={m.id} className="border border-base rounded-lg p-3 flex items-center justify-between gap-3 flex-wrap">
        <div><p className="text-sm font-medium">"{m.legacyValue}" <span className="text-muted">→</span> {humanize(m.targetType)} {m.targetId}</p><p className="text-xs text-muted">{humanize(m.mappingType)} mapping</p></div>
        <div className="flex gap-2">
          <button type="button" onClick={() => approve.mutate({ id: m.id })} disabled={approve.isPending} className="min-h-10 px-3 rounded-lg bg-brand-navy text-white text-xs font-semibold inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Approve</button>
          <button type="button" onClick={() => reject.mutate({ id: m.id })} disabled={reject.isPending} className="min-h-10 px-3 rounded-lg border border-base text-xs inline-flex items-center gap-1"><X className="w-3.5 h-3.5" /> Reject</button>
        </div>
      </div>)}
    </div>}
  </section>
}

function Header({ title, action }: { title: string; action?: ReactNode }) { return <div className="flex items-center justify-between gap-3 flex-wrap"><h3 className="font-heading font-semibold text-brand-navy">{title}</h3>{action}</div> }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className="text-xs text-muted block mb-1">{label}</span>{children}</label> }
function DataTable({ headers, children }: { headers: string[]; children: ReactNode }) { return <div className="bg-surface border border-base rounded-xl overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-base bg-page">{headers.map(h => <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-wide text-muted font-semibold">{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div></div> }
function Loading() { return <div className="p-8 text-center text-muted"><Loader2 className="inline w-5 h-5 animate-spin" /></div> }
