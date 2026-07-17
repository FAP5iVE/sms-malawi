/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/app/(public)/terms/page.tsx
 * [R-PHASE]: R5 — Academics I: Admissions & Student Records
 * [PURPOSE]: Gives the landing page footer's "Terms of Use" link a real,
 *   non-broken destination (it previously pointed at href="#"). Minimal
 *   static page with a shared header/footer and a single content column,
 *   matching the site's public-page visual language and the sibling
 *   privacy policy page's layout. Populating final, legally-reviewed terms
 *   is a content task outside this phase's scope — the placeholder copy
 *   below is clearly generic and should be replaced by the school's actual
 *   terms before this page is relied on for compliance purposes.
 * [DEPENDS ON]: none
 */
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function TermsOfUsePage() {
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
              Terms of Use
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <h1 className="font-heading font-bold text-3xl text-brand-navy mb-2">Terms of Use</h1>
        <p className="text-muted text-sm font-sans mb-10">Last updated: {new Date().getFullYear()}</p>

        <div className="space-y-8 font-sans text-body leading-relaxed">
          <section>
            <h2 className="font-heading font-bold text-lg text-brand-navy mb-2">Acceptance of terms</h2>
            <p>
              By accessing this website or submitting an admissions application, you agree to
              these terms of use. If you do not agree, please do not use this website.
            </p>
          </section>

          <section>
            <h2 className="font-heading font-bold text-lg text-brand-navy mb-2">Admissions applications</h2>
            <p>
              Submitting an application through the{' '}
              <Link href="/apply" className="text-brand-teal hover:underline">
                admissions form
              </Link>{' '}
              does not guarantee acceptance. All information provided must be accurate and
              complete; providing false information may result in rejection or cancellation of
              admission.
            </p>
          </section>

          <section>
            <h2 className="font-heading font-bold text-lg text-brand-navy mb-2">Portal access</h2>
            <p>
              Access to the student and staff portal is granted only to enrolled students,
              guardians, and staff members and is governed by the school&apos;s account and
              conduct policies.
            </p>
          </section>

          <section>
            <h2 className="font-heading font-bold text-lg text-brand-navy mb-2">Contact us</h2>
            <p>
              Questions about these terms can be directed to the school&apos;s administration
              office — see the contact details on our{' '}
              <Link href="/#contact" className="text-brand-teal hover:underline">
                homepage
              </Link>
              .
            </p>
          </section>

          <p className="text-xs text-muted border-t border-base pt-6">
            This page contains placeholder terms and has not yet been reviewed by legal counsel.
            It should be replaced with the school&apos;s finalised, reviewed terms of use before
            being relied on for compliance purposes.
          </p>
        </div>
      </main>
    </div>
  )
}
