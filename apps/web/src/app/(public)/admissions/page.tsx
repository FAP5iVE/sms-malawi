'use client'

/**
 * apps/web/src/app/(public)/admissions/page.tsx
 * [CHANGE TYPE]: NEW FILE (production fix, 2026-07-28)
 * [PURPOSE]: Discover -> Admissions destination. Footer's "Prospective
 *   Students" column (How to Apply/Entry Requirements/Fees Structure/
 *   Scholarships) all anchor into sections on this one page. Fee figures
 *   are real (usePublicFeeStructure, FeeStructure table) — not fabricated.
 */

import Link from 'next/link'
import { ArrowLeft, ClipboardCheck, ListChecks, Banknote, Award, Phone, Mail, MapPin } from 'lucide-react'
import { usePublicSchoolInfo, usePublicFeeStructure } from '@/hooks/usePublic'
import { PublicAmbientBackground } from '@/components/shared/PublicAmbientBackground'
import { PublicThemeToggle } from '@/components/shared/PublicThemeToggle'

function formatMWK(amount: number): string {
  return `MWK ${amount.toLocaleString()}`
}

export default function AdmissionsPage() {
  const { data: schoolInfo } = usePublicSchoolInfo()
  const { data: feeData, isLoading: feesLoading } = usePublicFeeStructure()
  const fees = feeData?.items ?? []

  return (
    <div className="min-h-screen bg-page">
      <PublicAmbientBackground />
      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-center justify-between mb-6">
          <Link href="/#discover" className="inline-flex items-center gap-2 text-sm text-brand-teal hover:underline">
            <ArrowLeft className="w-4 h-4" /> Back to home
          </Link>
          <PublicThemeToggle />
        </div>
        <h1 className="font-heading font-extrabold text-3xl sm:text-4xl tracking-tight text-brand-navy dark:text-white mb-3">
          Admissions
        </h1>
        <p className="text-muted leading-relaxed mb-10 max-w-2xl">
          Everything a prospective family needs to know about joining {schoolInfo?.schoolName ?? 'our school'}.
        </p>

        <div className="bg-brand-teal rounded-2xl p-7 mb-14 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div>
            <h2 className="font-heading font-bold text-xl text-white mb-1.5">Ready to apply?</h2>
            <p className="text-sm text-white/80">Start your application online it only takes a few minutes.</p>
          </div>
          <Link
            href="/apply"
            className="shrink-0 bg-white text-brand-teal font-heading font-bold text-sm px-6 py-3.5 rounded-xl hover:bg-white/90 transition-colors whitespace-nowrap"
          >
            Apply for Admission
          </Link>
        </div>

        {/* How to Apply */}
        <section id="how-to-apply" className="mb-14 scroll-mt-24">
          <div className="flex items-center gap-2.5 mb-5">
            <ClipboardCheck className="w-5 h-5 text-brand-teal" aria-hidden />
            <h2 className="font-heading font-bold text-xl text-brand-navy dark:text-white">How to Apply</h2>
          </div>
          <div className="space-y-4">
            {[
              { step: 1, title: 'Complete the online application', desc: 'Fill in the applicant, guardian, and academic history details on our Apply page.' },
              { step: 2, title: 'Submit supporting information', desc: 'Provide your most recent school report and any other requested academic records.' },
              { step: 3, title: 'Application review', desc: 'The admissions office reviews your application against available places and entry requirements.' },
              { step: 4, title: 'Admission decision', desc: 'You will be contacted with the outcome, and — if admitted — next steps for enrolment and fees.' },
            ].map((s) => (
              <div key={s.step} className="flex gap-4">
                <div className="shrink-0 w-9 h-9 rounded-full bg-brand-teal/10 text-brand-teal font-heading font-bold flex items-center justify-center text-sm">
                  {s.step}
                </div>
                <div>
                  <h3 className="font-heading font-semibold text-body">{s.title}</h3>
                  <p className="text-sm text-muted">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Entry Requirements */}
        <section id="entry-requirements" className="mb-14 scroll-mt-24">
          <div className="flex items-center gap-2.5 mb-5">
            <ListChecks className="w-5 h-5 text-brand-purple" aria-hidden />
            <h2 className="font-heading font-bold text-xl text-brand-navy dark:text-white">Entry Requirements</h2>
          </div>
          <ul className="space-y-2.5">
            {[
              'A completed Primary School Leaving Certificate Examination (PSLCE) for Form 1 entry.',
              'A qualifying JCE result for direct Form 3 entry, where a place is available.',
              "A most recent academic report or transcript from the applicant's previous school.",
              'Guardian/next-of-kin contact details for enrolment and ongoing communication.',
            ].map((r) => (
              <li key={r} className="text-sm text-muted flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-purple mt-1.5 shrink-0" aria-hidden />
                {r}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted mt-4">
            Exact requirements can vary by year and available places. The admissions office (contact details
            below) can confirm specifics for your application.
          </p>
        </section>

        {/* Fees */}
        <section id="fees" className="mb-14 scroll-mt-24">
          <div className="flex items-center gap-2.5 mb-5">
            <Banknote className="w-5 h-5 text-brand-amber" aria-hidden />
            <h2 className="font-heading font-bold text-xl text-brand-navy dark:text-white">Fees Structure</h2>
          </div>
          {feesLoading ? (
            <div className="h-32 rounded-xl bg-surface animate-pulse" />
          ) : fees.length === 0 ? (
            <p className="text-sm text-muted">
              Fee figures for the current academic year have not been published yet. Contact the admissions
              office below for the current schedule.
            </p>
          ) : (
            <div className="border border-base rounded-2xl bg-surface overflow-hidden">
              {fees.map((f, i) => (
                <div key={f.name} className={`flex items-center justify-between px-6 py-4 ${i < fees.length - 1 ? 'border-b border-base' : ''}`}>
                  <span className="text-sm font-heading font-semibold text-body">{f.name}</span>
                  <span className="text-sm font-heading font-bold text-brand-navy dark:text-white">{formatMWK(f.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Scholarships */}
        <section id="scholarships" className="mb-14 scroll-mt-24">
          <div className="flex items-center gap-2.5 mb-5">
            <Award className="w-5 h-5 text-brand-coral" aria-hidden />
            <h2 className="font-heading font-bold text-xl text-brand-navy dark:text-white">Scholarships</h2>
          </div>
          <p className="text-sm text-muted leading-relaxed">
            A limited number of scholarships and fee-reduction arrangements are available each year for
            students who qualify, based on academic merit and demonstrated financial need. Scholarship
            enquiries are handled directly by the admissions office, contact details below.
          </p>
        </section>

        {/* Admissions office contact */}
        <section>
          <h2 className="font-heading font-bold text-xl text-brand-navy dark:text-white mb-5">Admissions Office</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="border border-base rounded-xl p-5 flex items-start gap-3">
              <MapPin className="w-4.5 h-4.5 text-brand-teal shrink-0 mt-0.5" aria-hidden />
              <div>
                <div className="text-xs text-muted mb-1">Address</div>
                <div className="text-sm text-body">{schoolInfo?.address ?? '—'}</div>
              </div>
            </div>
            <div className="border border-base rounded-xl p-5 flex items-start gap-3">
              <Phone className="w-4.5 h-4.5 text-brand-teal shrink-0 mt-0.5" aria-hidden />
              <div>
                <div className="text-xs text-muted mb-1">Phone</div>
                <div className="text-sm text-body">{schoolInfo?.phone ?? '—'}</div>
              </div>
            </div>
            <div className="border border-base rounded-xl p-5 flex items-start gap-3">
              <Mail className="w-4.5 h-4.5 text-brand-teal shrink-0 mt-0.5" aria-hidden />
              <div>
                <div className="text-xs text-muted mb-1">Email</div>
                <div className="text-sm text-body">{schoolInfo?.email ?? '—'}</div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}