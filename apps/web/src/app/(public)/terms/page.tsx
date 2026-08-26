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
import { PublicAmbientBackground } from '@/components/shared/PublicAmbientBackground'

export default function TermsOfUsePage() {
  return (
    <div className="min-h-screen bg-page">
      <PublicAmbientBackground />
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

      <main className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <h1 className="font-heading font-bold text-3xl text-brand-navy mb-2">Terms of Use</h1>
        <p className="text-muted text-sm font-sans mb-10">Last updated: {new Date().getFullYear()}</p>

        <p className="font-sans text-body leading-relaxed text-muted-foreground mb-8">
          These Terms of Use govern your access to and use of the website, 
          including the admissions application form, the public information pages, and the student/staff portal. 
          They are issued by [School&apos;s full legal name] (&ldquo;the School&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;), 
          a school registered and operating in the Republic of Malawi.
        </p>

        <div className="space-y-8 font-sans text-body leading-relaxed">
          <section>
            <h2 className="font-heading font-bold text-lg text-brand-navy mb-2">Acceptance of terms</h2>
            <p>
              By accessing the Site, submitting an admissions application, or signing in to the Portal, 
              you agree to be bound by these Terms and by our Privacy Policy, which is incorporated into these Terms by reference. 
              If you do not agree to these Terms, please do not use the Site.
              If you are accessing the Site or submitting an application on behalf of a child, 
              you confirm that you are the child&apos;s parent or legal guardian, or otherwise have lawful authority 
              to act for them, and that you accept these Terms on their behalf as well as your own.
            </p>
          </section>

          <section>
            <h2 className="font-heading font-bold text-lg text-brand-navy mb-2">Admissions applications</h2>
            <p>
              You may apply for admission through our{' '}
              <Link href="/apply" className="text-brand-teal hover:underline">
                admissions form
              </Link>{' '}
              Submitting an application:
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  does not guarantee a place at the School, admission is subject to the School&apos;s admissions criteria, 
                  available capacity, and the School&apos;s discretion;
                  </li>
                <li>
                  is treated by the School as a genuine expression of interest, and information you provide will be used to 
                  assess and process the application as described in our Privacy Policy;
                </li>
                <li>
                  may require you to provide supporting documents (such as previous results or identification), 
                  which you confirm you are authorised to submit.
                </li>
              </ul>

              <p className="mt-4">
                We will communicate the outcome of an application to the email address or phone number you provide. 
                Please keep your contact details current until the admissions process is complete.
              </p>
            </p>
          </section>

          <section>
            <h2 className="font-heading font-bold text-lg text-brand-navy mb-2">The Portal access and conduct</h2>
            <p className="mb-4">
              Access to the student and staff portal is granted only to enrolled students,
              guardians, and staff members and is governed by the school&apos;s account and
              conduct policies.
            </p>
            <p className="mb-2">
              By using the Portal, you agree to:
            </p>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li>
                keep your login credentials confidential and not share your 
                account with anyone else;
              </li>
              <li>
                notify the School promptly if you suspect unauthorised access 
                to your account;
              </li>
              <li>
                use the Portal only for its intended purpose, and not to access, 
                or attempt to access, information you are not authorised to see;
              </li>
              <li>
                comply with the School&apos;s account and conduct policies, which 
                may be issued or updated from time to time and which form 
                part of these Terms.
              </li>
            </ul>
            <p>
              The School may suspend or terminate Portal access including 
              where a student leaves the School, an account is misused, or these 
              Terms are breached without that affecting any other rights the 
              School may have.
            </p>
          </section>

          <section className="mb-8">
              <h2 className="font-heading font-bold text-lg text-brand-navy mb-2">
                Acceptable use
              </h2>
              <p className="mb-2">You must not use the Site or Portal to:</p>
              <ul className="list-disc pl-5 space-y-2 mb-4">
                <li>
                  gain, or attempt to gain, unauthorised access to any account, data, or system on the Site;
                </li>
                <li>
                  interfere with, disrupt, or introduce any malicious code (including viruses) into the Site or Portal;
                </li>
                <li>
                  send, post, or transmit any content that is harassing, threatening, defamatory, obscene, 
                  or otherwise unlawful;
                </li>
                <li>
                  impersonate any person, or misrepresent your affiliation with the School;
                </li>
                <li>
                  use the Site or Portal for any unlawful purpose, including in a manner that would constitute an 
                  offence under Malawi&apos;s electronic transactions and cybersecurity legislation.
                </li>
              </ul>
              <p>
                We take these obligations seriously, and behaviour that would amount to an offence under Malawian law 
                including unauthorised access to data, cyber harassment, or offensive electronic communication
                may be reported to the appropriate authorities in addition to any action the School takes under its own 
                policies.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="font-heading font-bold text-lg text-brand-navy mb-2">
                Electronic communications and signatures
              </h2>
              <p>
                Where you submit information, apply for admission, or otherwise transact with us electronically, 
                you agree that your electronic submission constitutes your signature and acceptance to the same extent as 
                if it were made on paper, in accordance with Malawian law recognising the validity of electronic records and 
                signatures. We may retain a copy of any electronic transaction as our record of it.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="font-heading font-bold text-lg text-brand-navy mb-2">
                Intellectual property
              </h2>
              <p>
                All content on the Site including text, the School&apos;s name and logo, photographs, and design 
                is owned by or licensed to the School and is protected by applicable intellectual property law. 
                You may view and print pages of the Site for your own personal, non-commercial use 
                (for example, to complete an application). You may not reproduce, republish, 
                or otherwise use our content for any other purpose without our prior written consent.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="font-heading font-bold text-lg text-brand-navy mb-2">
                Third-party links
              </h2>
              <p>
                The Site may link to websites operated by third parties (for example, examination boards, government portals, or partner organisations). 
                We do not control, and are not responsible for, the content or privacy practices of any third-party website. 
                Visiting a linked site is at your own risk and subject to that site&apos;s own terms.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="font-heading font-bold text-lg text-brand-navy mb-2">
                No warranty; limitation of liability
              </h2>
              <p className="mb-4">
                The Site is provided &ldquo;as is.&rdquo; While we take reasonable care to keep the Site accurate and available, 
                we do not warrant that it will be uninterrupted, error-free, or free of harmful components, 
                and we make no warranty as to the accuracy or completeness of published information 
                (including, for example, public examination or placement results, which are also subject to correction 
                by the relevant examining or placing authority).
              </p>
              <p>
                To the fullest extent permitted by Malawian law, the School shall not be liable for any indirect, incidental, or 
                consequential loss arising from your use of, or inability to use, the Site. 
                Nothing in these Terms excludes or limits liability that cannot lawfully be excluded or limited, 
                including liability arising from our own fraud or wilful misconduct.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="font-heading font-bold text-lg text-brand-navy mb-2">
                Indemnity
              </h2>
              <p>
                You agree to indemnify and hold the School harmless from any claim, loss, or expense 
                (including reasonable legal costs) arising from your breach of these Terms or your misuse of the Site or Portal.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="font-heading font-bold text-lg text-brand-navy mb-2">
                Changes to these Terms
              </h2>
              <p>
                We may update these Terms from time to time, including to reflect changes in our services or in applicable law. 
                The &ldquo;Last updated&rdquo; date at the top of this page will show when the Terms were last revised. 
                Continued use of the Site after an update constitutes acceptance of the revised Terms. 
                Where a change materially affects Portal users, we will take reasonable steps to notify affected users.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="font-heading font-bold text-lg text-brand-navy mb-2">
                Governing law and disputes
              </h2>
              <p>
                These Terms are governed by the laws of the Republic of Malawi. 
                Any dispute arising out of or relating to these Terms or your use of the Site shall be subject to the exclusive 
                jurisdiction of the courts of Malawi. Before initiating formal proceedings, 
                we encourage you to raise any concern with us directly using the contact details below, 
                so that we can try to resolve it informally.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="font-heading font-bold text-lg text-brand-navy mb-2">
                Contact us
              </h2>
              <p>
                Questions about these Terms, or about the Site more generally, can be directed to the School&apos;s 
                administration office see the contact details on our{' '}
                <Link href="/#contact" className="text-brand-teal hover:underline">
                  homepage
                </Link>
                .
              </p>
          </section>

          <p className="text-xs text-muted border-t border-base pt-6">
            This page reflects the school&apos;s Terms of Use as drafted against Malawi&apos;s Data
            Protection Act, 2024 and applicable law, and is under review and sign-off by
            the school&apos;s legal counsel before being relied on for compliance purposes.
          </p>
        </div>
      </main>
    </div>
  )
}