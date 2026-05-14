'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { Eye, EyeOff, ArrowLeft, Loader2 } from 'lucide-react'

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
      // Set session cookie so middleware allows access
      document.cookie = `sms_session=1; path=/; max-age=18000; SameSite=Strict`
      router.push('/dashboard')
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? ''
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        setError('Incorrect email or password. Please try again.')
      } else if (code === 'auth/too-many-requests') {
        setError('Too many attempts. Please wait a few minutes and try again.')
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left — school branding panel */}
      <div className="hidden lg:flex flex-col justify-between bg-brand-navy p-12">
        <Link
          href="/"
          className="flex items-center gap-2 text-white/60 hover:text-white text-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to home
        </Link>
        <div>
          <div className="w-14 h-14 rounded-2xl bg-brand-teal flex items-center justify-center mb-6">
            <span className="text-white text-2xl font-heading font-bold">S</span>
          </div>
          <h2 className="font-heading text-3xl font-bold text-white mb-3">Your School Name</h2>
          <p className="text-white/50 text-base leading-relaxed">
            Empowering education through technology. Manage students, staff, finances, and academic
            records all in one place.
          </p>
        </div>
        <p className="text-white/30 text-xs">
          © {new Date().getFullYear()} SMS Malawi. All rights reserved.
        </p>
      </div>

      {/* Right — login form */}
      <div className="flex flex-col justify-center px-8 py-12 sm:px-16 bg-page">
        {/* Mobile back link */}
        <Link
          href="/"
          className="flex items-center gap-1.5 text-muted text-sm mb-10 lg:hidden hover:text-body"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Home
        </Link>

        <div className="max-w-sm w-full mx-auto">
          <h1 className="font-heading text-2xl font-bold text-brand-navy mb-1">Welcome back</h1>
          <p className="text-muted text-sm mb-8">Sign in with your school account</p>

          <form onSubmit={handleLogin} className="space-y-4">
            {/* Email */}
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium font-heading text-body">
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
                className="w-full border border-base rounded-lg px-3.5 py-2.5 text-sm bg-surface text-body placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-teal/40 focus:border-brand-teal transition-colors"
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium font-heading text-body">
                  Password
                </label>
                <Link href="/forgot-password" className="text-xs text-brand-teal hover:underline">
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
                  className="w-full border border-base rounded-lg px-3.5 py-2.5 pr-10 text-sm bg-surface text-body placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-teal/40 focus:border-brand-teal transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-body"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <p className="text-sm text-brand-coral bg-brand-coral/10 border border-brand-coral/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-navy text-white py-2.5 rounded-lg font-heading font-semibold text-sm hover:bg-brand-navy-mid transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
