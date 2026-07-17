/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/app/(public)/privacy/page.tsx
 * [R-PHASE]: R5 — Academics I: Admissions & Student Records
 * [PURPOSE]: Gives the landing page footer's "Privacy Policy" link a real,
 *   non-broken destination (it previously pointed at href="#"). Minimal
 *   static page with a shared header/footer and a single content column,
 *   matching the site's public-page visual language. Populating final,
 *   legally-reviewed policy text is a content task outside this phase's
 *   scope — the placeholder copy below is clearly generic and should be
 *   replaced by the school's actual policy before this page is relied on
 *   for compliance purposes.
 * [DEPENDS ON]: none
 */
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-page">
      <header className="bg-surface border-b border-base sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-muted hover:text-body text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden /> Home
          </Link>
          <div className="h-4 w-px bg-base shrink-0" />
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-brand-navy flex items-center justify-center">
              <span className="text-white text-xs font-heading font-bold">S</span>
            </div>
            <span className="font-heading font-semibold text-sm text-brand-navy">
              Privacy Policy
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <h1 className="font-heading font-bold text-3xl text-brand-navy mb-2">Privacy Policy</h1>
        <p className="text-muted text-sm font-sans mb-10">Last updated: {new Date().getFullYear()}</p>

        <div className="space-y-8 font-sans text-body leading-relaxed">
          <section>
            <h2 className="font-heading font-bold text-lg text-brand-navy mb-2">Overview</h2>
            <p>
              SMS Malawi collects and processes personal information — including admissions
              applications, student records, and newsletter subscriptions — solely to operate
              the school and communicate with applicants, students, guardians, and staff.
            </p>
          </section>

          <section>
            <h2 className="font-heading font-bold text-lg text-brand-navy mb-2">Information we collect</h2>
            <p>
              Depending on how you interact with the school (applying for admission, enrolling
              as a student, or subscribing to our newsletter), we may collect names, dates of
              birth, contact details, guardian information, and academic records.
            </p>
          </section>

          <section>
            <h2 className="font-heading font-bold text-lg text-brand-navy mb-2">How we use it</h2>
            <p>
              Information is used to process admissions, maintain student records, communicate
              school announcements, and — where you have opted in — send newsletter updates. We
              do not sell personal information to third parties.
            </p>
          </section>

          <section>
            <h2 className="font-heading font-bold text-lg text-brand-navy mb-2">Contact us</h2>
            <p>
              Questions about this policy or your personal information can be directed to the
              school&apos;s administration office — see the contact details on our{' '}
              <Link href="/#contact" className="text-brand-teal hover:underline">
                homepage
              </Link>
              .
            </p>
          </section>

          <p className="text-xs text-muted border-t border-base pt-6">
            This page contains placeholder policy text and has not yet been reviewed by legal
            counsel. It should be replaced with the school&apos;s finalised, reviewed privacy
            policy before being relied on for compliance purposes.
          </p>
        </div>
      </main>
    </div>
  )
}
