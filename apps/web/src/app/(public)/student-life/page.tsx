'use client'

/**
 * apps/web/src/app/(public)/student-life/page.tsx
 * [CHANGE TYPE]: NEW FILE (production fix, 2026-07-28)
 * [PURPOSE]: Discover -> Student Life destination.
 */

import Link from 'next/link'
import { ArrowLeft, Users, HeartHandshake, Trophy, Home } from 'lucide-react'

export default function StudentLifePage() {
  return (
    <div className="min-h-screen bg-page">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <Link href="/#discover" className="inline-flex items-center gap-2 text-sm text-brand-teal hover:underline mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to home
        </Link>
        <h1 className="font-heading font-extrabold text-3xl sm:text-4xl tracking-tight text-brand-navy dark:text-white mb-3">
          Student Life
        </h1>
        <p className="text-muted leading-relaxed mb-12 max-w-2xl">
          School is more than the classroom. Alongside academic work, students take part in clubs, sport,
          wellness support and — for boarders — a structured residential life on campus.
        </p>

        <section className="mb-14">
          <div className="flex items-center gap-2.5 mb-5">
            <Users className="w-5 h-5 text-brand-purple" aria-hidden />
            <h2 className="font-heading font-bold text-xl text-brand-navy dark:text-white">Clubs, Societies &amp; Innovation</h2>
          </div>
          <p className="text-sm text-muted leading-relaxed mb-4">
            Students are encouraged to take part in clubs and societies that build skills and interests beyond
            the syllabus — debate and public speaking, drama, choir, science and innovation clubs, and
            student-led community initiatives. Participation is voluntary and organised around the school
            timetable so it doesn&apos;t compete with lesson time.
          </p>
        </section>

        <section className="mb-14">
          <div className="flex items-center gap-2.5 mb-5">
            <HeartHandshake className="w-5 h-5 text-brand-teal" aria-hidden />
            <h2 className="font-heading font-bold text-xl text-brand-navy dark:text-white">Wellness &amp; Support</h2>
          </div>
          <p className="text-sm text-muted leading-relaxed mb-4">
            Pastoral care is built into daily school life — form teachers and the school&apos;s leadership are the
            first point of contact for any student needing support, whether academic, social or personal.
            Boarding students in particular are looked after by house/dormitory staff responsible for their
            wellbeing outside of class hours.
          </p>
        </section>

        <section className="mb-14">
          <div className="flex items-center gap-2.5 mb-5">
            <Trophy className="w-5 h-5 text-brand-amber" aria-hidden />
            <h2 className="font-heading font-bold text-xl text-brand-navy dark:text-white">Sport &amp; Extracurricular Activities</h2>
          </div>
          <p className="text-sm text-muted leading-relaxed mb-4">
            Football, netball, athletics and other sporting activities run throughout the year, including
            inter-house and inter-school competition. Sport is part of a rounded secondary education —
            building teamwork and fitness alongside academic study.
          </p>
        </section>

        <section>
          <div className="flex items-center gap-2.5 mb-5">
            <Home className="w-5 h-5 text-brand-navy dark:text-white" aria-hidden />
            <h2 className="font-heading font-bold text-xl text-brand-navy dark:text-white">Boarding Life</h2>
          </div>
          <p className="text-sm text-muted leading-relaxed mb-4">
            For boarding students, the school provides a full residential experience — supervised dormitory
            accommodation, meals, prep/study time, and structured daily routines that support academic focus
            while building independence and community. Boarding places and requirements are covered on the{' '}
            <Link href="/admissions" className="text-brand-teal hover:underline font-semibold">Admissions</Link> page.
          </p>
        </section>
      </div>
    </div>
  )
}