'use client'

/**
 * apps/web/src/app/(public)/academics/page.tsx
 * [CHANGE TYPE]: NEW FILE (production fix, 2026-07-28)
 * [PURPOSE]: Discover -> Academics destination. Services offered, the
 *   Malawian secondary curriculum, MANEB standards, and facilities —
 *   footer's "Curriculum" and "Facilities" links anchor into this page's
 *   #curriculum and #facilities sections.
 * [DEPENDS ON]: usePublicManebStats for the real MANEB pass-rate figures
 *   already live on the landing page — not duplicated data, same source.
 */

import Link from 'next/link'
import { ArrowLeft, BookOpen, FlaskConical, Library, Monitor, GraduationCap, ExternalLink } from 'lucide-react'
import { usePublicManebStats } from '@/hooks/usePublic'

const SUBJECTS_JUNIOR = [
  'English', 'Chichewa', 'Mathematics', 'Biology', 'Physical Science',
  'Social & Development Studies', 'Life Skills', 'Agriculture', 'Bible Knowledge / Islamic Studies',
]
const SUBJECTS_SENIOR = [
  'English', 'Chichewa', 'Mathematics', 'Biology', 'Physical Science (Physics & Chemistry)',
  'Geography', 'History', 'Life Skills', 'Agriculture', 'Bible Knowledge / Islamic Studies',
  'Additional electives depending on staffing and demand',
]

export default function AcademicsPage() {
  const { data: manebStats } = usePublicManebStats()

  return (
    <div className="min-h-screen bg-page">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <Link href="/#about" className="inline-flex items-center gap-2 text-sm text-brand-teal hover:underline mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to home
        </Link>
        <h1 className="font-heading font-extrabold text-3xl sm:text-4xl tracking-tight text-brand-navy dark:text-white mb-3">
          Academics
        </h1>
        <p className="text-muted leading-relaxed mb-12 max-w-2xl">
          A curriculum built around the national Malawian secondary syllabus, preparing every learner for the
          Junior Certificate of Education (JCE) at the end of Form 2 and the Malawi School Certificate of
          Education (MSCE) at the end of Form 4.
        </p>

        {/* What we offer */}
        <section className="mb-14">
          <h2 className="font-heading font-bold text-xl text-brand-navy dark:text-white mb-5">What We Offer</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { icon: BookOpen, title: 'Full Form 1–4 Programme', desc: 'A complete four-year secondary programme from junior entry through to MSCE candidacy.' },
              { icon: GraduationCap, title: 'MANEB-Aligned Teaching', desc: 'Lessons, internal assessments and mock exams set against the current MANEB syllabus and marking standards.' },
              { icon: FlaskConical, title: 'Practical Science', desc: 'Hands-on laboratory work for Biology and Physical Science, a MANEB practical-exam requirement.' },
              { icon: Library, title: 'Library & Study Support', desc: 'A working library and structured study periods, especially through Form 2 and Form 4 exam terms.' },
            ].map((f) => (
              <div key={f.title} className="border border-base rounded-2xl bg-surface p-6">
                <f.icon className="w-6 h-6 text-brand-teal mb-3" aria-hidden />
                <h3 className="font-heading font-bold text-body mb-1.5">{f.title}</h3>
                <p className="text-sm text-muted leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Curriculum */}
        <section id="curriculum" className="mb-14 scroll-mt-24">
          <h2 className="font-heading font-bold text-xl text-brand-navy dark:text-white mb-2">The Malawian Secondary Curriculum</h2>
          <p className="text-sm text-muted leading-relaxed mb-6">
            Secondary education in Malawi runs four years, split into two examined stages set and marked
            externally by the Malawi National Examinations Board (MANEB) — the school teaches to this
            national syllabus at every level, never setting or marking these external exams itself.
          </p>
          <div className="grid sm:grid-cols-2 gap-6">
            <div className="border border-base rounded-2xl bg-surface p-6">
              <h3 className="font-heading font-bold text-body mb-1">Form 1 – 2: Junior Certificate (JCE)</h3>
              <p className="text-xs text-muted mb-4">Externally examined by MANEB at the end of Form 2, Term 3.</p>
              <ul className="space-y-1.5">
                {SUBJECTS_JUNIOR.map((s) => (
                  <li key={s} className="text-sm text-muted flex items-start gap-2">
                    <span className="w-1 h-1 rounded-full bg-brand-teal mt-2 shrink-0" aria-hidden />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
            <div className="border border-base rounded-2xl bg-surface p-6">
              <h3 className="font-heading font-bold text-body mb-1">Form 3 – 4: MSCE</h3>
              <p className="text-xs text-muted mb-4">Externally examined by MANEB at the end of Form 4, Term 3.</p>
              <ul className="space-y-1.5">
                {SUBJECTS_SENIOR.map((s) => (
                  <li key={s} className="text-sm text-muted flex items-start gap-2">
                    <span className="w-1 h-1 rounded-full bg-brand-teal mt-2 shrink-0" aria-hidden />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* MANEB standards */}
        <section className="mb-14">
          <h2 className="font-heading font-bold text-xl text-brand-navy dark:text-white mb-2">About MANEB Standards</h2>
          <p className="text-sm text-muted leading-relaxed mb-4">
            MANEB grades JCE on an A–F scale and MSCE on a 1–9 point scale, with promotion between forms
            based on a student&apos;s continuous assessment and, at Form 2 and Form 4, the externally-set national
            exam result. The school&apos;s own grading and promotion records follow these same national scales
            throughout — nothing is set or marked internally at those two exam points.
          </p>
          {manebStats && manebStats.stats.length > 0 && (
            <div className="flex flex-wrap gap-4 mb-4">
              {manebStats.stats.map((s) => (
                <div key={s.examType} className="border border-base rounded-xl px-5 py-3 bg-surface">
                  <div className="text-xs text-muted">{s.examType} pass rate ({manebStats.year})</div>
                  <div className="font-heading font-bold text-lg text-brand-navy dark:text-white">{s.passRate}%</div>
                </div>
              ))}
            </div>
          )}
          <a
            href="https://www.maneb.edu.mw/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-brand-teal hover:underline font-semibold"
          >
            Visit the official MANEB portal <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </section>

        {/* Facilities */}
        <section id="facilities" className="scroll-mt-24">
          <h2 className="font-heading font-bold text-xl text-brand-navy dark:text-white mb-5">Facilities</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { icon: FlaskConical, title: 'Science Laboratories', desc: 'Laboratory space for Biology and Physical Science practical work, supporting the MANEB practical exam requirements.' },
              { icon: Library, title: 'Library', desc: 'A library stocked with set texts, past papers and reference material for independent study.' },
              { icon: Monitor, title: 'Computer Access', desc: 'Computer facilities supporting ICT lessons and administrative/exam-related digital work.' },
              { icon: BookOpen, title: 'Classrooms', desc: 'Dedicated classroom space for every form level, Form 1 through Form 4.' },
            ].map((f) => (
              <div key={f.title} className="border border-base rounded-2xl bg-surface p-6">
                <f.icon className="w-6 h-6 text-brand-teal mb-3" aria-hidden />
                <h3 className="font-heading font-bold text-body mb-1.5">{f.title}</h3>
                <p className="text-sm text-muted leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}