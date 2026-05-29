'use client'
import { useState } from 'react'
import { useNotificationPrefs, useUpdateNotificationPrefs } from '@/hooks/useAdmin'
import { useAuthStore } from '@/store/authStore'
import { Bell, User } from 'lucide-react'
// ↑ Removed: Moon — was imported but never used
// ↑ Removed: useEffect — no longer needed after fixing the setState-in-effect pattern
import type { NotificationPrefInput } from '@shared/schemas/admin'

export default function SettingsPage() {
  const { role, user } = useAuthStore()
  const { data: prefs } = useNotificationPrefs()
  const updatePrefs = useUpdateNotificationPrefs()
  const [saved, setSaved] = useState(false)

  const [overrides, setOverrides] = useState<Partial<NotificationPrefInput>>({})
  const serverPrefs = (prefs ?? {}) as NotificationPrefInput
  const effective = { ...serverPrefs, ...overrides }

  const ALL_NOTIF_SETTINGS = [
    {
      key: 'emailFeeReminder' as keyof NotificationPrefInput,
      label: 'Fee Reminders (email)',
      desc: 'Receive email when fees are due in 3 days',
      roles: ['student'],
    },
    {
      key: 'emailResultRelease' as keyof NotificationPrefInput,
      label: 'Result Notifications (email)',
      desc: 'Email when exam results are released',
      roles: ['student'],
    },
    {
      key: 'emailLeaveUpdate' as keyof NotificationPrefInput,
      label: 'Leave Updates (email)',
      desc: 'Email when your leave request is approved/rejected',
      roles: ['academic', 'hr', 'finance', 'library', 'lower_rank', 'exam_officer'],
    },
    {
      key: 'emailContractAlert' as keyof NotificationPrefInput,
      label: 'Contract Alerts (email)',
      desc: 'Email when your contract is expiring soon',
      roles: ['academic', 'hr', 'finance', 'library', 'lower_rank', 'exam_officer'],
    },
    {
      key: 'emailAnnouncement' as keyof NotificationPrefInput,
      label: 'Announcements (email)',
      desc: 'Email for new school announcements',
      roles: ['admin', 'high_rank', 'academic', 'student'],
    },
    {
      key: 'smsFeeReminder' as keyof NotificationPrefInput,
      label: 'Fee Reminders (SMS)',
      desc: 'SMS to guardian when fees are due',
      roles: ['student'],
    },
    {
      key: 'smsResultRelease' as keyof NotificationPrefInput,
      label: 'Results (SMS)',
      desc: 'SMS when results are released',
      roles: ['student'],
    },
    {
      key: 'pushAnnouncement' as keyof NotificationPrefInput,
      label: 'Announcements (push)',
      desc: 'Push notification for new announcements',
      roles: ['admin', 'high_rank', 'academic', 'student'],
    },
    {
      key: 'pushResultRelease' as keyof NotificationPrefInput,
      label: 'Results (push)',
      desc: 'Push notification when results are released',
      roles: ['student'],
    },
  ]

  const NOTIF_SETTINGS = ALL_NOTIF_SETTINGS.filter(
    (s) => s.roles.includes(role ?? '') || role === 'admin'
  )

  function toggle(key: keyof NotificationPrefInput) {
    setOverrides((prev) => ({ ...prev, [key]: !(effective[key] ?? false) }))
  }

  function handleSave() {
    updatePrefs.mutate(effective, {
      onSuccess: () => {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      },
    })
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-brand-navy">Settings</h1>
        <p className="text-sm text-muted mt-0.5">
          Your account preferences and notification settings
        </p>
      </div>

      <div className="bg-surface border border-base rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2 mb-3">
          <User className="w-4 h-4 text-brand-teal" />
          <h2 className="font-semibold text-brand-navy">Account</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted text-xs uppercase font-semibold">Email</p>
            <p className="font-medium mt-0.5">{user?.email}</p>
          </div>
          <div>
            <p className="text-muted text-xs uppercase font-semibold">Role</p>
            <p className="font-medium mt-0.5 capitalize">{role?.replace(/_/g, ' ')}</p>
          </div>
        </div>
      </div>

      {NOTIF_SETTINGS.length > 0 && (
        <div className="bg-surface border border-base rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-brand-teal" />
            <h2 className="font-semibold text-brand-navy">Notification Preferences</h2>
          </div>
          {NOTIF_SETTINGS.map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-body">{label}</p>
                <p className="text-xs text-muted">{desc}</p>
              </div>
              <button
                onClick={() => toggle(key)}
                aria-label={`Toggle ${label}`}
                className={`relative w-10 h-6 rounded-full transition-colors ${effective[key] ? 'bg-brand-teal' : 'bg-gray-300'}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${effective[key] ? 'translate-x-4' : 'translate-x-0'}`}
                />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-3 pt-2">
            <button
              disabled={updatePrefs.isPending}
              onClick={handleSave}
              className="px-5 py-2 bg-brand-teal text-white rounded-xl text-sm font-semibold disabled:opacity-60"
            >
              {updatePrefs.isPending ? 'Saving…' : 'Save Preferences'}
            </button>
            {saved && <span className="text-sm text-green-600 font-medium">✓ Saved</span>}
          </div>
        </div>
      )}
    </div>
  )
}
