/**
 * apps/web/src/app/(public)/complete-registration/page.tsx
 *
 * [PURPOSE]: The registration form a NEW student sees right after their first-login password
 *   change, before the dashboard. It looks like the application form, but the details the school
 *   already holds and that must not change here (name, email, date of birth, sex, nationality,
 *   district, guardian) are shown locked. The student fills in the low-risk details (T/A, village,
 *   religion, home language, postal and physical address, phone, previous school) and submits.
 * [FLOW]: change-password -> /complete-registration -> /dashboard. Gated by the
 *   `registrationPending` custom claim, which is set at account creation and cleared by
 *   PATCH /students/me/registration. Existing students never carry the claim, so they never see this.
 * [LAYOUT]: Public route group (like /change-password) because AuthProvider deliberately holds the
 *   app shell back while the claim is set. Auth is checked here from Firebase directly.
 */
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged } from 'firebase/auth'
import { AlertCircle, ArrowRight, Loader2, Lock, MapPin, Phone, School, User } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { auth } from '@/lib/firebase'
import { PublicAmbientBackground } from '@/components/shared/PublicAmbientBackground'
import { RELIGIONS, HOME_LANGUAGES } from '@shared/constants/malawi'
import type { ApiStudentDetail } from '@/server/services/studentService'

type Editable = {
  traditionalAuthority: string
  village: string
  religion: string
  homeLanguage: string
  nrbNumber: string
  address: string
  phone: string
  physicalAddress: string
  previousSchool: string
  reasonForTransfer: string
}

const EMPTY: Editable = {
  traditionalAuthority: '', village: '', religion: '', homeLanguage: '', nrbNumber: '',
  address: '', phone: '', physicalAddress: '', previousSchool: '', reasonForTransfer: '',
}

function SectionHeader({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle: string }) {
  return (
    <div className="hills-apply__sec col-span-full">
      <div className="hills-apply__sec-ico"><Icon className="w-5 h-5" /></div>
      <div>
        <h3 className="hills-apply__sec-title">{title}</h3>
        <p className="hills-apply__sec-sub">{subtitle}</p>
      </div>
    </div>
  )
}

function Field({ label, htmlFor, hint, locked, className = '', children }: {
  label: string; htmlFor: string; hint?: string; locked?: boolean; className?: string; children: React.ReactNode
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="hills-fld__label">
        {label}
        {locked && <Lock aria-label="Locked" className="inline w-3 h-3 ml-1.5 opacity-60" />}
      </label>
      {children}
      {hint && <p className="hills-fld__hint">{hint}</p>}
    </div>
  )
}

/** A detail the school already holds. Shown, not editable. */
function Locked({ id, label, value }: { id: string; label: string; value: string | null | undefined }) {
  return (
    <Field label={label} htmlFor={id} locked>
      <input id={id} className="hills-ctl" value={value ?? ''} readOnly disabled aria-readonly="true" />
    </Field>
  )
}

export default function CompleteRegistrationPage() {
  const router = useRouter()
  const [student, setStudent] = useState<ApiStudentDetail | null>(null)
  const [form, setForm] = useState<Editable>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (k: keyof Editable) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  useEffect(() => {
    if (!auth) return
    let settled = false
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (settled) return
      settled = true
      unsubscribe()
      if (!user) { router.replace('/login'); return }
      try {
        const { claims } = await user.getIdTokenResult()
        // Already registered (or never needed to): straight on to the app.
        if (claims.registrationPending !== true) { router.replace('/dashboard'); return }
        const s = await apiFetch<ApiStudentDetail>('/students/me')
        setStudent(s)
        setForm({
          traditionalAuthority: s.traditionalAuthority ?? '',
          village: s.village ?? '',
          religion: s.religion ?? '',
          homeLanguage: s.homeLanguage ?? '',
          nrbNumber: s.nrbNumber ?? '',
          address: s.address ?? '',
          phone: s.phone ?? '',
          physicalAddress: s.physicalAddress ?? '',
          previousSchool: s.previousSchool ?? '',
          reasonForTransfer: s.reasonForTransfer ?? '',
        })
      } catch {
        setError('We could not load your details. Please refresh the page or sign in again.')
      } finally {
        setLoading(false)
      }
    })
    return () => { settled = true; unsubscribe() }
  }, [router])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!auth?.currentUser || !student) return
    setError(null)
    setSaving(true)
    try {
      await apiFetch('/students/me/registration', {
        method: 'PATCH',
        body: JSON.stringify({
          traditionalAuthority: form.traditionalAuthority,
          village: form.village,
          religion: form.religion,
          homeLanguage: form.homeLanguage,
          address: form.address,
          phone: form.phone,
          physicalAddress: form.physicalAddress,
          previousSchool: form.previousSchool,
          reasonForTransfer: form.reasonForTransfer,
          // NRB can only be added when the school has none on file.
          ...(student.nrbNumber ? {} : { nrbNumber: form.nrbNumber }),
        }),
      })
      // The server cleared the claim; force-refresh so AuthProvider sees the new token
      // and builds the session, then enter the app.
      await auth.currentUser.getIdTokenResult(true)
      router.replace('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your registration. Please try again.')
      setSaving(false)
    }
  }

  const fullName = student ? [student.firstName, student.otherNames, student.lastName].filter(Boolean).join(' ') : ''

  return (
    <div className="hills hills-apply hills-open relative flex-1">
      <PublicAmbientBackground />
      <div className="relative z-10 hills-container hills-apply__wrap">
        <div className="hills-split hills-apply__grid hills-apply__grid--form">
          <div className="hills-apply__side">
            <h1 className="hills-apply__title">Complete your registration</h1>
            <p className="hills-apply__note">
              Your password is set. Please confirm your details to continue. Details the school already
              holds are locked <Lock className="inline w-3 h-3" aria-hidden />; if one is wrong, tell the school office.
            </p>
          </div>

          <form onSubmit={submit} className="hills-apply__form">
            <div className="hills-apply__surface">
              {error && (
                <div role="alert" className="hills-alert mb-4 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /><span>{error}</span>
                </div>
              )}

              {loading ? (
                <div className="skeleton h-64 rounded-xl" aria-hidden />
              ) : !student ? null : (
                <>
                  <div className="hills-apply__fields">
                    <SectionHeader icon={User} title="Personal details" subtitle="Held by the school, locked" />
                    <Locked id="r-name" label="Full name" value={fullName} />
                    <Locked id="r-reg" label="Registration number" value={student.registrationNo} />
                    <Locked id="r-dob" label="Date of birth" value={student.dateOfBirth ? new Date(student.dateOfBirth).toLocaleDateString() : ''} />
                    <Locked id="r-sex" label="Sex" value={student.sex} />
                    <Locked id="r-nat" label="Nationality" value={student.nationality} />
                    <Locked id="r-district" label="District of origin" value={student.district} />
                    <Locked id="r-email" label="Email" value={student.email} />

                    <Field label="Traditional Authority (T/A)" htmlFor="r-ta">
                      <input id="r-ta" className="hills-ctl" value={form.traditionalAuthority} onChange={set('traditionalAuthority')} placeholder="Example: T/A Kuntaja" />
                    </Field>
                    <Field label="Village" htmlFor="r-village">
                      <input id="r-village" className="hills-ctl" value={form.village} onChange={set('village')} placeholder="Home village" autoComplete="off" />
                    </Field>
                    {student.nrbNumber ? (
                      <Locked id="r-nrb" label="National ID / Birth Certificate No. (NRB)" value={student.nrbNumber} />
                    ) : (
                      <Field label="National ID / Birth Certificate No. (NRB)" htmlFor="r-nrb" hint="Optional. Leave blank if not registered">
                        <input id="r-nrb" className="hills-ctl" value={form.nrbNumber} onChange={set('nrbNumber')} autoComplete="off" />
                      </Field>
                    )}
                    <Field label="Religion" htmlFor="r-religion">
                      <input id="r-religion" className="hills-ctl" list="reg-religions" value={form.religion} onChange={set('religion')} />
                      <datalist id="reg-religions">{RELIGIONS.map((r) => <option key={r} value={r} />)}</datalist>
                    </Field>
                    <Field label="Home Language" htmlFor="r-lang">
                      <input id="r-lang" className="hills-ctl" list="reg-languages" value={form.homeLanguage} onChange={set('homeLanguage')} placeholder="Example: Chichewa, Chitumbuka" />
                      <datalist id="reg-languages">{HOME_LANGUAGES.map((l) => <option key={l} value={l} />)}</datalist>
                    </Field>

                    <SectionHeader icon={Phone} title="Contact details" subtitle="How we can reach you" />
                    <Field label="Postal Address" htmlFor="r-address" className="col-span-full">
                      <textarea id="r-address" className="hills-ctl resize-none" rows={2} value={form.address} onChange={set('address')} placeholder="e.g. P.O. Box 123, Blantyre" />
                    </Field>
                    <Field label="Phone Number" htmlFor="r-phone" className="col-span-full">
                      <input id="r-phone" type="tel" className="hills-ctl" value={form.phone} onChange={set('phone')} placeholder="+265 999 000 000" autoComplete="tel" />
                    </Field>

                    <SectionHeader icon={MapPin} title="Home" subtitle="Where you are staying now" />
                    <Field label="Physical Address" htmlFor="r-physical" className="col-span-full">
                      <textarea id="r-physical" className="hills-ctl resize-none" rows={2} value={form.physicalAddress} onChange={set('physicalAddress')} placeholder="e.g. Area 47, Sector 3, Lilongwe" />
                    </Field>

                    <SectionHeader icon={School} title="Schooling" subtitle="Previous school, if any" />
                    <Field label="Previous School" htmlFor="r-prev">
                      <input id="r-prev" className="hills-ctl" value={form.previousSchool} onChange={set('previousSchool')} placeholder="Name of previous school" />
                    </Field>
                    <Field label="Reason for Transfer" htmlFor="r-reason">
                      <input id="r-reason" className="hills-ctl" value={form.reasonForTransfer} onChange={set('reasonForTransfer')} />
                    </Field>

                    <SectionHeader icon={User} title="Guardian" subtitle="Held by the school, locked" />
                    <Locked id="r-gname" label="Guardian full name" value={student.guardianName} />
                    <Locked id="r-grel" label="Relationship" value={student.guardianRelation} />
                    <Locked id="r-gphone" label="Guardian phone" value={student.guardianPhone} />
                  </div>

                  <div className="hills-apply__nav hills-apply__nav--end mt-6">
                    <button type="submit" disabled={saving} className="hills-go hills-go--inline">
                      {saving ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Saving…</> : <>Save and continue <ArrowRight className="hills-go__arrow" /></>}
                    </button>
                  </div>
                </>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
