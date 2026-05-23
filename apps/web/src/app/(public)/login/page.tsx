'use client'

/**
 * FILE: apps/web/src/app/(public)/login/page.tsx
 * REPLACES: existing login page
 *
 * Premium split-screen login page:
 * - Left panel: brand panel with animated decorative elements, school logo,
 *   home icon back-link, SVG illustration placeholder, copyright line
 * - Right panel: clean minimalist form with improved spacing
 *
 * TO ADD LOGO: replace the "S" div below with <Image src="/images/logo.png" ... />
 * TO ADD ILLUSTRATION: replace the placeholder div with <Image src="/images/login-illustration.svg" ... />
 */

import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import {
  Eye,
  EyeOff,
  ArrowLeft,
  Loader2,
  GraduationCap,
  Users,
  BookOpen,
  Award,
  Home,
} from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      await signInWithEmailAndPassword(auth, email, password)
      document.cookie = `sms_session=1; path=/; max-age=18000; SameSite=Strict`
      router.push('/dashboard')
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? ''
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        setError('Incorrect email or password. Please try again.')
      } else if (code === 'auth/too-many-requests') {
        setError('Too many attempts. Please wait a few minutes.')
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <style>{`
        @keyframes driftA {
          0%,100% { transform: translate(0,0) rotate(0deg); opacity:0.4; }
          50%      { transform: translate(12px,-16px) rotate(4deg); opacity:0.7; }
        }
        @keyframes driftB {
          0%,100% { transform: translate(0,0) rotate(0deg); opacity:0.25; }
          50%      { transform: translate(-10px,12px) rotate(-3deg); opacity:0.5; }
        }
        @keyframes driftC {
          0%,100% { transform: translate(0,0) scale(1); opacity:0.3; }
          50%      { transform: translate(8px,-8px) scale(1.05); opacity:0.6; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes spinBack {
          from { transform: rotate(0deg); }
          to   { transform: rotate(-360deg); }
        }
        @keyframes pulseGlow {
          0%,100% { opacity:0.15; }
          50%      { opacity:0.35; }
        }
        @keyframes fadeSlideUp {
          from { opacity:0; transform:translateY(12px); }
          to   { opacity:1; transform:translateY(0); }
        }
        .login-glow-blob {
          background: radial-gradient(circle, rgba(14,138,106,0.25) 0%, transparent 65%);
          animation: pulseGlow 4s ease-in-out infinite;
        }
        .login-ring-cw  { animation: spin 30s linear infinite; }
        .login-ring-ccw { animation: spinBack 20s linear infinite; }
        .login-drift-a  { animation: driftA 4s ease-in-out infinite; }
        .login-drift-b  { animation: driftB 5s ease-in-out infinite; }
        .login-drift-c  { animation: driftC 3.5s ease-in-out infinite; }
        .login-diamond  { transform: rotate(45deg); }
      `}</style>

      <div className="min-h-screen grid lg:grid-cols-[1fr_1fr] font-sans">
        {/* ── LEFT PANEL — Brand ─────────────────────────────────────────── */}
        <div className="hidden lg:flex flex-col relative overflow-hidden bg-brand-navy">
          {/* Animated background shapes */}
          <div className="absolute inset-0 pointer-events-none">
            {/* Glow blob */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full login-glow-blob" />

            {/* Outer dashed ring */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] h-[420px] rounded-full border-2 border-dashed border-white/10 login-ring-cw" />

            {/* Inner ring */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full border border-brand-teal/20 login-ring-ccw" />

            {/* Floating decorative cards */}
            <div className="absolute top-1/4 left-10 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 backdrop-blur-sm login-drift-a">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-brand-teal/30 flex items-center justify-center">
                  <GraduationCap className="w-3.5 h-3.5 text-brand-teal-light" />
                </div>
                <div>
                  <div className="text-white text-[10px] font-heading font-bold">
                    1,247 Students
                  </div>
                  <div className="text-white/40 text-[9px] font-sans">Enrolled 2025/2026</div>
                </div>
              </div>
            </div>

            <div className="absolute bottom-1/3 right-8 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 backdrop-blur-sm login-drift-b">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-brand-amber/30 flex items-center justify-center">
                  <Award className="w-3.5 h-3.5 text-brand-amber" />
                </div>
                <div>
                  <div className="text-white text-[10px] font-heading font-bold">89% Pass Rate</div>
                  <div className="text-white/40 text-[9px] font-sans">MSCE 2025</div>
                </div>
              </div>
            </div>

            <div className="absolute top-2/3 left-16 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 backdrop-blur-sm login-drift-c">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-brand-purple/30 flex items-center justify-center">
                  <BookOpen className="w-3.5 h-3.5 text-brand-purple" />
                </div>
                <div>
                  <div className="text-white text-[10px] font-heading font-bold">
                    Digital Library
                  </div>
                  <div className="text-white/40 text-[9px] font-sans">1,200+ Resources</div>
                </div>
              </div>
            </div>

            {/* Geometric doodles */}
            <div className="absolute top-12 right-12 w-8 h-8 border-2 border-white/10 rounded-lg rotate-12" />
            <div className="absolute bottom-20 left-8 w-5 h-5 border border-brand-teal/30 rounded-full" />
            <div className="absolute top-1/3 right-20 w-3 h-3 bg-brand-teal/40 rounded-full" />
            <div className="absolute bottom-1/4 right-16 w-6 h-6 border border-white/10 rounded login-diamond" />
          </div>

          {/* Panel content */}
          <div className="relative z-10 flex flex-col h-full p-10">
            {/* Top — Home button */}
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-white/50 hover:text-white transition-colors text-sm w-fit"
            >
              <Home className="w-4 h-4" />
              <span className="font-heading font-medium">Back to homepage</span>
            </Link>

            {/* Middle — Logo + illustration */}
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              {/* Logo */}
              <div className="w-20 h-20 rounded-3xl bg-white/10 border border-white/15 flex items-center justify-center mb-6 shadow-xl overflow-hidden">
                <Image
                  src="/images/logo.png"
                  alt="School logo"
                  width={200}
                  height={200}
                  loading="eager"
                  className="object-contain w-auto h-auto"
                />
              </div>

              <h2 className="font-heading font-bold text-3xl text-white mb-2">SMS Malawi</h2>
              <p className="text-white/40 text-sm font-sans max-w-xs leading-relaxed mb-10">
                School Management System — empowering educators and students across Malawi.
              </p>

              {/* Illustration */}
              <Image
                src="/images/login.svg"
                alt="Login illustration"
                width={224}
                height={176}
                loading="eager"
                className="object-contain w-72 h-56"
              />
            </div>

            {/* Bottom — copyright */}
            <p className="text-white/25 text-xs font-sans text-center">
              © {new Date().getFullYear()} SMS Malawi. All rights reserved.
            </p>
          </div>
        </div>

        {/* ── RIGHT PANEL — Form ─────────────────────────────────────────── */}
        <div className="flex flex-col justify-center px-6 sm:px-12 lg:px-16 py-12 bg-page min-h-screen lg:min-h-0">
          {/* Mobile back link */}
          <Link
            href="/"
            className="flex items-center gap-1.5 text-muted text-sm mb-12 lg:hidden hover:text-body transition-colors w-fit"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Home
          </Link>

          <div className="w-full max-w-sm mx-auto login-form-anim">
            {/* Header */}
            <div className="mb-8">
              <h1 className="font-heading text-3xl font-bold text-brand-navy mb-2 tracking-tight">
                Welcome back
              </h1>
              <p className="text-muted text-sm">Sign in to your school account</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5 login-form-anim-delay">
              {/* Email */}
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-heading font-medium text-body mb-1.5"
                >
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@school.edu.mw"
                  className="w-full border border-base rounded-xl px-4 py-3 text-sm bg-surface text-body placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal transition-all"
                />
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="password" className="text-sm font-heading font-medium text-body">
                    Password
                  </label>
                  <Link
                    href="/forgot-password"
                    className="text-xs text-brand-teal hover:text-brand-teal-light transition-colors font-heading"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    type={showPass ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full border border-base rounded-xl px-4 py-3 pr-11 text-sm bg-surface text-body placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-body transition-colors"
                    aria-label={showPass ? 'Hide password' : 'Show password'}
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Error message */}
              {error && (
                <div className="text-sm text-brand-coral bg-brand-coral/8 border border-brand-coral/20 rounded-xl px-4 py-3 flex items-start gap-2">
                  <span className="mt-0.5 shrink-0">⚠</span>
                  <span>{error}</span>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-brand-navy text-white py-3 rounded-xl font-heading font-semibold text-sm hover:bg-brand-navy-mid transition-colors flex items-center justify-center gap-2 disabled:opacity-60 mt-2 shadow-sm"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>

            {/* Divider with roles note */}
            <div className="mt-8 pt-8 border-t border-base">
              <p className="text-xs text-muted text-center font-sans">
                This portal is for authorised students and staff only.
                <br />
                Contact your school administrator if you need access.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
