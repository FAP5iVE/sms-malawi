'use client'
import { useState } from 'react'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { useUsers, useCreateUser, useUpdateUserRole, useToggleUserDisabled, useSendPasswordReset } from '@/hooks/useAdmin'
import { useSystemHealth } from '@/hooks/useReports'
import type { ApiFirebaseUser, ApiUserListResponse, ApiSystemHealth,ApiServiceHealth} from '@shared/types/api'
import { UserPlus, Shield, Power, Key, Activity } from 'lucide-react'
import { USER_ROLES, ROLE_LABELS } from '@shared/types/roles'
import type { CreateUserInput } from '@shared/schemas/admin'

export default function UserManagementPage() {
  return (
    <RoleGuard allowed={['admin']}>
      <UserManagementContent />
    </RoleGuard>
  )
}

function UserManagementContent() {
  const [tab, setTab] = useState<'users'|'health'>('users')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState<Partial<CreateUserInput>>({})
  const { data: usersData } = useUsers()
  const { data: health } = useSystemHealth()
  const createUser        = useCreateUser()
  const updateRole        = useUpdateUserRole()
  const toggleDisabled    = useToggleUserDisabled()
  const resetPassword     = useSendPasswordReset()
  const users             = (usersData as ApiUserListResponse)?.users ?? []
  const h                 = health as ApiSystemHealth | undefined


  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-brand-navy">System Administration</h1>
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
            <div className="bg-surface border border-base rounded-xl p-5 space-y-3">
              <h3 className="font-semibold text-brand-navy">Create New User</h3>
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
                      className="w-full border border-base rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal/25" />
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase mb-1">Role</label>
                  <select
                    aria-label="Role"
                    value={form.role ?? ''}
                    onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as typeof USER_ROLES[number] }))}
                    className="w-full border border-base rounded-xl px-3 py-2 text-sm focus:outline-none">
                    <option value="">Select role…</option>
                    {USER_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm border border-base rounded-xl">Cancel</button>
                <button disabled={createUser.isPending} onClick={() => {
                  if (form.email && form.displayName && form.role)
                    createUser.mutate(form as CreateUserInput, { onSuccess: () => { setShowCreate(false); setForm({}) } })
                }} className="px-5 py-2 text-sm bg-brand-teal text-white rounded-xl font-semibold disabled:opacity-60">
                  {createUser.isPending ? 'Creating…' : 'Create & Send Email'}
                </button>
              </div>
              {createUser.isSuccess && <p className="text-sm text-green-600">✓ User created. Temporary password sent to their email.</p>}
            </div>
          )}
          <div className="border border-base rounded-xl overflow-hidden">
            <table className="w-full text-sm border-collapse">
              <thead><tr className="bg-page border-b border-base">
                {['User','Role','Status','Last Sign In','Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-heading font-semibold text-muted uppercase">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-base">
                {users.map((u: ApiFirebaseUser) => (
                  <tr key={u.uid} className="hover:bg-page">
                    <td className="px-4 py-3">
                      <p className="font-medium text-body">{u.displayName || u.email}</p>
                      <p className="text-xs text-muted">{u.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        aria-label={`Role for ${u.displayName ?? u.email}`}
                        value={u.role ?? ''}
                        onChange={(e) => updateRole.mutate({ uid: u.uid, role: e.target.value })}
                        className="border border-base rounded-lg px-2 py-1 text-xs focus:outline-none">
                        {USER_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${u.disabled ? 'bg-brand-coral/10 text-brand-coral' : 'bg-green-50 text-green-700'}`}>
                        {u.disabled ? 'Disabled' : 'Active'}
                      </span>
                      {u.requiresPasswordChange && <span className="ml-1 text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">Must Change PW</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">{u.lastSignIn ? new Date(u.lastSignIn).toLocaleDateString('en-MW') : 'Never'}</td>
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
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'health' && h && (
        <div className="space-y-4">
          <div className={`rounded-xl px-4 py-3 font-semibold text-sm flex items-center gap-2 ${h.overall === 'healthy' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
            <Activity className="w-4 h-4" />
            System is {h.overall} · Checked {new Date(h.checkedAt).toLocaleTimeString()}
            · {h.actionsLast24h} actions last 24h · {h.activeUsersLastHr} active users last hour
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {h.services.map((s: ApiServiceHealth) => (
              <div key={s.name} className={`border rounded-xl p-4 ${s.status === 'ok' ? 'border-green-200 bg-green-50' : s.status === 'degraded' ? 'border-amber-200 bg-amber-50' : 'border-brand-coral/30 bg-brand-coral/5'}`}>
                <p className="font-semibold text-sm">{s.name}</p>
                <p className={`text-xs mt-1 font-bold uppercase ${s.status === 'ok' ? 'text-green-700' : s.status === 'degraded' ? 'text-amber-700' : 'text-brand-coral'}`}>{s.status}</p>
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