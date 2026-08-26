/**
 * [CHANGE TYPE]: MAJOR REWRITE
 * [FILE]: apps/web/src/app/(public)/privacy/page.tsx
 * [R-PHASE]: R5 — Academics I: Admissions & Student Records (content follow-up)
 * [PURPOSE]: Replaces the R5 placeholder Privacy Policy body with the school's
 *   real policy text, drafted against Malawi's Data Protection Act, 2024 and
 *   section 21 of the Constitution. Page shell (header/nav, container widths,
 *   design tokens) unchanged from the R5 NEW FILE version; only the content
 *   column and the closing disclaimer are rewritten.
 * [NOTE]: Deliberate departures from the pasted source text — see chat notes.
 * [DEPENDS ON]: none
 */
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PublicAmbientBackground } from '@/components/shared/PublicAmbientBackground'

const LAST_UPDATED = 'August 2026'

export default function PrivacyPolicyPage() {
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
              Privacy Policy
            </span>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <h1 className="font-heading font-bold text-3xl text-brand-navy mb-2">Privacy Policy</h1>
        <p className="text-muted text-sm font-sans mb-10">Last updated: {LAST_UPDATED}</p>

        <div className="space-y-8 font-sans text-body leading-relaxed">
          <div className="space-y-4">
            <p>
              [School&apos;s full legal name] (&quot;the School&quot;, &quot;we&quot;,
              &quot;us&quot;) respects your privacy and is committed to protecting the
              personal data of everyone who interacts with us — prospective and current
              students, parents and guardians, staff, and visitors to our website. This
              Privacy Policy explains what personal data we collect, why, how we use and
              protect it, and what rights you have over it.
            </p>
            <p>
              This Policy is written to comply with the Data Protection Act, 2024,
              Malawi&apos;s principal data protection law, and with the right to privacy
              guaranteed under section 21 of the Constitution of the Republic of Malawi.
              Where our systems or service providers involve processing outside Malawi, we
              also describe the safeguards that apply.
            </p>
          </div>

          <section id="who-we-are">
            <h2 className="font-heading font-bold text-lg text-brand-navy mb-2">1. Who we are</h2>
            <p>
              [School&apos;s full legal name] is the <strong>data controller</strong>{' '}
              responsible for the personal data described in this Policy — meaning we
              decide why and how it is processed. Our contact details are set out in{' '}
              <Link href="#contact-us" className="text-brand-teal hover:underline">
                section 14
              </Link>{' '}
              below.
            </p>
          </section>

          <section id="scope">
            <h2 className="font-heading font-bold text-lg text-brand-navy mb-2">2. Scope of this Policy</h2>
            <p className="mb-3">This Policy applies to personal data we collect:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>through the School&apos;s website and online admissions application;</li>
              <li>through the student, guardian, and staff Portal;</li>
              <li>in the course of a student&apos;s enrolment and education at the School;</li>
              <li>
                when you subscribe to our newsletter, submit an enquiry through our contact
                form, or otherwise communicate with us; and
              </li>
              <li>
                when you interact with our public pages (for example, published examination
                or placement results, which we treat as public information once officially
                released — see{' '}
                <Link href="#what-is-public" className="text-brand-teal hover:underline">
                  section 6
                </Link>
                ).
              </li>
            </ul>
            <p className="mt-3">
              It does not apply to websites operated by third parties that we may link to,
              or to information you provide to other organisations such as MANEB, NCHE, or
              the Ministry of Education, which have their own privacy practices.
            </p>
          </section>

          <section id="personal-data-we-collect">
            <h2 className="font-heading font-bold text-lg text-brand-navy mb-2">3. Personal data we collect</h2>
            <p className="mb-3">Depending on how you interact with the School, we may collect:</p>
            <div className="overflow-x-auto rounded-lg border border-base mb-3">
              <table className="w-full text-sm text-left">
                <caption className="sr-only">Categories of personal data we collect, with examples</caption>
                <thead className="bg-surface">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-heading font-semibold text-brand-navy border-b border-base w-40 sm:w-48">
                      Category
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-heading font-semibold text-brand-navy border-b border-base">
                      Examples
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-base">
                    <td className="px-4 py-2.5 align-top font-medium">Identity data</td>
                    <td className="px-4 py-2.5 align-top">
                      Full name, date of birth, sex, nationality, national identification or
                      registration number
                    </td>
                  </tr>
                  <tr className="border-b border-base">
                    <td className="px-4 py-2.5 align-top font-medium">Contact data</td>
                    <td className="px-4 py-2.5 align-top">
                      Home address, district and village, phone number, email address
                    </td>
                  </tr>
                  <tr className="border-b border-base">
                    <td className="px-4 py-2.5 align-top font-medium">Guardian/family data</td>
                    <td className="px-4 py-2.5 align-top">
                      Parent or guardian&apos;s name, relationship to the student, contact
                      details
                    </td>
                  </tr>
                  <tr className="border-b border-base">
                    <td className="px-4 py-2.5 align-top font-medium">Admissions data</td>
                    <td className="px-4 py-2.5 align-top">
                      Application details, prior school and results, supporting documents
                      you submit
                    </td>
                  </tr>
                  <tr className="border-b border-base">
                    <td className="px-4 py-2.5 align-top font-medium">Academic data</td>
                    <td className="px-4 py-2.5 align-top">
                      Class and form, subjects, marks and grades, examination and assessment
                      records, attendance, promotion and placement records
                    </td>
                  </tr>
                  <tr className="border-b border-base">
                    <td className="px-4 py-2.5 align-top font-medium">Financial data</td>
                    <td className="px-4 py-2.5 align-top">Fee invoices and payment records</td>
                  </tr>
                  <tr className="border-b border-base">
                    <td className="px-4 py-2.5 align-top font-medium">Health and welfare data</td>
                    <td className="px-4 py-2.5 align-top">
                      Information relevant to a student&apos;s safety, welfare, or medical
                      needs, where shared with us for safeguarding purposes
                    </td>
                  </tr>
                  <tr className="border-b border-base">
                    <td className="px-4 py-2.5 align-top font-medium">Photographs and media</td>
                    <td className="px-4 py-2.5 align-top">
                      Photographs or video taken at school events, for the school yearbook,
                      newsletter, or website, where applicable consents are in place
                    </td>
                  </tr>
                  <tr className="border-b border-base">
                    <td className="px-4 py-2.5 align-top font-medium">Account and usage data</td>
                    <td className="px-4 py-2.5 align-top">
                      Portal login activity, and technical data such as IP address, browser
                      type, and pages visited on our website
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 align-top font-medium">Communications data</td>
                    <td className="px-4 py-2.5 align-top">
                      Messages you send us, and your newsletter subscription status
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mb-3">
              We collect most of this information directly from you (or, for a student, from
              their parent or guardian). Some academic and examination data is received from
              official bodies such as MANEB, in the ordinary course of administering the
              School.
            </p>
            <p>
              <strong>Sensitive personal data.</strong> Health, welfare, and similarly
              sensitive information falls into a special category under the Data Protection
              Act, 2024, and we apply additional care to how it is collected, used, and
              restricted to those who need it for safeguarding or pastoral purposes.
            </p>
          </section>

          <section id="why-we-use-your-information">
            <h2 className="font-heading font-bold text-lg text-brand-navy mb-2">
              4. Why we use your information, and our legal basis
            </h2>
            <p className="mb-3">
              Malawian law requires that any processing of personal data have a lawful
              basis. We rely on the following, depending on the purpose:
            </p>
            <div className="overflow-x-auto rounded-lg border border-base mb-3">
              <table className="w-full text-sm text-left">
                <caption className="sr-only">Purposes we use your information for, and the legal basis for each</caption>
                <thead className="bg-surface">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-heading font-semibold text-brand-navy border-b border-base w-56 sm:w-64">
                      We use your information to…
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-heading font-semibold text-brand-navy border-b border-base">
                      On this legal basis
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-base">
                    <td className="px-4 py-2.5 align-top font-medium">
                      Process an admissions application and communicate its outcome
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      Taking steps at your request before entering into a contract, and our
                      legitimate interest in administering admissions fairly
                    </td>
                  </tr>
                  <tr className="border-b border-base">
                    <td className="px-4 py-2.5 align-top font-medium">
                      Enrol, educate, assess, and support a student, and maintain their
                      academic record
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      Performance of our contract with the student&apos;s family, and our
                      legal obligations as an educational institution
                    </td>
                  </tr>
                  <tr className="border-b border-base">
                    <td className="px-4 py-2.5 align-top font-medium">
                      Safeguard student welfare and respond to health or safety needs
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      Protecting the vital interests of the student, and our legal
                      obligations
                    </td>
                  </tr>
                  <tr className="border-b border-base">
                    <td className="px-4 py-2.5 align-top font-medium">Administer fees and payments</td>
                    <td className="px-4 py-2.5 align-top">
                      Performance of our contract with the student&apos;s family
                    </td>
                  </tr>
                  <tr className="border-b border-base">
                    <td className="px-4 py-2.5 align-top font-medium">Send newsletter updates</td>
                    <td className="px-4 py-2.5 align-top">
                      Your consent, which you may withdraw at any time (see{' '}
                      <Link href="#your-choices" className="text-brand-teal hover:underline">
                        section 8
                      </Link>
                      )
                    </td>
                  </tr>
                  <tr className="border-b border-base">
                    <td className="px-4 py-2.5 align-top font-medium">
                      Publish official examination or placement results
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      Our legal obligation and public interest in the transparent
                      administration of national examinations and placement, consistent
                      with how such results are officially released
                    </td>
                  </tr>
                  <tr className="border-b border-base">
                    <td className="px-4 py-2.5 align-top font-medium">
                      Operate and secure the Portal and website
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      Our legitimate interest in providing a functioning, secure service
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 align-top font-medium">Respond to enquiries you send us</td>
                    <td className="px-4 py-2.5 align-top">Your consent, given by contacting us</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              We do not use your personal data for any purpose incompatible with the
              purposes above, and we do not sell personal data to third parties.
            </p>
          </section>

          <section id="childrens-personal-data">
            <h2 className="font-heading font-bold text-lg text-brand-navy mb-2">
              5. Children&apos;s personal data
            </h2>
            <p className="mb-3">
              Many of the individuals whose data we process are children under the age of
              18. Where the legal basis for processing a child&apos;s personal data is
              consent — for example, using a student&apos;s photograph in a newsletter — we
              obtain that consent from the student&apos;s parent or legal guardian, and we
              take reasonable steps to verify that the person giving consent holds parental
              responsibility for the child. Where a student is themselves an adult (18 or
              older), we treat them as the data subject for their own data, consistent with
              how the law defines a child.
            </p>
            <p>
              For most of what we do — enrolling, teaching, assessing, and safeguarding a
              student — our legal basis is our contract with the family and our legal
              obligations as a school, rather than consent, because these activities are
              necessary for us to educate the child safely and are not optional.
            </p>
          </section>

          <section id="what-is-public">
            <h2 className="font-heading font-bold text-lg text-brand-navy mb-2">
              6. What is public, and what is not
            </h2>
            <p>
              Certain information — such as officially released examination or university
              placement results — is published information once released by the relevant
              examining or placing authority, and we may display it on public pages of our
              website (for example, a list of students placed at universities). We only
              publish what has been officially confirmed; we do not publish provisional,
              unconfirmed, or self-reported outcomes, and we do not publish grades, marks,
              or any other personal data beyond what is necessary to communicate the
              outcome. Everything else described in this Policy — including a
              student&apos;s academic record, contact details, and health information — is
              private and is not made public.
            </p>
          </section>

          <section id="who-we-share-your-information-with">
            <h2 className="font-heading font-bold text-lg text-brand-navy mb-2">
              7. Who we share your information with
            </h2>
            <p className="mb-3">We share personal data only where necessary, and only with:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong>Government and examining bodies</strong>, such as MANEB, NCHE, and
                the Ministry of Education, where required by law or necessary to administer
                a student&apos;s education and examinations;
              </li>
              <li>
                <strong>Service providers</strong> who process data on our behalf under our
                instructions — for example, providers of our website hosting, database,
                authentication, file storage, and email delivery services — bound by
                confidentiality and data protection obligations;
              </li>
              <li>
                <strong>Professional advisers</strong>, such as auditors or legal counsel,
                where necessary;
              </li>
              <li>
                <strong>Authorities</strong>, where we are required to disclose information
                by law, court order, or to protect the safety of a student or others.
              </li>
            </ul>
            <p className="mt-3">
              We do not share personal data with third parties for their own marketing
              purposes, and we do not sell personal data.
            </p>
          </section>

          <section id="your-choices">
            <h2 className="font-heading font-bold text-lg text-brand-navy mb-2">8. Your choices</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong>Newsletter.</strong> You may unsubscribe from our newsletter at any
                time using the link in any newsletter email, or by contacting us.
              </li>
              <li>
                <strong>Marketing and photographs.</strong> Where we rely on your consent
                (for example, to use a student&apos;s photograph), you may withdraw that
                consent at any time by contacting us; this will not affect the lawfulness
                of anything already done with your consent.
              </li>
              <li>
                <strong>Cookies.</strong> Our website uses only the cookies strictly
                necessary for it to function, such as keeping you signed in to the Portal.
                We do not currently use non-essential tracking, analytics, or advertising
                cookies. If this changes, we will update this Policy and seek your consent
                where the law requires it.
              </li>
            </ul>
          </section>

          <section id="international-data-transfers">
            <h2 className="font-heading font-bold text-lg text-brand-navy mb-2">
              9. International data transfers
            </h2>
            <p>
              Some of the service providers we use to host and operate our website and
              Portal store or process data outside Malawi. Where personal data is
              transferred outside Malawi, we take steps to ensure it remains protected to a
              standard consistent with the Data Protection Act, 2024 — for example, by
              using providers that maintain recognised international security standards and
              by putting appropriate contractual safeguards in place.
            </p>
          </section>

          <section id="how-long-we-keep-your-information">
            <h2 className="font-heading font-bold text-lg text-brand-navy mb-2">
              10. How long we keep your information
            </h2>
            <p>
              We keep personal data only for as long as necessary for the purposes
              described in this Policy, including to meet our legal, academic
              record-keeping, and safeguarding obligations. Academic records are generally
              retained for the period required to support a former student&apos;s future
              reference and transcript requests; other data (such as an unsuccessful
              application) is retained only as long as necessary before being securely
              deleted or anonymised.
            </p>
          </section>

          <section id="keeping-your-information-secure">
            <h2 className="font-heading font-bold text-lg text-brand-navy mb-2">
              11. Keeping your information secure
            </h2>
            <p>
              We implement appropriate technical and organisational measures to protect
              personal data against unauthorised access, loss, misuse, or disclosure —
              including access controls, encryption in transit, and restricting access to
              those who need it to do their jobs. No system can be guaranteed completely
              secure, but we review and improve our safeguards on an ongoing basis, and we
              will notify you and the relevant authority without undue delay if a breach
              affecting your data poses a risk to your rights, as required by law.
            </p>
          </section>

          <section id="your-rights">
            <h2 className="font-heading font-bold text-lg text-brand-navy mb-2">
              12. Your rights, and how to exercise them
            </h2>
            <p className="mb-3">Under the Data Protection Act, 2024, you have the right to:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong>access</strong> the personal data we hold about you;</li>
              <li><strong>request correction</strong> of inaccurate or incomplete data;</li>
              <li><strong>request deletion</strong> of your data, in certain circumstances;</li>
              <li>
                <strong>request that we restrict</strong> how your data is processed, in
                certain circumstances;
              </li>
              <li>
                <strong>receive a copy</strong> of data you provided to us in a structured,
                commonly used format, and have it transferred to another controller where
                technically feasible;
              </li>
              <li><strong>object</strong> to processing carried out on certain legal bases; and</li>
              <li>
                <strong>withdraw consent</strong> at any time, where consent is our legal
                basis for processing.
              </li>
            </ul>
            <p className="mt-3">
              For a child, these rights are generally exercised by the parent or legal
              guardian on the child&apos;s behalf.
            </p>
            <p className="mt-3">
              To exercise any of these rights, please contact the School&apos;s
              administration office — see the details on our{' '}
              <Link href="/#contact" className="text-brand-teal hover:underline">
                homepage
              </Link>
              . We will respond within the timeframe required by law.
            </p>
            <p className="mt-3">
              If you are not satisfied with our response, you have the right to lodge a
              complaint with the Malawi Communications Regulatory Authority (MACRA),
              designated as the Data Protection Authority under the Data Protection Act,
              2024, currently reachable through the Data Protection Authority&apos;s own
              channels (
              <a
                href="https://dpa.mw"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-teal hover:underline"
              >
                dpa.mw
              </a>
              ).
            </p>
          </section>

          <section id="changes-to-this-policy">
            <h2 className="font-heading font-bold text-lg text-brand-navy mb-2">
              13. Changes to this Policy
            </h2>
            <p>
              We may update this Policy from time to time, including to reflect changes in
              our practices or in applicable law. The &quot;Last updated&quot; date at the
              top of this page shows when it was last revised. We encourage you to review
              this Policy periodically.
            </p>
          </section>

          <section id="contact-us">
            <h2 className="font-heading font-bold text-lg text-brand-navy mb-2">14. Contact us</h2>
            <p>
              Questions about this Policy or your personal information can be directed to
              the School&apos;s administration office — see the contact details on our{' '}
              <Link href="/#contact" className="text-brand-teal hover:underline">
                homepage
              </Link>
              .
            </p>
          </section>

          <p className="text-xs text-muted border-t border-base pt-6">
            This page reflects the school&apos;s Privacy Policy as drafted against
            Malawi&apos;s Data Protection Act, 2024 and applicable law, and is pending
            final review and sign-off by the school&apos;s legal counsel before being
            relied on for compliance purposes.
          </p>
        </div>
      </main>
    </div>
  )
}