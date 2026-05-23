'use client'

/**
 * FILE: apps/web/src/app/(public)/page.tsx
 * REPLACES: existing minimal landing page
 *
 * This is the complete single-page website (§3.1 + §3.2 combined).
 * All sections scroll on one page. Login opens as a separate /login page.
 *
 * SECTIONS:
 *   1. Sticky nav header
 *   2. Hero (full-viewport)
 *   3. About Us
 *   4. Stats / MANEB Performance
 *   5. Newsletter / Announcements
 *   6. Services & Facilities
 *   7. Gallery
 *   8. Admissions CTA
 *   9. Contact
 *  10. Footer
 *
 * Dark/Light/System mode toggle is included in the nav.
 * Login button routes to /login (separate page per spec).
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { FaFacebook, FaTwitter, FaInstagram, FaYoutube, FaLinkedin } from 'react-icons/fa'
import {
  Sun,
  Moon,
  Monitor,
  Search,
  ArrowRight,
  BookOpen,
  Users,
  Trophy,
  GraduationCap,
  Star,
  Heart,
  Lightbulb,
  Shield,
  Mail,
  Phone,
  MapPin,
  Clock,
  ChevronRight,
  Menu,
  X,
  TrendingUp,
  Award,
  Globe,
  Microscope,
  Music,
  Dumbbell,
  Cpu,
  FlaskConical,
  Send,
  ExternalLink,
  Target,
  Zap,
} from 'lucide-react'

// ── THEME HOOK ──────────────────────────────────────────────────────────────
type Theme = 'light' | 'dark' | 'system'

function useTheme() {

  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem('sms-theme') as Theme | null) ?? 'system'
  )
  const [mounted, setMounted] = useState(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional mount flag
  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    const root = document.documentElement
    const apply = (t: Theme) => {
      if (t === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        root.classList.toggle('dark', prefersDark)
      } else {
        root.classList.toggle('dark', t === 'dark')
      }
    }
    apply(theme)
    localStorage.setItem('sms-theme', theme)

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      if (theme === 'system') apply('system')
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  return { theme, setTheme, mounted }
}

// ── FLOATING CARD ────────────────────────────────────────────────────────────
function FloatCard({
  children,
  className = '',
  delay = 0,
}: {
  children: React.ReactNode
  className?: string
  delay?: number
}) {
  // Animation class is defined in the <style> block above; delay applied via CSS custom property
  const delayStyle =
    delay > 0 ? ({ '--float-delay': `${delay}s` } as React.CSSProperties) : undefined
  return (
    <div
      className={`absolute bg-surface/95 backdrop-blur-sm border border-white/20 rounded-2xl shadow-lg p-4 float-card ${className}`}
      style={delayStyle}
    >
      {children}
    </div>
  )
}

// ── STAT COUNTER ─────────────────────────────────────────────────────────────
function StatCounter({
  value,
  suffix = '',
  label,
}: {
  value: number
  suffix?: string
  label: string
}) {
  const [count, setCount] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const started = useRef(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !started.current) {
          started.current = true
          let start = 0
          const step = Math.ceil(value / 60)
          const timer = setInterval(() => {
            start += step
            if (start >= value) {
              setCount(value)
              clearInterval(timer)
            } else {
              setCount(start)
            }
          }, 16)
        }
      },
      { threshold: 0.5 }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [value])

  return (
    <div ref={ref} className="text-center">
      <div className="text-4xl md:text-5xl font-heading font-bold text-brand-navy tabular">
        {count.toLocaleString()}
        {suffix}
      </div>
      <div className="text-sm text-muted mt-1 font-sans">{label}</div>
    </div>
  )
}

// ── ANNOUNCEMENT CARD ─────────────────────────────────────────────────────────
const announcements = [
  {
    date: 'May 12, 2026',
    category: 'MANEB',
    title: 'MSCE 2025 Results Released — Record Pass Rate',
    excerpt:
      'We are proud to announce that our Form 4 cohort achieved an 89% pass rate in the 2025 MSCE examinations, surpassing the national average by 14 percentage points.',
  },
  {
    date: 'Apr 28, 2026',
    category: 'Academic',
    title: 'Term 3 Examination Timetable Now Available',
    excerpt:
      'The end-of-term examinations for all forms will commence on 5th June 2026. Students are advised to collect their examination cards from the school office.',
  },
  {
    date: 'Apr 15, 2026',
    category: 'Admissions',
    title: 'Form 1 Admissions Open for 2027 Academic Year',
    excerpt:
      'Applications for the 2027 intake are now open. We welcome academically motivated students from across Malawi. Apply online through the portal today.',
  },
  {
    date: 'Mar 30, 2026',
    category: 'Events',
    title: 'Annual Inter-School Science Olympiad — 2nd Place',
    excerpt:
      'Our science team secured second position in the Southern Region Science Olympiad, with outstanding performances in Biology, Chemistry and Physics categories.',
  },
  {
    date: 'Mar 10, 2026',
    category: 'Initiative',
    title: 'Digital Library Expansion: 500+ New E-Books Added',
    excerpt:
      'The school digital library now hosts over 1,200 academic resources including past MANEB papers, textbooks, and reference materials accessible to all enrolled students.',
  },
  {
    date: 'Feb 20, 2026',
    category: 'Extracurricular',
    title: 'Football Team Qualifies for National Tournament',
    excerpt:
      'Congratulations to our football squad for qualifying for the National Secondary Schools Football Championship to be held in Lilongwe in August 2026.',
  },
]

const categoryColors: Record<string, string> = {
  MANEB: 'bg-brand-teal/15 text-brand-teal border-brand-teal/30',
  Academic: 'bg-brand-navy/10 text-brand-navy border-brand-navy/20',
  Admissions: 'bg-brand-purple/15 text-brand-purple border-brand-purple/30',
  Events: 'bg-brand-amber/15 text-brand-amber border-brand-amber/30',
  Initiative: 'bg-brand-teal/15 text-brand-teal border-brand-teal/30',
  Extracurricular: 'bg-brand-coral/15 text-brand-coral border-brand-coral/30',
}

// ── SERVICES ─────────────────────────────────────────────────────────────────
const services = [
  {
    icon: BookOpen,
    label: 'Academic Excellence',
    desc: 'Rigorous curriculum aligned to MANEB standards for JCE and MSCE examinations.',
  },
  {
    icon: FlaskConical,
    label: 'Science Laboratories',
    desc: 'Fully equipped Biology, Chemistry and Physics labs with modern apparatus.',
  },
  {
    icon: Cpu,
    label: 'Computer Studies',
    desc: 'Modern ICT lab with high-speed internet access and industry-standard software.',
  },
  {
    icon: Microscope,
    label: 'Research Library',
    desc: 'Physical and digital library with over 1,200 academic resources and past papers.',
  },
  {
    icon: Music,
    label: 'Arts & Culture',
    desc: 'Drama, choir, traditional dance and visual arts programmes for holistic growth.',
  },
  {
    icon: Dumbbell,
    label: 'Sports & Athletics',
    desc: 'Football, netball, athletics, basketball and volleyball with certified coaches.',
  },
  {
    icon: Globe,
    label: 'Community Service',
    desc: 'Structured community outreach programmes building civic responsibility.',
  },
  {
    icon: Users,
    label: 'Boarding Facilities',
    desc: 'Safe, comfortable dormitories with 24-hour supervision and nutritious meals.',
  },
]

// ─────────────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const { theme, setTheme, mounted } = useTheme()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSection, setActiveSection] = useState('')

  // Intersection observer for active nav highlight
  useEffect(() => {
    const sections = ['hero', 'about', 'stats', 'news', 'services', 'gallery', 'contact']
    const observers = sections.map((id) => {
      const el = document.getElementById(id)
      if (!el) return null
      const obs = new IntersectionObserver(
        ([e]) => {
          if (e?.isIntersecting) setActiveSection(id)
        },
        { threshold: 0.4 }
      )
      obs.observe(el)
      return obs
    })
    return () => observers.forEach((o) => o?.disconnect())
  }, [])

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    setMobileMenuOpen(false)
  }

  const themeIcons = {
    light: <Sun className="w-4 h-4" />,
    dark: <Moon className="w-4 h-4" />,
    system: <Monitor className="w-4 h-4" />,
  }

  const cycleTheme = () => {
    const order: Theme[] = ['light', 'dark', 'system']
    const next: Theme = order[(order.indexOf(theme) + 1) % order.length] ?? 'system'
    setTheme(next)
  }

  return (
    <>
      {/* ── KEYFRAME STYLES ────────────────────────────────────────────────── */}
      <style>{`
        @keyframes floatY {
          0%,100% { transform: translateY(0px) rotate(0deg); }
          33%      { transform: translateY(-8px) rotate(0.5deg); }
          66%      { transform: translateY(-4px) rotate(-0.3deg); }
        }
        .float-card {
          animation: floatY 3.5s ease-in-out infinite;
          animation-delay: var(--float-delay, 0s);
        }
        .hero-bg-mesh {
          background: radial-gradient(ellipse 70% 60% at 15% 40%, rgba(14,138,106,.13) 0%, transparent 70%),
                      radial-gradient(ellipse 60% 50% at 85% 20%, rgba(107,63,160,.2) 0%, transparent 70%);
        }
        .hero-bg-grid {
          background-image: linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px);
          background-size: 48px 48px;
        }
        .ring-spin-cw  { animation: spin 20s linear infinite; }
        .ring-spin-ccw { animation: dashedSpin 25s linear infinite; }
        .stats-bg-mesh {
          background: radial-gradient(ellipse 80% 60% at 50% 50%, rgba(14,138,106,.08) 0%, transparent 70%);
        }
        .cta-bg-glow {
          background-image: radial-gradient(circle at 70% 30%, #fff 0%, transparent 50%);
        }
        @keyframes fadeUp {
          from { opacity:0; transform:translateY(24px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity:0; } to { opacity:1; }
        }
        @keyframes rotateSlow {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes dashedSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(-360deg); }
        }
        .hero-heading { animation: fadeUp 0.7s ease both; }
        .hero-sub     { animation: fadeUp 0.7s 0.15s ease both; }
        .hero-ctas    { animation: fadeUp 0.7s 0.3s ease both; }
        .hero-stats   { animation: fadeUp 0.7s 0.45s ease both; }
        .hero-visual  { animation: fadeIn 0.9s 0.2s ease both; }
        .section-fade { opacity:0; transform:translateY(20px); transition: opacity 0.6s ease, transform 0.6s ease; }
        .section-fade.visible { opacity:1; transform:translateY(0); }
        .nav-link { position:relative; }
        .nav-link::after { content:''; position:absolute; bottom:-2px; left:0; width:0; height:2px; background:#0E8A6A; border-radius:1px; transition:width 0.25s ease; }
        .nav-link.active::after, .nav-link:hover::after { width:100%; }
        .card-hover { transition: transform 0.25s ease, box-shadow 0.25s ease; }
        .card-hover:hover { transform: translateY(-3px); box-shadow: 0 16px 40px rgba(0,0,0,0.12); }
        .gradient-ring { background: conic-gradient(from 0deg, #0E8A6A, #0F2744, #6B3FA0, #0E8A6A); }
      `}</style>

      <div className="bg-page text-body font-sans">
        {/* ══════════════════════════════════════════════════════════════════
            §1  STICKY NAVIGATION
        ══════════════════════════════════════════════════════════════════ */}
        <header className="sticky top-0 z-50 bg-surface/90 backdrop-blur-md border-b border-base">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-4 h-16">
              {/* Logo */}
              <button
                onClick={() => scrollTo('hero')}
                className="flex items-center gap-2.5 shrink-0"
              >
                <div className="w-9 h-9 rounded-xl bg-brand-navy flex items-center justify-center shadow-sm">
                  <span className="text-white text-sm font-heading font-bold">S</span>
                </div>
                <span className="font-heading font-bold text-brand-navy text-sm hidden sm:block">
                  SMS Malawi
                </span>
              </button>

              {/* Search bar */}
              <div className="flex-1 max-w-xs lg:max-w-sm mx-auto">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-1.5 text-sm bg-page border border-base rounded-full focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal placeholder:text-muted text-body transition-colors"
                  />
                </div>
              </div>

              {/* Desktop nav links */}
              <nav className="hidden lg:flex items-center gap-6 text-sm font-heading font-medium">
                {['about', 'stats', 'news', 'services', 'gallery', 'contact'].map((s) => (
                  <button
                    key={s}
                    onClick={() => scrollTo(s)}
                    className={`nav-link text-muted hover:text-body transition-colors capitalize ${activeSection === s ? 'active text-body' : ''}`}
                  >
                    {s === 'stats'
                      ? 'Performance'
                      : s === 'news'
                        ? 'News'
                        : s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </nav>

              <div className="flex items-center gap-2 ml-auto">
                {/* Theme toggle */}
                {/* suppressHydrationWarning on title + content so the
                    neutral first render (no icon) doesn't trigger a warning
                    on the one frame before `mounted` flips to true. */}
                <button
                  onClick={cycleTheme}
                  className="p-2 rounded-lg text-muted hover:text-body hover:bg-page transition-colors"
                  title={mounted ? `Theme: ${theme}` : 'Theme'}
                  suppressHydrationWarning
                >
                  {mounted ? themeIcons[theme] : <Monitor className="w-4 h-4" />}
                </button>

                {/* Login CTA */}
                <Link
                  href="/login"
                  className="hidden sm:flex items-center gap-1.5 bg-brand-navy text-white px-4 py-2 rounded-full text-sm font-heading font-semibold hover:bg-brand-navy-mid transition-colors"
                >
                  Login <ArrowRight className="w-3.5 h-3.5" />
                </Link>

                {/* Mobile menu toggle */}
                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="lg:hidden p-2 rounded-lg text-muted hover:bg-page transition-colors"
                >
                  {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>

          {/* Mobile menu */}
          {mobileMenuOpen && (
            <div className="lg:hidden bg-surface border-t border-base px-6 py-4 space-y-1">
              {['about', 'stats', 'news', 'services', 'gallery', 'contact'].map((s) => (
                <button
                  key={s}
                  onClick={() => scrollTo(s)}
                  className="block w-full text-left py-2.5 text-sm font-heading font-medium text-muted hover:text-body capitalize"
                >
                  {s === 'stats'
                    ? 'Performance'
                    : s === 'news'
                      ? 'News'
                      : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
              <Link
                href="/login"
                className="block mt-3 bg-brand-navy text-white text-center py-2.5 rounded-xl font-heading font-semibold text-sm"
              >
                Login to Portal →
              </Link>
            </div>
          )}
        </header>

        {/* ══════════════════════════════════════════════════════════════════
            §2  HERO
        ══════════════════════════════════════════════════════════════════ */}
        <section
          id="hero"
          className="relative min-h-screen flex items-center overflow-hidden bg-brand-navy"
        >
          {/* Background mesh */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 left-0 w-full h-full opacity-30 hero-bg-mesh" />
            {/* Subtle grid */}
            <div className="absolute inset-0 opacity-[0.04] hero-bg-grid" />
          </div>

          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-16 grid lg:grid-cols-2 gap-16 items-center w-full">
            {/* Left — copy */}
            <div>
              <div className="hero-heading inline-flex items-center gap-2 bg-brand-teal/20 border border-brand-teal/30 text-brand-teal-light text-xs font-heading font-semibold uppercase tracking-widest px-4 py-1.5 rounded-full mb-8">
                <Star className="w-3 h-3" /> Malawi&apos;s Premier Secondary School
              </div>

              <h1 className="hero-heading font-heading font-bold text-white leading-[1.08] tracking-tight mb-6">
                <span className="block text-5xl md:text-6xl lg:text-7xl">Where Minds</span>
                <span className="block text-5xl md:text-6xl lg:text-7xl text-brand-teal-light">
                  Ignite &amp;
                </span>
                <span className="block text-5xl md:text-6xl lg:text-7xl">Futures Begin.</span>
              </h1>

              <p className="hero-sub text-white/60 text-lg leading-relaxed max-w-lg mb-10 font-sans">
                A centre of academic excellence nurturing Malawi&apos;s next generation through
                rigorous education, character development and holistic growth — from Form 1 through
                MSCE.
              </p>

              <div className="hero-ctas flex flex-wrap gap-3 mb-12">
                <Link
                  href="/login"
                  className="flex items-center gap-2 bg-brand-teal text-white px-6 py-3 rounded-xl font-heading font-semibold text-sm hover:bg-brand-teal-light transition-colors shadow-lg"
                >
                  <GraduationCap className="w-4 h-4" /> Student &amp; Staff Portal
                </Link>
                <Link
                  href="/apply"
                  className="flex items-center gap-2 bg-white/10 border border-white/20 text-white px-6 py-3 rounded-xl font-heading font-semibold text-sm hover:bg-white/20 transition-colors"
                >
                  Apply for Admission
                </Link>
                <button
                  onClick={() => scrollTo('about')}
                  className="flex items-center gap-2 text-white/60 hover:text-white text-sm font-heading font-medium transition-colors"
                >
                  Explore more <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Quick stats */}
              <div className="hero-stats grid grid-cols-3 gap-6 pt-8 border-t border-white/10">
                {[
                  { num: '1,200+', label: 'Students enrolled' },
                  { num: '89%', label: 'MSCE pass rate 2025' },
                  { num: '45+', label: 'Years of excellence' },
                ].map((s) => (
                  <div key={s.label}>
                    <div className="text-2xl md:text-3xl font-heading font-bold text-white">
                      {s.num}
                    </div>
                    <div className="text-xs text-white/40 mt-0.5 font-sans">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right — visual */}
            <div className="hero-visual relative hidden lg:flex items-center justify-center h-[540px]">
              {/* Outer dashed rotating ring */}
              <div className="absolute w-[440px] h-[440px] rounded-full border-2 border-dashed border-white/10 ring-spin-ccw" />

              {/* Inner solid ring */}
              <div className="absolute w-[340px] h-[340px] rounded-full border border-brand-teal/20" />

              {/* Central illustration placeholder */}
              <div className="w-72 h-72 rounded-3xl bg-gradient-to-br from-brand-navy-mid to-brand-navy-light border border-white/10 flex flex-col items-center justify-center gap-3 shadow-2xl">
                <div className="w-16 h-16 rounded-2xl bg-brand-teal/20 border border-brand-teal/30 flex items-center justify-center">
                  {/* SVG PLACEHOLDER — replace with: <Image src="/images/hero-illustration.svg" ... /> */}
                  <BookOpen className="w-8 h-8 text-brand-teal" />
                </div>
                <p className="text-white/30 text-xs font-sans text-center px-8">
                  Place your hero SVG illustration here
                  <br />
                  <code className="text-white/20 text-[10px]">
                    /public/images/hero-illustration.svg
                  </code>
                </p>
              </div>

              {/* Floating cards */}
              <FloatCard className="top-4 left-0 min-w-[160px]" delay={0}>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-brand-teal/15 flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-brand-teal" />
                  </div>
                  <div>
                    <div className="text-xs font-heading font-bold text-body">89%</div>
                    <div className="text-[10px] text-muted font-sans">MANEB pass rate</div>
                  </div>
                </div>
              </FloatCard>

              <FloatCard className="bottom-12 left-0 min-w-[148px]" delay={1.2}>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-brand-amber/15 flex items-center justify-center">
                    <Heart className="w-4 h-4 text-brand-amber" />
                  </div>
                  <div>
                    <div className="text-xs font-heading font-semibold text-body">Join Us</div>
                    <div className="text-[10px] text-muted font-sans">Apply for 2027</div>
                  </div>
                </div>
              </FloatCard>

              <FloatCard className="top-8 right-0 min-w-[168px]" delay={0.7}>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-brand-purple/15 flex items-center justify-center">
                    <Award className="w-4 h-4 text-brand-purple" />
                  </div>
                  <div>
                    <div className="text-xs font-heading font-bold text-body">72 University</div>
                    <div className="text-[10px] text-muted font-sans">placements 2025</div>
                  </div>
                </div>
              </FloatCard>

              <FloatCard className="bottom-8 right-2 min-w-[148px]" delay={1.8}>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-brand-coral/15 flex items-center justify-center">
                    <Star className="w-4 h-4 text-brand-coral" />
                  </div>
                  <div>
                    <div className="text-xs font-heading font-bold text-body">#1 Ranked</div>
                    <div className="text-[10px] text-muted font-sans">Southern Region</div>
                  </div>
                </div>
              </FloatCard>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════════
            §3  ABOUT US
        ══════════════════════════════════════════════════════════════════ */}
        <section id="about" className="py-24 bg-page">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <span className="text-brand-teal text-sm font-heading font-semibold uppercase tracking-widest">
                About Us
              </span>
              <h2 className="font-heading font-bold text-3xl md:text-4xl text-brand-navy mt-2">
                Building Leaders Since 1979
              </h2>
            </div>

            <div className="grid lg:grid-cols-2 gap-16 items-center mb-16">
              {/* Photo placeholder */}
              <div className="relative">
                <div className="aspect-[4/3] rounded-3xl bg-gradient-to-br from-brand-navy-light/20 to-brand-teal/10 border border-base flex items-center justify-center overflow-hidden">
                  <div className="text-center space-y-2">
                    <div className="w-16 h-16 rounded-2xl bg-brand-navy/10 border border-base flex items-center justify-center mx-auto">
                      <Users className="w-8 h-8 text-brand-navy/40" />
                    </div>
                    <p className="text-muted text-xs font-sans">
                      School photo here
                      <br />
                      <code className="text-[10px]">/public/images/school-photo.jpg</code>
                    </p>
                  </div>
                </div>
                {/* Decorative accent */}
                <div className="absolute -bottom-4 -right-4 w-32 h-32 rounded-2xl bg-brand-teal/10 border border-brand-teal/20 -z-10" />
                <div className="absolute -top-4 -left-4 w-20 h-20 rounded-xl bg-brand-navy/5 border border-brand-navy/10 -z-10" />
              </div>

              {/* Text content */}
              <div>
                <h3 className="font-heading font-bold text-2xl text-brand-navy mb-4">
                  A Legacy of Academic Excellence
                </h3>
                <p className="text-muted leading-relaxed mb-4 font-sans">
                  Established in 1979, our school has grown from a small community institution into
                  one of Malawi&apos;s most respected secondary schools. Over four decades, we have
                  nurtured thousands of graduates who now serve across government, business,
                  medicine, law and the arts.
                </p>
                <p className="text-muted leading-relaxed mb-8 font-sans">
                  Our philosophy is simple: every student possesses unique potential. Our role is to
                  create an environment where that potential is discovered, developed and directed
                  toward meaningful contribution to Malawi and the world beyond.
                </p>

                {/* Values 2×2 grid */}
                <div className="grid grid-cols-2 gap-4">
                  {[
                    {
                      icon: Trophy,
                      label: 'Academic Excellence',
                      color: 'text-brand-teal',
                      bg: 'bg-brand-teal/10',
                    },
                    {
                      icon: Heart,
                      label: 'Community',
                      color: 'text-brand-coral',
                      bg: 'bg-brand-coral/10',
                    },
                    {
                      icon: Lightbulb,
                      label: 'Growth Mindset',
                      color: 'text-brand-amber',
                      bg: 'bg-brand-amber/10',
                    },
                    {
                      icon: Shield,
                      label: 'Integrity',
                      color: 'text-brand-purple',
                      bg: 'bg-brand-purple/10',
                    },
                  ].map(({ icon: Icon, label, color, bg }) => (
                    <div
                      key={label}
                      className="flex items-center gap-3 bg-surface border border-base rounded-2xl p-4 card-hover"
                    >
                      <div
                        className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}
                      >
                        <Icon className={`w-5 h-5 ${color}`} />
                      </div>
                      <span className="font-heading font-semibold text-sm text-body">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Mission & Vision */}
            <div className="grid md:grid-cols-2 gap-6">
              {[
                {
                  icon: Target,
                  label: 'Our Mission',
                  color: 'text-brand-teal',
                  bg: 'bg-brand-teal/10',
                  border: 'border-brand-teal/20',
                  text: 'To provide a transformative secondary education that equips students with knowledge, critical thinking skills and moral character — empowering them to excel in MANEB examinations and contribute meaningfully to Malawian society.',
                },
                {
                  icon: Zap,
                  label: 'Our Vision',
                  color: 'text-brand-purple',
                  bg: 'bg-brand-purple/10',
                  border: 'border-brand-purple/20',
                  text: "To be Malawi's leading secondary school — a beacon of academic achievement, innovation and values-driven leadership that produces graduates who shape a prosperous and equitable future for the nation.",
                },
              ].map(({ icon: Icon, label, color, bg, border, text }) => (
                <div
                  key={label}
                  className={`bg-surface border ${border} rounded-3xl p-8 card-hover`}
                >
                  <div
                    className={`w-12 h-12 rounded-2xl ${bg} flex items-center justify-center mb-5`}
                  >
                    <Icon className={`w-6 h-6 ${color}`} />
                  </div>
                  <h4 className={`font-heading font-bold text-lg ${color} mb-3`}>{label}</h4>
                  <p className="text-muted text-sm leading-relaxed font-sans">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════════
            §4  STATS / MANEB PERFORMANCE
        ══════════════════════════════════════════════════════════════════ */}
        <section id="stats" className="py-24 bg-brand-navy relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none opacity-20 stats-bg-mesh" />

          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <span className="text-brand-teal-light text-sm font-heading font-semibold uppercase tracking-widest">
                Academic Performance
              </span>
              <h2 className="font-heading font-bold text-3xl md:text-4xl text-white mt-2">
                Results That Speak for Themselves
              </h2>
              <p className="text-white/50 mt-3 max-w-2xl mx-auto font-sans">
                Consistently outperforming national MANEB averages across JCE and MSCE examinations.
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-16">
              {[
                { value: 89, suffix: '%', label: 'MSCE 2025 pass rate' },
                { value: 1247, suffix: '+', label: 'Students enrolled' },
                { value: 72, suffix: '', label: 'University placements 2025' },
                { value: 14, suffix: '%', label: 'Above national average' },
              ].map((s) => (
                <StatCounter key={s.label} {...s} />
              ))}
            </div>

            {/* MANEB comparison cards */}
            <div className="grid md:grid-cols-3 gap-6">
              {[
                { subject: 'Mathematics', school: 87, national: 61, color: 'bg-brand-teal' },
                { subject: 'English', school: 91, national: 74, color: 'bg-brand-purple' },
                { subject: 'Biology', school: 85, national: 58, color: 'bg-brand-amber' },
              ].map(({ subject, school, national, color }) => (
                <div key={subject} className="bg-white/5 border border-white/10 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-heading font-semibold text-white text-sm">{subject}</h4>
                    <span className="text-brand-teal-light text-xs font-heading font-bold">
                      MSCE 2025
                    </span>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-white/50 font-sans">Our school</span>
                        <span className="text-white font-heading font-bold">{school}%</span>
                      </div>
                      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${color} rounded-full`}
                          style={{ width: `${school}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-white/50 font-sans">National average</span>
                        <span className="text-white/60 font-heading font-semibold">
                          {national}%
                        </span>
                      </div>
                      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-white/20 rounded-full"
                          style={{ width: `${national}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="text-center mt-8">
              <a
                href="https://maneb.mw"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-brand-teal-light text-sm font-heading font-semibold hover:text-white transition-colors"
              >
                View official MANEB results portal <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════════
            §5  NEWSLETTER & ANNOUNCEMENTS
        ══════════════════════════════════════════════════════════════════ */}
        <section id="news" className="py-24 bg-page">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <span className="text-brand-teal text-sm font-heading font-semibold uppercase tracking-widest">
                Latest News
              </span>
              <h2 className="font-heading font-bold text-3xl md:text-4xl text-brand-navy mt-2">
                School Announcements
              </h2>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {announcements.map((a, i) => (
                <article
                  key={i}
                  className="bg-surface border border-base rounded-2xl p-6 flex flex-col card-hover"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <span
                      className={`text-xs font-heading font-semibold border px-3 py-1 rounded-full ${categoryColors[a.category]}`}
                    >
                      {a.category}
                    </span>
                    <time className="text-xs text-muted font-sans">{a.date}</time>
                  </div>
                  <h3 className="font-heading font-bold text-base text-body mb-3 line-clamp-2 leading-snug">
                    {a.title}
                  </h3>
                  <p className="text-muted text-sm leading-relaxed line-clamp-3 flex-1 font-sans">
                    {a.excerpt}
                  </p>
                  <button className="mt-5 text-brand-teal text-xs font-heading font-semibold flex items-center gap-1 hover:gap-2 transition-all">
                    Read more <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════════
            §6  SERVICES & FACILITIES
        ══════════════════════════════════════════════════════════════════ */}
        <section id="services" className="py-24 bg-surface">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <span className="text-brand-teal text-sm font-heading font-semibold uppercase tracking-widest">
                What We Offer
              </span>
              <h2 className="font-heading font-bold text-3xl md:text-4xl text-brand-navy mt-2">
                Services &amp; Facilities
              </h2>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
              {services.map(({ icon: Icon, label, desc }) => (
                <div
                  key={label}
                  className="group bg-page border border-base hover:border-brand-teal/30 rounded-2xl p-6 transition-colors card-hover"
                >
                  <div className="w-11 h-11 rounded-xl bg-brand-navy/5 group-hover:bg-brand-teal/10 flex items-center justify-center mb-4 transition-colors">
                    <Icon className="w-5 h-5 text-brand-navy/60 group-hover:text-brand-teal transition-colors" />
                  </div>
                  <h3 className="font-heading font-semibold text-sm text-body mb-2">{label}</h3>
                  <p className="text-muted text-xs leading-relaxed font-sans">{desc}</p>
                </div>
              ))}
            </div>

            {/* Physical location */}
            <div className="bg-brand-navy rounded-3xl p-8 text-white flex flex-col md:flex-row items-center gap-6 md:gap-12">
              <div className="flex items-center gap-3">
                <MapPin className="w-4 h-4 text-brand-teal-light shrink-0" />
                <span className="font-sans text-sm text-white/70">
                  P.O. Box 123, Blantyre, Malawi
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Phone className="w-4 h-4 text-brand-teal-light shrink-0" />
                <span className="font-sans text-sm text-white/70">+265 999 123 456</span>
              </div>
              <div className="flex items-center gap-3">
                <Mail className="w-4 h-4 text-brand-teal-light shrink-0" />
                <span className="font-sans text-sm text-white/70">info@school.edu.mw</span>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════════
            7  GALLERY
        ══════════════════════════════════════════════════════════════════ */}
        <section id="gallery" className="py-24 bg-page">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <span className="text-brand-teal text-sm font-heading font-semibold uppercase tracking-widest">
                Gallery
              </span>
              <h2 className="font-heading font-bold text-3xl md:text-4xl text-brand-navy mt-2">
                Life at Our School
              </h2>
            </div>

            {/* Hierarchical photo grid — replace bg divs with <Image> tags */}
            <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
              {/* Large feature */}
              <div className="col-span-2 row-span-2 aspect-square rounded-2xl bg-gradient-to-br from-brand-navy-light/20 to-brand-teal/10 border border-base flex items-center justify-center text-muted text-xs font-sans text-center p-4">
                Feature photo
                <br />
                <code className="text-[10px]">/public/images/gallery/g1.jpg</code>
              </div>
              {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                <div
                  key={n}
                  className="aspect-square rounded-xl bg-gradient-to-br from-brand-navy/5 to-brand-teal/5 border border-base flex items-center justify-center text-muted text-[10px] font-sans"
                >
                  g{n}.jpg
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════════
            §8  ADMISSIONS CTA
        ══════════════════════════════════════════════════════════════════ */}
        <section className="py-24 bg-brand-teal relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none opacity-10 cta-bg-glow" />
          <div className="relative z-10 max-w-4xl mx-auto px-4 text-center">
            <div className="text-white/70 text-sm font-heading font-semibold uppercase tracking-widest mb-4">
              Admissions 2027
            </div>
            <h2 className="font-heading font-bold text-4xl md:text-5xl text-white mb-6 leading-tight">
              Your Child Deserves
              <br />
              the Very Best Start.
            </h2>
            <p className="text-white/70 text-lg mb-10 max-w-2xl mx-auto font-sans leading-relaxed">
              Join a community of ambitious learners, dedicated educators and supportive families.
              Applications for the 2027 Form 1 intake are now open — limited places available.
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <Link
                href="/apply"
                className="bg-white text-brand-teal font-heading font-bold px-8 py-4 rounded-xl hover:bg-white/90 transition-colors shadow-lg text-sm"
              >
                Apply for Admission
              </Link>
              <button
                onClick={() => scrollTo('contact')}
                className="bg-white/10 border border-white/30 text-white font-heading font-semibold px-8 py-4 rounded-xl hover:bg-white/20 transition-colors text-sm"
              >
                Contact Admissions
              </button>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════════
            §9  CONTACT
        ══════════════════════════════════════════════════════════════════ */}
        <section id="contact" className="py-24 bg-surface">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-16">
              {/* Left — contact info */}
              <div>
                <span className="text-brand-teal text-sm font-heading font-semibold uppercase tracking-widest">
                  Get in Touch
                </span>
                <h2 className="font-heading font-bold text-3xl text-brand-navy mt-2 mb-4">
                  Contact Us
                </h2>
                <p className="text-muted mb-8 font-sans leading-relaxed">
                  We welcome enquiries from prospective students, parents, partners and the wider
                  community. Our admissions office is open Monday through Friday.
                </p>

                <ul className="space-y-5">
                  {[
                    {
                      icon: MapPin,
                      label: 'Postal Address',
                      value: 'P.O. Box 123, Blantyre, Malawi',
                    },
                    { icon: Phone, label: 'Phone', value: '+265 999 123 456' },
                    { icon: Mail, label: 'Email', value: 'info@school.edu.mw' },
                    { icon: Clock, label: 'Office Hours', value: 'Mon – Fri: 07:30 – 16:30' },
                  ].map(({ icon: Icon, label, value }) => (
                    <li key={label} className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl bg-brand-teal/10 flex items-center justify-center shrink-0">
                        <Icon className="w-5 h-5 text-brand-teal" />
                      </div>
                      <div>
                        <div className="font-heading font-semibold text-sm text-body">{label}</div>
                        <div className="text-muted text-sm font-sans">{value}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Right — contact form */}
              <div className="bg-page border border-base rounded-3xl p-8">
                <h3 className="font-heading font-bold text-xl text-brand-navy mb-6">
                  Send us a message
                </h3>
                <div className="space-y-4">
                  {[
                    {
                      id: 'c-name',
                      label: 'Full name',
                      type: 'text',
                      placeholder: 'Your full name',
                    },
                    {
                      id: 'c-email',
                      label: 'Email address',
                      type: 'email',
                      placeholder: 'you@example.com',
                    },
                    {
                      id: 'c-subject',
                      label: 'Subject',
                      type: 'text',
                      placeholder: 'Admissions enquiry',
                    },
                  ].map(({ id, label, type, placeholder }) => (
                    <div key={id}>
                      <label
                        htmlFor={id}
                        className="block text-sm font-heading font-medium text-body mb-1.5"
                      >
                        {label}
                      </label>
                      <input
                        id={id}
                        type={type}
                        placeholder={placeholder}
                        className="w-full border border-base rounded-xl px-4 py-2.5 text-sm bg-surface text-body placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal transition-colors"
                      />
                    </div>
                  ))}
                  <div>
                    <label
                      htmlFor="c-message"
                      className="block text-sm font-heading font-medium text-body mb-1.5"
                    >
                      Message
                    </label>
                    <textarea
                      id="c-message"
                      rows={4}
                      placeholder="Your message..."
                      className="w-full border border-base rounded-xl px-4 py-2.5 text-sm bg-surface text-body placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal transition-colors resize-none"
                    />
                  </div>
                  <button className="w-full bg-brand-navy text-white py-3 rounded-xl font-heading font-semibold text-sm flex items-center justify-center gap-2 hover:bg-brand-navy-mid transition-colors">
                    <Send className="w-4 h-4" /> Send Message
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════════
            §10  FOOTER
        ══════════════════════════════════════════════════════════════════ */}
        <footer className="bg-brand-navy text-white pt-16 pb-0">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-10 pb-12 border-b border-white/10">
              {/* Col 1 — Brand */}
              <div className="col-span-2 md:col-span-1">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
                    <span className="text-white text-sm font-heading font-bold">S</span>
                  </div>
                  <span className="font-heading font-bold text-white text-sm">SMS Malawi</span>
                </div>
                <p className="text-white/40 text-xs font-sans leading-relaxed mb-6">
                  Empowering Malawi&apos;s next generation through academic excellence and holistic
                  development.
                </p>
                <div className="flex gap-3">
                  {[
                    { Icon: FaFacebook, label: 'Facebook' },
                    { Icon: FaTwitter, label: 'Twitter' },
                    { Icon: FaInstagram, label: 'Instagram' },
                    { Icon: FaYoutube, label: 'YouTube' },
                    { Icon: FaLinkedin, label: 'LinkedIn' },
                  ].map(({ Icon, label }) => (
                    <button
                      key={label}
                      aria-label={label}
                      className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/15 flex items-center justify-center transition-colors"
                    >
                      <Icon className="w-3.5 h-3.5 text-white/50 hover:text-white" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Cols 2–4 */}
              {[
                {
                  title: 'Quick Links',
                  links: ['Home', 'About Us', 'News', 'Gallery', 'Contact'],
                },
                {
                  title: 'Admissions',
                  links: [
                    'How to Apply',
                    'Entry Requirements',
                    'Fees Structure',
                    'Scholarships',
                    'FAQs',
                  ],
                },
                {
                  title: 'Academic',
                  links: ['Curriculum', 'MANEB Portal', 'Timetable', 'Library', 'Student Portal'],
                },
              ].map(({ title, links }) => (
                <div key={title}>
                  <h4 className="font-heading font-semibold text-sm text-white mb-5">{title}</h4>
                  <ul className="space-y-3">
                    {links.map((l) => (
                      <li key={l}>
                        <a
                          href="#"
                          className="text-white/40 hover:text-white text-xs font-sans transition-colors"
                        >
                          {l}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* Footer bottom */}
            <div className="py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-white/30 text-xs font-sans">
                © {new Date().getFullYear()} SMS Malawi. All rights reserved.
              </p>
              <div className="flex gap-5">
                {['Privacy Policy', 'Terms of Use'].map((t) => (
                  <a
                    key={t}
                    href="#"
                    className="text-white/30 hover:text-white/60 text-xs font-sans transition-colors"
                  >
                    {t}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </footer>
      </div>
    </>
  )
}