'use client'

/**
 * apps/web/src/app/(auth)/user-management/page.tsx
 *
 * [CHANGE TYPE]: MAJOR REWRITE (production fix, 2026-07-28)
 * [PURPOSE]:
 *   1. User Accounts is now filterable (search across name/email/uid/
 *      employee no/registration no) and sortable (User, Role, Status,
 *      Last Sign In), and grouped by role for easier navigation — the
 *      employee/registration numbers come from a new join in
 *      userManagementService.listUsers() (StaffProfile/Student by uid),
 *      since the raw Firebase Auth user list never carried them.
 *   2. Both User Accounts and System Health switched from bordered/
 *      rounded cards to flat, solid-background sections per instruction —
 *      text colors use the app's dark/light-aware tokens (text-body,
 *      text-muted, dark:text-white) throughout rather than fixed colors,
 *      so contrast holds in both themes.
 * [DEPENDS ON]: userManagementService.ts's listUsers() join (same session)
 */

import { useState, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { useUsers, useCreateUser, useUpdateUserRole, useToggleUserDisabled, useSendPasswordReset } from '@/hooks/useAdmin'
import { useSystemHealth } from '@/hooks/useReports'
import type { ApiFirebaseUser, ApiUserListResponse, ApiSystemHealth, ApiServiceHealth } from '@shared/types/api'
import { UserPlus, Shield, Power, Key, Activity, Search, ArrowUpDown } from 'lucide-react'
import { USER_ROLES, ROLE_LABELS } from '@shared/types/roles'
import type { CreateUserInput } from '@shared/schemas/admin'

export default function UserManagementPage() {
  return (
    <RoleGuard allowed={['admin']}>
      {/* useSearchParams() requires a Suspense boundary or `next build` fails —
          same convention as (public)/login/page.tsx and (auth)/exams/page.tsx. */}
      <Suspense fallback={<div className="p-6 space-y-3"><div className="h-8 w-40 rounded-lg bg-surface animate-pulse" /><div className="h-48 rounded-xl bg-surface animate-pulse" /></div>}>
        <UserManagementContent />
      </Suspense>
    </RoleGuard>
  )
}

type SortKey = 'user' | 'role' | 'status' | 'lastSignIn'

// [PRODUCTION FIX 2026-07-28] Was defined inside UserManagementContent's
// render body — a new component definition every render, which resets any
// internal state and fails the static-components lint rule. Declared at
// module scope now, with the parent's sortKey/onToggle passed as explicit
// props instead of closed over.
function SortHeader({
  label, sortKeyVal, activeSortKey, onToggle,
}: {
  label: string
  sortKeyVal: SortKey
  activeSortKey: SortKey
  onToggle: (key: SortKey) => void
}) {
  return (
    <button
      onClick={() => onToggle(sortKeyVal)}
      className="flex items-center gap-1 text-xs font-heading font-semibold text-muted uppercase hover:text-body transition-colors"
    >
      {label}
      <ArrowUpDown className={`w-3 h-3 ${activeSortKey === sortKeyVal ? 'text-brand-teal' : 'text-muted/50'}`} aria-hidden />
    </button>
  )
}

function UserManagementContent() {
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const initialTab: 'users' | 'health' = tabParam === 'health' ? 'health' : 'users'

  const [tab, setTab] = useState<'users' | 'health'>(initialTab)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState<Partial<CreateUserInput>>({})

  // ── Filters / sort ────────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'' | 'active' | 'disabled'>('')
  const [sortKey, setSortKey] = useState<SortKey>('user')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [groupByRole, setGroupByRole] = useState(true)

  const { data: usersData } = useUsers()
  const { data: health } = useSystemHealth()
  const createUser        = useCreateUser()
  const updateRole        = useUpdateUserRole()
  const toggleDisabled    = useToggleUserDisabled()
  const resetPassword     = useSendPasswordReset()
  // [PRODUCTION FIX 2026-07-28] `?? []` created a fresh array reference on
  // every render, which defeated the filteredSorted useMemo below (its
  // dependency array saw "users" as different every time). Memoized so it
  // only actually changes when usersData itself changes.
  const users = useMemo(() => (usersData as ApiUserListResponse)?.users ?? [], [usersData])
  const h                 = health as ApiSystemHealth | undefined

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const filteredSorted = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = (users as ApiFirebaseUser[]).filter((u) => {
      if (roleFilter && u.role !== roleFilter) return false
      if (statusFilter === 'active' && u.disabled) return false
      if (statusFilter === 'disabled' && !u.disabled) return false
      if (q) {
        const haystack = [
          u.displayName, u.email, u.uid, u.employeeNo, u.registrationNo,
        ].filter(Boolean).join(' ').toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })

    const dir = sortDir === 'asc' ? 1 : -1
    list = [...list].sort((a, b) => {
      switch (sortKey) {
        case 'user':
          return dir * (a.displayName ?? a.email).localeCompare(b.displayName ?? b.email)
        case 'role':
          return dir * (a.role ?? '').localeCompare(b.role ?? '')
        case 'status':
          return dir * Number(a.disabled) - dir * Number(b.disabled)
        case 'lastSignIn':
          return dir * (new Date(a.lastSignIn ?? 0).getTime() - new Date(b.lastSignIn ?? 0).getTime())
        default:
          return 0
      }
    })
    return list
  }, [users, search, roleFilter, statusFilter, sortKey, sortDir])

  // Grouped-by-role view — each group internally respects the same sort.
  const grouped = useMemo(() => {
    if (!groupByRole) return null
    const map = new Map<string, ApiFirebaseUser[]>()
    for (const u of filteredSorted) {
      const key = u.role ?? 'unassigned'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(u)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [filteredSorted, groupByRole])

  function renderUserRow(u: ApiFirebaseUser) {
    return (
      <tr key={u.uid} className="hover:bg-page/60">
        <td className="px-4 py-3">
          <p className="font-medium text-body">{u.displayName || u.email}</p>
          <p className="text-xs text-muted">{u.email}</p>
          <p className="text-[10.5px] text-muted/70 font-mono mt-0.5">{u.uid}</p>
        </td>
        <td className="px-4 py-3">
          <select
            aria-label={`Role for ${u.displayName ?? u.email}`}
            value={u.role ?? ''}
            onChange={(e) => updateRole.mutate({ uid: u.uid, role: e.target.value })}
            className="border border-base rounded-lg px-2 py-1 text-xs bg-page text-body focus:outline-none"
          >
            {USER_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </td>
        <td className="px-4 py-3">
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${u.disabled ? 'bg-brand-coral/10 text-brand-coral' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}`}>
            {u.disabled ? 'Disabled' : 'Active'}
          </span>
          {u.requiresPasswordChange && <span className="ml-1 text-xs bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full">Must Change PW</span>}
        </td>
        <td className="px-4 py-3 text-xs text-muted">{u.lastSignIn ? new Date(u.lastSignIn).toLocaleDateString('en-MW') : 'Never'}</td>
        <td className="px-4 py-3 text-xs text-muted font-mono">{u.employeeNo ?? u.registrationNo ?? '—'}</td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            <button onClick={() => toggleDisabled.mutate({ uid: u.uid, disabled: !u.disabled })}
              title={u.disabled ? 'Enable user' : 'Disable user'}
              className="p-1.5 hover:bg-page rounded-lg text-muted">
              <Power className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => resetPassword.mutate(u.uid)} title="Send password reset"
              className="p-1.5 hover:bg-page rounded-lg text-muted">
              <Key className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-brand-navy dark:text-white">System Administration</h1>
          <p className="text-sm text-muted mt-0.5">User accounts, roles, and system health</p>
        </div>
        {tab === 'users' && (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-brand-teal text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-brand-teal-light">
            <UserPlus className="w-4 h-4" /> Create User
          </button>
        )}
      </div>

      <div className="flex gap-1 border-b border-base">
        {([
          { id: 'users'  as const, label: 'User Accounts', icon: Shield  },
          { id: 'health' as const, label: 'System Health', icon: Activity },
        ]).map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === id ? 'border-brand-teal text-brand-teal' : 'border-transparent text-muted hover:text-body'}`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'users' && (
        <>
          {showCreate && (
            <div className="bg-surface p-5 space-y-3">
              <h3 className="font-semibold text-brand-navy dark:text-white">Create New User</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                {([
                  { key: 'email',       label: 'Email',        type: 'email' },
                  { key: 'displayName', label: 'Full Name',    type: 'text'  },
                  { key: 'phone',       label: 'Phone',        type: 'tel'   },
                ] as const).map(({ key, label, type }) => (
                  <div key={key}>
                    <label className="block text-xs font-semibold text-muted uppercase mb-1">{label}</label>
                    <input
                        type={type}
                        aria-label={label}
                        value={(form[key] ?? '') as string}
                        onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                      className="w-full border border-base rounded-xl px-3 py-2 text-sm bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25" />
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase mb-1">Role</label>
                  <select
                    aria-label="Role"
                    value={form.role ?? ''}
                    onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as typeof USER_ROLES[number] }))}
                    className="w-full border border-base rounded-xl px-3 py-2 text-sm bg-page text-body focus:outline-none">
                    <option value="">Select role…</option>
                    {USER_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm border border-base rounded-xl text-body">Cancel</button>
                <button disabled={createUser.isPending} onClick={() => {
                  if (form.email && form.displayName && form.role)
                    createUser.mutate(form as CreateUserInput, { onSuccess: () => { setShowCreate(false); setForm({}) } })
                }} className="px-5 py-2 text-sm bg-brand-teal text-white rounded-xl font-semibold disabled:opacity-60">
                  {createUser.isPending ? 'Creating…' : 'Create & Send Email'}
                </button>
              </div>
              {createUser.isSuccess && <p className="text-sm text-emerald-600 dark:text-emerald-400">✓ User created. Temporary password sent to their email.</p>}
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2.5 bg-surface p-4">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email, UID, employee/reg. no…"
                className="w-full pl-9 pr-3 py-2 text-sm border border-base rounded-lg bg-page text-body placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="border border-base rounded-lg px-3 py-2 text-sm bg-page text-body focus:outline-none"
              aria-label="Filter by role"
            >
              <option value="">All roles</option>
              {USER_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as '' | 'active' | 'disabled')}
              className="border border-base rounded-lg px-3 py-2 text-sm bg-page text-body focus:outline-none"
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-body cursor-pointer ml-auto">
              <input type="checkbox" checked={groupByRole} onChange={(e) => setGroupByRole(e.target.checked)} className="accent-brand-teal" />
              Group by role
            </label>
          </div>

          {/* Table(s) */}
          <div className="bg-surface">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-page border-b border-base">
                  <th className="px-4 py-3 text-left"><SortHeader label="User" sortKeyVal="user" activeSortKey={sortKey} onToggle={toggleSort} /></th>
                  <th className="px-4 py-3 text-left"><SortHeader label="Role" sortKeyVal="role" activeSortKey={sortKey} onToggle={toggleSort} /></th>
                  <th className="px-4 py-3 text-left"><SortHeader label="Status" sortKeyVal="status" activeSortKey={sortKey} onToggle={toggleSort} /></th>
                  <th className="px-4 py-3 text-left"><SortHeader label="Last Sign In" sortKeyVal="lastSignIn" activeSortKey={sortKey} onToggle={toggleSort} /></th>
                  <th className="px-4 py-3 text-left text-xs font-heading font-semibold text-muted uppercase">Employee / Reg. No.</th>
                  <th className="px-4 py-3 text-left text-xs font-heading font-semibold text-muted uppercase">Actions</th>
                </tr>
              </thead>
              {grouped ? (
                grouped.map(([role, rows]) => (
                  <tbody key={role} className="divide-y divide-base">
                    <tr className="bg-page/70">
                      <td colSpan={6} className="px-4 py-2 text-xs font-heading font-bold text-brand-teal uppercase tracking-wider">
                        {role === 'unassigned' ? 'No role assigned' : ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role} · {rows.length}
                      </td>
                    </tr>
                    {rows.map(renderUserRow)}
                  </tbody>
                ))
              ) : (
                <tbody className="divide-y divide-base">
                  {filteredSorted.map(renderUserRow)}
                </tbody>
              )}
            </table>
            {filteredSorted.length === 0 && (
              <p className="text-center py-10 text-sm text-muted">No users match these filters.</p>
            )}
          </div>
        </>
      )}

      {tab === 'health' && h && (
        <div className="space-y-4">
          <div className={`px-4 py-3 font-semibold text-sm flex items-center gap-2 ${h.overall === 'healthy' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'}`}>
            <Activity className="w-4 h-4" />
            System is {h.overall} · Checked {new Date(h.checkedAt).toLocaleTimeString()}
            · {h.actionsLast24h} actions last 24h · {h.activeUsersLastHr} active users last hour
          </div>
          <div className="grid gap-px sm:grid-cols-3 bg-base">
            {h.services.map((s: ApiServiceHealth) => (
              <div key={s.name} className="bg-surface p-4">
                <p className="font-semibold text-sm text-body">{s.name}</p>
                <p className={`text-xs mt-1 font-bold uppercase ${s.status === 'ok' ? 'text-emerald-700 dark:text-emerald-400' : s.status === 'degraded' ? 'text-amber-700 dark:text-amber-400' : 'text-brand-coral'}`}>{s.status}</p>
                {s.latencyMs && <p className="text-xs text-muted mt-0.5">{s.latencyMs}ms</p>}
                {s.details && <p className="text-xs text-muted mt-0.5 truncate">{s.details}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}