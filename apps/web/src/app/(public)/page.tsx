import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Welcome — SMS Malawi',
}

export default function LandingPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-brand-navy relative overflow-hidden">
      {/* Background decoration */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 50%, #0E8A6A 0%, transparent 50%), radial-gradient(circle at 80% 20%, #6B3FA0 0%, transparent 50%)',
        }}
      />

      <div className="relative z-10 text-center px-6 max-w-2xl">
        {/* School logo placeholder */}
        <div className="w-20 h-20 rounded-2xl bg-brand-teal mx-auto mb-8 flex items-center justify-center">
          <span className="text-white text-3xl font-heading font-bold">S</span>
        </div>

        <h1 className="font-heading text-4xl font-bold text-white mb-3 leading-tight">
          Your School Name
        </h1>
        <p className="text-white/60 text-lg mb-10">School Management System — Malawi</p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/login"
            className="bg-brand-teal text-white px-8 py-3 rounded-xl font-heading font-semibold hover:bg-brand-teal-light transition-colors text-center"
          >
            Sign In
          </Link>
          <Link
            href="/explore"
            className="bg-white/10 border border-white/20 text-white px-8 py-3 rounded-xl font-heading font-semibold hover:bg-white/20 transition-colors text-center"
          >
            Explore School
          </Link>
        </div>
      </div>
    </main>
  )
}
