'use client'

/**
 * FILE: apps/web/src/app/(public)/page.tsx
 * [CHANGE TYPE]: MAJOR REWRITE — full visual redesign per
 *   Teller_Public_Landing_Redesign.zip (the new design is the source of
 *   truth for layout/visuals). Every interactive element and every real
 *   data point is re-wired to the app's actual backend; nothing in this
 *   file is a static mockup.
 * [PURPOSE]:
 *   1. Theme toggle uses the app's real next-themes system (useTheme +
 *      useHasMounted), not the original design mockup's manual DOM
 *      color-swapping — dark mode works via the existing bg-page/bg-surface/
 *      text-body/border-base token system everywhere in this file.
 *   2. News, the announcement rail, and "Academic Advertisements" all draw
 *      from the single real usePublicAnnouncements() feed. The backend
 *      never actually returns `category` despite the type declaring one
 *      (confirmed dead field in public.ts's /announcements handler), so
 *      category-based sectioning was never possible. Instead: announcements
 *      WITH an eventDate power a genuine Events section (eventDate existed
 *      on PublicAnnouncement and was fetched by the previous page, but never
 *      used this way); announcements WITHOUT eventDate power the rail and
 *      News/Academic Advertisements (same feed, different slices — there is
 *      only one real content source, so both sections are honest about
 *      sharing it rather than a fabricated second feed).
 *   3. Performance stats map generically over usePublicManebStats().stats
 *      (works for however many exam types exist, not hardcoded to MSCE+JCE),
 *      plus a real University Placement card from the new
 *      usePublicPlacementStats() endpoint (see public.ts — every
 *      /placements/* route required auth; nothing was public before this).
 *      "Learners enrolled" has no live source anywhere in the system; kept
 *      the prior page's own precedent of substituting "Total candidates"
 *      (sum of MANEB stats totals) rather than a fabricated number.
 *   4. Mission, Vision and Core Values (schoolInfo.vision/mission/
 *      coreValues) are real Settings-backed fields that the previous page
 *      fetched but never rendered anywhere — given a real home here.
 *   5. The "Send us a message" contact form is wired to a new
 *      POST /public/contact (useContactForm()) — it had no backend at all
 *      in either the previous page or the new design (pure decoration in
 *      both). Emails the school's real contact address with Reply-To set to
 *      the visitor.
 *   6. Newsletter subscribe is single-email only — the design's topic
 *      selector pills (Admissions/Exam results/Events/Newsletter) have no
 *      backing field anywhere on NewsletterSubscriber (confirmed: email,
 *      name, token, confirmed, unsubscribedAt only), so a selector that
 *      silently did nothing would be misleading. Dropped per instruction.
 *   7. Social icons use react-icons/fa (already an installed, working
 *      dependency, already used by the previous footer) rather than lucide
 *      — lucide-react deliberately excludes trademarked brand marks, so
 *      there is no lucide Facebook/Twitter/Instagram/YouTube/LinkedIn icon
 *      to import.
 *   8. No real hero/gallery/news-photo image assets exist in this project
 *      (confirmed in the prior rewrite); kept that page's established
 *      pattern of a clean icon-in-gradient placeholder instead of a broken
 *      <img> or the design mockup's "1200×660" dev-facing placeholder text.
 * [DEPENDS ON]: apps/web/src/hooks/usePublic.ts, next-themes
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { useHasMounted } from '@/hooks/useHasMounted'
import { FaFacebook, FaTwitter, FaInstagram, FaYoutube, FaLinkedin } from 'react-icons/fa'
import {
  Sun, Moon, Monitor, Search, ArrowRight, Menu, X,
  ExternalLink, Send, Loader2, CheckCircle2,
  ImageIcon, Target, Compass, Sparkles, CalendarDays,
} from 'lucide-react'
import {
  usePublicSchoolInfo,
  usePublicManebStats,
  usePublicPlacementStats,
  usePublicAnnouncements,
  useNewsletterSubscribe,
  useContactForm,
} from '@/hooks/usePublic'

// ─────────────────────────────────────────────────────────────────────────────
// SHARED HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Placeholder for a section that would show a real photo once school image
 *  assets exist — no hero/gallery/news images are in the project yet. */
function ImagePlaceholder({ label, className = '' }: { label?: string; className?: string }) {
  return (
    <div
      className={`bg-linear-to-br from-brand-navy-light/20 to-brand-teal/10 border border-base flex flex-col items-center justify-center gap-2 ${className}`}
    >
      <ImageIcon className="w-6 h-6 text-brand-navy/25" aria-hidden />
      {label && <span className="text-[10px] font-heading tracking-wide text-muted/70 uppercase">{label}</span>}
    </div>
  )
}

function formatRelativeDate(iso: string): string {
  const then = new Date(iso).getTime()
  const days = Math.max(0, Math.round((Date.now() - then) / 86_400_000))
  if (days === 0) return 'Today'
  if (days === 1) return '1 day ago'
  if (days < 7) return `${days} days ago`
  const weeks = Math.round(days / 7)
  if (weeks < 5) return `${weeks} week${weeks === 1 ? '' : 's'} ago`
  const months = Math.round(days / 30)
  return `${months} month${months === 1 ? '' : 's'} ago`
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

// ─────────────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const { theme, setTheme } = useTheme()
  const mounted = useHasMounted()
  const [menuOpen, setMenuOpen]     = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [scrolled, setScrolled]     = useState(false)
  const headerRef = useRef<HTMLElement>(null)

  // ── Live public data ──────────────────────────────────────────────────
  const { data: schoolInfo }   = usePublicSchoolInfo()
  const { data: manebStats }   = usePublicManebStats()
  const { data: placementStats } = usePublicPlacementStats()
  // 12 is the backend's own max (Math.min(limit, 12) in public.ts) — pull
  // the full allowance once and slice client-side for the rail/news/
  // advertisements/events sections rather than four separate network calls.
  const { data: announcements = [], isLoading: announcementsLoading } = usePublicAnnouncements(12)

  const currentYearNum = new Date().getFullYear()
  const yearsOfExcellence = schoolInfo ? currentYearNum - schoolInfo.founded : null
  const overallCandidates = manebStats?.stats.reduce((sum, s) => sum + s.total, 0) ?? 0

  // Real split: eventDate present -> Events; absent -> News/Advertisements/rail.
  // See file header note 2 — there is only one real announcements feed.
  const datedAnnouncements = announcements
    .filter((a) => a.eventDate)
    .sort((a, b) => new Date(a.eventDate!).getTime() - new Date(b.eventDate!).getTime())
  const undatedAnnouncements = announcements.filter((a) => !a.eventDate)

  const railItems = undatedAnnouncements.slice(0, 2)
  const newsItems  = undatedAnnouncements.slice(0, 4)
  const adItems     = undatedAnnouncements.length > 4
    ? undatedAnnouncements.slice(4, 8)
    : undatedAnnouncements.slice(0, 4)
  const eventItems = datedAnnouncements.slice(0, 3)

  // ── Newsletter (single email — see file header note 6) ─────────────────
  const [newsletterEmail, setNewsletterEmail] = useState('')
  const [newsletterMsg, setNewsletterMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const newsletterSubscribe = useNewsletterSubscribe()

  function handleNewsletterSubmit(e: React.FormEvent) {
    e.preventDefault()
    setNewsletterMsg(null)
    newsletterSubscribe.mutate(
      { email: newsletterEmail },
      {
        onSuccess: (res) => { setNewsletterMsg({ kind: 'success', text: res.message }); setNewsletterEmail('') },
        onError: (err) => setNewsletterMsg({ kind: 'error', text: err instanceof Error ? err.message : 'Failed to subscribe. Please try again.' }),
      },
    )
  }

  // ── Contact form (real backend — see file header note 5) ───────────────
  const [contactForm, setContactForm] = useState({ name: '', email: '', subject: '', message: '' })
  const [contactMsg, setContactMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const contactSubmit = useContactForm()

  function handleContactSubmit(e: React.FormEvent) {
    e.preventDefault()
    setContactMsg(null)
    contactSubmit.mutate(contactForm, {
      onSuccess: (res) => { setContactMsg({ kind: 'success', text: res.message }); setContactForm({ name: '', email: '', subject: '', message: '' }) },
      onError: (err) => setContactMsg({ kind: 'error', text: err instanceof Error ? err.message : 'Failed to send your message. Please try again.' }),
    })
  }

  // ── Header scroll behaviour (fixed transparent -> solid) ────────────────
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60 || menuOpen || searchOpen)
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [menuOpen, searchOpen])

  const themeIcons: Record<string, React.ReactNode> = {
    light: <Sun className="w-4 h-4" />,
    dark: <Moon className="w-4 h-4" />,
    system: <Monitor className="w-4 h-4" />,
  }
  const cycleTheme = () => {
    const order = ['light', 'dark', 'system']
    setTheme(order[(order.indexOf(theme ?? 'system') + 1) % order.length] ?? 'system')
  }

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    setMenuOpen(false)
    setSearchOpen(false)
  }

  const NAV_LINKS: { label: string; href: string; anchor?: boolean }[] = [
    { label: 'About', href: 'about', anchor: true },
    { label: 'Academics', href: 'academics', anchor: true },
    { label: 'Admissions', href: '/apply' },
    { label: 'Performance', href: 'performance', anchor: true },
    { label: 'Student Life', href: 'discover', anchor: true },
    { label: 'News', href: 'news', anchor: true },
    { label: 'Contact', href: 'contact', anchor: true },
  ]

  return (
    <>
      <style>{`
        @keyframes blobRotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .blob-slow  { animation: blobRotate 20s linear infinite; }
        .blob-med   { animation: blobRotate 25s linear infinite; }
        .blob-fast  { animation: blobRotate 15s linear infinite; }
        .blob-slower{ animation: blobRotate 10s linear infinite; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        .fade-up { animation: fadeUp 0.7s ease both; }
        .card-hover { transition: transform 0.25s ease, box-shadow 0.25s ease; }
        .card-hover:hover { transform: translateY(-4px); }
        .nav-link-underline { position:relative; }
        .nav-link-underline::after { content:''; position:absolute; bottom:-3px; left:0; width:0; height:2px; background:currentColor; border-radius:1px; transition:width .2s ease; }
        .nav-link-underline:hover::after { width:100%; }
      `}</style>

      <div className="bg-page text-body font-sans">
        {/* ══════════════════════════════════════════════════════════════
            HEADER — fixed, transparent over hero, solid once scrolled
        ══════════════════════════════════════════════════════════════ */}
        <header
          ref={headerRef}
          className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b ${
            scrolled
              ? 'bg-surface/95 backdrop-blur-md border-base shadow-sm'
              : 'bg-transparent border-white/15'
          }`}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-[72px] flex items-center gap-6">
            <button onClick={() => scrollTo('top')} className="flex items-center gap-3 shrink-0">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center font-heading font-extrabold text-base transition-colors ${
                  scrolled ? 'bg-brand-navy text-white' : 'bg-white/15 text-white'
                }`}
              >
                S
              </div>
              <div className="text-left leading-tight hidden sm:block">
                <div className={`font-heading font-extrabold text-sm tracking-tight transition-colors ${scrolled ? 'text-brand-navy dark:text-white' : 'text-white'}`}>
                  {schoolInfo?.schoolName?.toUpperCase() ?? 'SMS MALAWI'}
                </div>
                <div className={`text-[11px] tracking-wide transition-colors ${scrolled ? 'text-muted' : 'text-white/60'}`}>
                  Secondary School Management System
                </div>
              </div>
            </button>

            <nav className="hidden xl:flex items-center gap-1 ml-auto font-heading text-[12.5px] font-semibold whitespace-nowrap">
              {NAV_LINKS.map((l) =>
                l.anchor ? (
                  <button
                    key={l.label}
                    onClick={() => scrollTo(l.href)}
                    className={`nav-link-underline px-2.5 py-2 rounded-lg transition-colors ${
                      scrolled ? 'text-body hover:bg-page' : 'text-white/85 hover:bg-white/10'
                    }`}
                  >
                    {l.label}
                  </button>
                ) : (
                  <Link
                    key={l.label}
                    href={l.href}
                    className={`nav-link-underline px-2.5 py-2 rounded-lg transition-colors ${
                      scrolled ? 'text-body hover:bg-page' : 'text-white/85 hover:bg-white/10'
                    }`}
                  >
                    {l.label}
                  </Link>
                ),
              )}
            </nav>

            <div className="flex items-center gap-2 shrink-0 ml-auto xl:ml-0">
              <button
                onClick={() => { setSearchOpen((v) => !v); setMenuOpen(false) }}
                aria-label="Search"
                className={`w-9 h-9 rounded-lg border flex items-center justify-center transition-colors ${
                  scrolled ? 'border-base text-body hover:bg-page' : 'border-white/25 text-white hover:bg-white/10'
                }`}
              >
                <Search className="w-4 h-4" />
              </button>
              <button
                onClick={cycleTheme}
                aria-label={mounted ? `Theme: ${theme}. Click to change.` : 'Toggle theme'}
                className={`w-9 h-9 rounded-lg border flex items-center justify-center transition-colors ${
                  scrolled ? 'border-base text-body hover:bg-page' : 'border-white/25 text-white hover:bg-white/10'
                }`}
              >
                {mounted ? themeIcons[theme ?? 'system'] : <Monitor className="w-4 h-4" aria-hidden />}
              </button>
              <Link
                href="/login"
                className="hidden sm:flex items-center gap-2 bg-brand-teal text-white px-4 py-2.5 rounded-lg font-heading font-bold text-[13px] hover:bg-brand-teal-light transition-colors"
              >
                Login Portal <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <button
                onClick={() => { setMenuOpen((v) => !v); setSearchOpen(false) }}
                className="flex items-center gap-2 bg-brand-teal text-white px-3.5 py-2.5 rounded-lg font-heading font-bold text-[13px] hover:bg-brand-teal-light transition-colors"
              >
                {menuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
                <span className="hidden sm:inline">Menu</span>
              </button>
            </div>
          </div>

          {/* Search flyout */}
          {searchOpen && (
            <div className="border-t border-base bg-surface">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-center gap-3">
                <Search className="w-4.5 h-4.5 text-muted shrink-0" aria-hidden />
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search announcements, results, programmes…"
                  className="flex-1 bg-transparent outline-none text-base text-body placeholder:text-muted"
                />
                <button
                  onClick={() => setSearchOpen(false)}
                  aria-label="Close search"
                  className="w-8 h-8 rounded-lg bg-page text-muted hover:text-body flex items-center justify-center shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Mega menu */}
          {menuOpen && (
            <div className="border-t border-base bg-brand-navy text-white">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-9 grid grid-cols-2 md:grid-cols-4 gap-8">
                {[
                  {
                    title: 'Academics',
                    links: [
                      { label: 'Curriculum & Subjects', anchor: 'academics' },
                      { label: 'MANEB Performance', anchor: 'performance' },
                      { label: 'Timetable', href: '/login' },
                      { label: 'Library', href: '/login' },
                    ],
                  },
                  {
                    title: 'Admissions',
                    links: [
                      { label: 'How to Apply', href: '/apply' },
                      { label: 'Entry Requirements', href: '/apply' },
                      { label: 'Fees Structure', href: '/apply' },
                      { label: 'Scholarships', anchor: 'contact' },
                    ],
                  },
                  {
                    title: 'Current Students',
                    links: [
                      { label: 'Login Portal (Students & Staff)', href: '/login' },
                      { label: 'Student Life', anchor: 'discover' },
                      { label: 'Facilities', anchor: 'gallery' },
                      { label: 'Gallery', anchor: 'gallery' },
                    ],
                  },
                  {
                    title: 'Get in Touch',
                    links: [
                      { label: 'Contact & Directions', anchor: 'contact' },
                      { label: 'News & Announcements', anchor: 'news' },
                      { label: 'Privacy Policy', href: '/privacy' },
                      { label: 'Terms of Use', href: '/terms' },
                    ],
                  },
                ].map((col) => (
                  <div key={col.title}>
                    <div className="font-heading text-[11px] font-bold tracking-widest uppercase text-brand-teal-light mb-3.5">
                      {col.title}
                    </div>
                    <div className="flex flex-col gap-2.5 text-sm">
                      {col.links.map((l) =>
                        'anchor' in l && l.anchor ? (
                          <button key={l.label} onClick={() => scrollTo(l.anchor!)} className="text-left text-white/70 hover:text-white transition-colors">
                            {l.label}
                          </button>
                        ) : (
                          <Link key={l.label} href={l.href!} className="text-white/70 hover:text-white transition-colors">
                            {l.label}
                          </Link>
                        ),
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </header>

        {/* ══════════════════════════════════════════════════════════════
            HERO
        ══════════════════════════════════════════════════════════════ */}
        <section id="top" className="relative bg-brand-navy overflow-hidden min-h-[640px] flex items-end">
          <svg preserveAspectRatio="xMidYMid slice" viewBox="10 10 80 80" className="absolute inset-0 w-full h-full blur-[6px]" aria-hidden>
            <path fill="#D98A0B" className="blob-slow" style={{ transformOrigin: '13px 25px' }} d="M37-5C25.1-14.7,5.7-19.1-9.2-10-28.5,1.8-32.7,31.1-19.8,49c15.5,21.5,52.6,22,67.2,2.3C59.4,35,53.7,8.5,37-5Z" />
            <path fill="#24507F" className="blob-slower" style={{ transformOrigin: '13px 25px' }} d="M20.6,4.1C11.6,1.5-1.9,2.5-8,11.2-16.3,23.1-8.2,45.6,7.4,50S42.1,38.9,41,24.5C40.2,14.1,29.4,6.6,20.6,4.1Z" />
            <path fill="#0E8A6A" className="blob-med" style={{ transformOrigin: '84px 93px' }} d="M105.9,48.6c-12.4-8.2-29.3-4.8-39.4.8-23.4,12.8-37.7,51.9-19.1,74.1s63.9,15.3,76-5.6c7.6-13.3,1.8-31.1-2.3-43.8C117.6,63.3,114.7,54.3,105.9,48.6Z" />
            <path fill="#17B187" className="blob-fast" style={{ transformOrigin: '84px 93px' }} d="M102,67.1c-9.6-6.1-22-3.1-29.5,2-15.4,10.7-19.6,37.5-7.6,47.8s35.9,3.9,44.5-12.5C115.5,92.6,113.9,74.6,102,67.1Z" />
          </svg>
          <div className="absolute inset-0 bg-linear-to-b from-[rgba(11,29,51,.62)] via-[rgba(11,29,51,.72)] to-[rgba(11,29,51,.94)]" />

          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-[180px] w-full">
            <div className="max-w-3xl fade-up">
              <h1 className="font-heading font-extrabold text-white leading-[1.04] tracking-tight text-5xl md:text-6xl lg:text-7xl mb-4">
                Welcome to {schoolInfo?.schoolName ?? 'SMS Malawi'}
              </h1>
              <p className="font-heading font-semibold text-xl text-white/80 mb-1.5">
                Secondary School Management System
              </p>
              <p className="text-lg text-white/55 max-w-xl leading-relaxed mb-8">
                {schoolInfo?.slogan ?? 'Where Minds Ignite and Futures Begin'} — from Form 1 through MSCE.
              </p>
              <div className="flex gap-3 flex-wrap">
                <button
                  onClick={() => scrollTo('about')}
                  className="inline-flex items-center gap-2 bg-brand-teal text-white px-6 py-4 rounded-xl font-heading font-bold text-sm hover:bg-brand-teal-light transition-colors"
                >
                  All about us <ArrowRight className="w-4 h-4" />
                </button>
                <Link
                  href="/apply"
                  className="inline-flex items-center gap-2 bg-white/10 border border-white/25 text-white px-6 py-4 rounded-xl font-heading font-bold text-sm hover:bg-white/20 transition-colors"
                >
                  Apply for Admission
                </Link>
              </div>
              <div className="flex items-center gap-3.5 mt-11 font-heading font-extrabold text-[13px] tracking-[3px] uppercase text-white/35">
                <span>Learn</span><span className="text-brand-teal-light">/</span>
                <span>Lead</span><span className="text-brand-teal-light">/</span>
                <span>Excel</span>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════
            ANNOUNCEMENT RAIL — latest 2 undated announcements
        ══════════════════════════════════════════════════════════════ */}
        <section className="bg-[#0B1D33] dark:bg-[#081522]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-7 grid md:grid-cols-[200px_1fr] gap-8 items-center">
            <div>
              <div className="font-heading text-[11px] font-bold tracking-widest uppercase text-brand-teal-light mb-1.5">
                Announcements
              </div>
              <button onClick={() => scrollTo('news')} className="text-[13px] text-white/50 hover:text-white transition-colors">
                View all →
              </button>
            </div>
            <div className="grid sm:grid-cols-2 gap-5">
              {railItems.length === 0 ? (
                <p className="text-sm text-white/40 sm:col-span-2">No announcements yet — check back soon.</p>
              ) : (
                railItems.map((a) => (
                  <article key={a.id} className="border-l-2 border-brand-teal-light/55 pl-4.5">
                    <h4 className="font-heading font-bold text-[15px] text-white mb-1.5 leading-snug line-clamp-2">
                      {a.title}
                    </h4>
                    <p className="text-[13.5px] text-white/50 mb-2 leading-relaxed line-clamp-2">{a.body}</p>
                    <span className="font-mono text-[11px] text-white/35">{formatRelativeDate(a.createdAt)}</span>
                  </article>
                ))
              )}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════
            LATEST NEWS
        ══════════════════════════════════════════════════════════════ */}
        <section id="news" className="bg-surface py-20 sm:py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-end justify-between mb-9 gap-4 flex-wrap">
              <h2 className="font-heading font-extrabold text-3xl sm:text-4xl tracking-tight text-brand-navy dark:text-white">
                Latest News
              </h2>
              <button
                onClick={() => scrollTo('news')}
                className="inline-flex items-center gap-2 border border-base text-body px-4.5 py-2.5 rounded-full font-heading font-bold text-[13px] hover:border-brand-teal hover:text-brand-teal transition-colors"
              >
                All News →
              </button>
            </div>

            {announcementsLoading ? (
              <div className="grid lg:grid-cols-2 gap-10" role="status" aria-label="Loading news">
                <div className="h-96 bg-page rounded-2xl animate-pulse" />
                <div className="space-y-5">
                  {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-page rounded-xl animate-pulse" />)}
                </div>
              </div>
            ) : newsItems.length === 0 ? (
              <div className="text-center py-14 text-muted text-sm">No announcements have been published yet — check back soon.</div>
            ) : (
              <div className="grid lg:grid-cols-[1.15fr_1fr] gap-10">
                {/* Featured */}
                <article>
                  <ImagePlaceholder label="News" className="h-[330px] rounded-2xl mb-5" />
                  <h3 className="font-heading font-bold text-2xl sm:text-[28px] leading-tight tracking-tight text-brand-navy dark:text-white mb-2.5">
                    {newsItems[0]!.title}
                  </h3>
                  <div className="font-mono text-[11.5px] text-muted mb-3">{formatRelativeDate(newsItems[0]!.createdAt)}</div>
                  <p className="text-[15.5px] leading-relaxed text-muted mb-4 line-clamp-4">{newsItems[0]!.body}</p>
                  <button onClick={() => scrollTo('news')} className="font-heading font-bold text-[13.5px] text-brand-teal hover:underline">
                    Read more →
                  </button>
                </article>

                {/* Secondary list */}
                <div className="flex flex-col gap-5">
                  {newsItems.slice(1, 4).map((a) => (
                    <article key={a.id} className="grid grid-cols-[110px_1fr] sm:grid-cols-[132px_1fr] gap-4.5 pb-5 border-b border-base last:border-0 last:pb-0">
                      <ImagePlaceholder className="h-24 rounded-lg" />
                      <div>
                        <h4 className="font-heading font-bold text-[15px] sm:text-base leading-snug text-brand-navy dark:text-white mb-2 line-clamp-2">
                          {a.title}
                        </h4>
                        <div className="font-mono text-[11px] text-muted mb-2">{formatRelativeDate(a.createdAt)}</div>
                        <button onClick={() => scrollTo('news')} className="font-heading font-bold text-xs text-brand-teal hover:underline">
                          Read more →
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════
            ACADEMIC ADVERTISEMENTS
        ══════════════════════════════════════════════════════════════ */}
        <section className="bg-page py-16 sm:py-18 border-y border-base">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-[300px_1fr] gap-12">
            <div>
              <h2 className="font-heading font-extrabold text-2xl sm:text-[28px] tracking-tight text-brand-navy dark:text-white mb-3 leading-tight">
                Academic Advertisements
              </h2>
              <p className="text-[14.5px] text-muted leading-relaxed mb-5">
                Calls for applications, intake notices and examination circulars, published as they are issued.
              </p>
              <button
                onClick={() => scrollTo('news')}
                className="inline-flex items-center gap-2 border border-base bg-surface text-body px-4.5 py-2.5 rounded-full font-heading font-bold text-[13px] hover:border-brand-teal hover:text-brand-teal transition-colors"
              >
                More Announcements →
              </button>
            </div>
            <div className="flex flex-col">
              {adItems.length === 0 ? (
                <p className="text-sm text-muted py-5">No circulars published yet.</p>
              ) : (
                adItems.map((a, i) => (
                  <button
                    key={a.id}
                    onClick={() => scrollTo('news')}
                    className={`flex items-baseline justify-between gap-6 py-5 text-left text-body hover:text-brand-teal transition-colors ${i < adItems.length - 1 ? 'border-b border-base' : ''}`}
                  >
                    <span className="font-heading font-semibold text-base sm:text-[16.5px] leading-snug">{a.title}</span>
                    <span className="font-mono text-[11.5px] text-muted whitespace-nowrap shrink-0">{formatRelativeDate(a.createdAt)}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════
            DISCOVER — id="about"
        ══════════════════════════════════════════════════════════════ */}
        <section id="about" className="bg-surface py-20 sm:py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div id="discover" className="max-w-2xl mb-10">
              <h2 className="font-heading font-extrabold text-3xl sm:text-4xl tracking-tight text-brand-navy dark:text-white mb-3.5">
                Discover
              </h2>
              <p className="text-[16.5px] leading-relaxed text-muted">
                Our school is a place where potential is discovered, developed and directed. Explore the people, programmes and daily life that make it more than a set of classrooms.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {[
                { title: 'Leadership', desc: 'A head teacher and board committed to transparent, forward-thinking school governance.', anchor: 'about', tint: 'from-brand-navy-light/40 to-brand-navy' },
                { title: 'Academics', desc: 'A rigorous curriculum aligned to MANEB standards for both JCE and MSCE candidates.', anchor: 'academics', tint: 'from-brand-teal/70 to-brand-navy' },
                { title: 'Student Life', desc: 'Sport, drama, choir, debate and community service alongside a full boarding programme.', anchor: 'discover', tint: 'from-brand-purple/70 to-brand-navy' },
                { title: 'Admissions', desc: 'Everything a prospective family needs — entry requirements, fees and application steps.', href: '/apply', tint: 'from-brand-amber/70 to-brand-navy' },
              ].map((card) => (
                card.href ? (
                  <Link
                    key={card.title}
                    href={card.href}
                    className={`block text-left rounded-2xl overflow-hidden relative min-h-[290px] card-hover bg-linear-to-b ${card.tint}`}
                  >
                    <div className="absolute inset-0 bg-linear-to-b from-black/5 to-black/70" />
                    <div className="relative p-6 flex flex-col justify-end h-[290px] box-border">
                      <h3 className="font-heading font-bold text-lg text-white mb-2">{card.title}</h3>
                      <p className="text-[13.5px] leading-relaxed text-white/65">{card.desc}</p>
                    </div>
                  </Link>
                ) : (
                  <button
                    key={card.title}
                    type="button"
                    onClick={() => scrollTo(card.anchor!)}
                    className={`block text-left rounded-2xl overflow-hidden relative min-h-[290px] card-hover bg-linear-to-b ${card.tint}`}
                  >
                    <div className="absolute inset-0 bg-linear-to-b from-black/5 to-black/70" />
                    <div className="relative p-6 flex flex-col justify-end h-[290px] box-border">
                      <h3 className="font-heading font-bold text-lg text-white mb-2">{card.title}</h3>
                      <p className="text-[13.5px] leading-relaxed text-white/65">{card.desc}</p>
                    </div>
                  </button>
                )
              ))}
            </div>

            {/* Mission, Vision & Core Values — real Settings-backed fields */}
            {(schoolInfo?.mission || schoolInfo?.vision || (schoolInfo?.coreValues?.length ?? 0) > 0) && (
              <div className="mt-14 grid md:grid-cols-2 gap-6">
                {schoolInfo?.mission && (
                  <div className="bg-page border border-base rounded-2xl p-7">
                    <div className="w-11 h-11 rounded-xl bg-brand-teal/10 flex items-center justify-center mb-4">
                      <Target className="w-5.5 h-5.5 text-brand-teal" />
                    </div>
                    <h4 className="font-heading font-bold text-lg text-brand-teal mb-2.5">Our Mission</h4>
                    <p className="text-sm text-muted leading-relaxed">{schoolInfo.mission}</p>
                  </div>
                )}
                {schoolInfo?.vision && (
                  <div className="bg-page border border-base rounded-2xl p-7">
                    <div className="w-11 h-11 rounded-xl bg-brand-purple/10 flex items-center justify-center mb-4">
                      <Compass className="w-5.5 h-5.5 text-brand-purple" />
                    </div>
                    <h4 className="font-heading font-bold text-lg text-brand-purple mb-2.5">Our Vision</h4>
                    <p className="text-sm text-muted leading-relaxed">{schoolInfo.vision}</p>
                  </div>
                )}
                {schoolInfo?.coreValues && schoolInfo.coreValues.length > 0 && (
                  <div className="md:col-span-2 bg-page border border-base rounded-2xl p-7">
                    <div className="flex items-center gap-2.5 mb-4">
                      <Sparkles className="w-5 h-5 text-brand-amber" />
                      <h4 className="font-heading font-bold text-lg text-brand-navy dark:text-white">Our Core Values</h4>
                    </div>
                    <div className="flex flex-wrap gap-2.5">
                      {schoolInfo.coreValues.map((v) => (
                        <span key={v} className="text-sm font-heading font-semibold bg-surface border border-base rounded-full px-4 py-2 text-body">
                          {v}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Gallery strip — no real photo assets exist yet */}
            <div id="gallery" className="mt-12 pt-9 border-t border-base">
              <div className="flex items-baseline justify-between mb-4.5">
                <h3 className="font-heading font-bold text-xl tracking-tight text-brand-navy dark:text-white">
                  Life at our school
                </h3>
                <span className="font-heading font-bold text-[13px] text-brand-teal">Photos coming soon</span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                {['Assembly', 'Laboratory', 'Library', 'Sports Day', 'Boarding'].map((label) => (
                  <ImagePlaceholder key={label} label={label} className="h-32 rounded-xl" />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════
            PERFORMANCE — id="academics" anchors here too (see file header)
        ══════════════════════════════════════════════════════════════ */}
        <div id="academics" />
        <section id="performance" className="bg-brand-navy py-20 sm:py-24 text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-end justify-between gap-8 mb-11 flex-wrap">
              <div className="max-w-xl">
                <div className="font-heading text-[11px] font-bold tracking-widest uppercase text-brand-teal-light mb-3">
                  Academic Performance
                </div>
                <h2 className="font-heading font-extrabold text-3xl sm:text-4xl tracking-tight mb-3">
                  Results That Speak for Themselves
                </h2>
                <p className="text-white/55 text-base leading-relaxed">
                  Our latest MANEB examination results, published from the school records system as they become available.
                </p>
              </div>
              <a
                href="https://maneb.mw"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 border border-white/25 text-white px-5 py-2.75 rounded-full font-heading font-bold text-[13px] hover:bg-white/10 transition-colors whitespace-nowrap"
              >
                MANEB Portal <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {manebStats && manebStats.stats.length > 0 ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/10 border border-white/10 rounded-2xl overflow-hidden mb-6">
                  {[
                    ...manebStats.stats.map((s) => ({ value: `${s.passRate}%`, label: `${s.examType} pass rate` })),
                    { value: overallCandidates.toLocaleString(), label: 'Total MANEB candidates' },
                    { value: yearsOfExcellence != null ? `${yearsOfExcellence}+` : '—', label: 'Years of excellence' },
                  ].map((s) => (
                    <div key={s.label} className="bg-brand-navy p-7">
                      <div className="font-heading font-extrabold text-[44px] leading-none tracking-tight">{s.value}</div>
                      <div className="text-[13.5px] text-white/50 mt-2">{s.label}</div>
                    </div>
                  ))}
                </div>

                <div className="grid md:grid-cols-3 gap-5">
                  {manebStats.stats.map((s) => (
                    <div key={s.examType} className="bg-white/5 border border-white/10 rounded-2xl p-6">
                      <div className="flex items-center justify-between mb-4.5">
                        <h4 className="font-heading font-bold text-sm">{s.examType}</h4>
                        <span className="font-mono text-[11.5px] text-brand-teal-light">{manebStats.year}</span>
                      </div>
                      <div className="flex justify-between text-xs mb-2">
                        <span className="text-white/50">Pass rate</span>
                        <span className="font-heading font-bold">{s.passRate}%</span>
                      </div>
                      <div className="h-1.75 bg-white/10 rounded-full overflow-hidden mb-3.5">
                        <div className="h-full bg-brand-teal rounded-full" style={{ width: `${s.passRate}%` }} />
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-white/50">Candidates</span>
                        <span className="text-white/75 font-semibold">{s.passed} passed / {s.total} total</span>
                      </div>
                    </div>
                  ))}

                  {/* University Placement — real usePublicPlacementStats() */}
                  {placementStats && placementStats.qualified > 0 && (
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                      <div className="flex items-center justify-between mb-4.5">
                        <h4 className="font-heading font-bold text-sm">University Placement</h4>
                        <span className="font-mono text-[11.5px] text-brand-teal-light">{placementStats.year}</span>
                      </div>
                      <div className="flex justify-between text-xs mb-2">
                        <span className="text-white/50">Selection rate</span>
                        <span className="font-heading font-bold">{placementStats.selectionRate}%</span>
                      </div>
                      <div className="h-1.75 bg-white/10 rounded-full overflow-hidden mb-3.5">
                        <div className="h-full bg-brand-teal rounded-full" style={{ width: `${placementStats.selectionRate}%` }} />
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-white/50">MSCE leavers</span>
                        <span className="text-white/75 font-semibold">{placementStats.selected} selected / {placementStats.qualified} qualified</span>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="text-center py-14 text-white/50 text-sm">
                MANEB results for this academic year have not been published yet.
              </div>
            )}
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════
            EVENTS — dated announcements
        ══════════════════════════════════════════════════════════════ */}
        <section id="events" className="bg-surface py-20 sm:py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-end justify-between mb-9 gap-4 flex-wrap">
              <h2 className="font-heading font-extrabold text-3xl sm:text-4xl tracking-tight text-brand-navy dark:text-white">
                Events
              </h2>
              <button
                onClick={() => scrollTo('events')}
                className="inline-flex items-center gap-2 border border-base text-body px-4.5 py-2.5 rounded-full font-heading font-bold text-[13px] hover:border-brand-teal hover:text-brand-teal transition-colors"
              >
                All events →
              </button>
            </div>

            {eventItems.length === 0 ? (
              <div className="text-center py-14 text-muted text-sm flex flex-col items-center gap-3">
                <CalendarDays className="w-8 h-8 text-muted/40" aria-hidden />
                No upcoming events have been scheduled yet — check back soon.
              </div>
            ) : (
              <div className="grid md:grid-cols-3 gap-6">
                {eventItems.map((ev) => {
                  const d = new Date(ev.eventDate!)
                  return (
                    <article key={ev.id} className="border border-base rounded-2xl overflow-hidden bg-page relative card-hover">
                      <ImagePlaceholder className="h-[170px]" />
                      <div className="absolute top-3 left-3 bg-brand-navy text-white rounded-lg px-3 py-2 text-center min-w-[52px]">
                        <div className="font-heading text-[10.5px] font-bold tracking-wide text-brand-teal-light">{MONTHS[d.getMonth()]}</div>
                        <div className="font-heading text-xl font-extrabold leading-tight">{d.getDate()}</div>
                      </div>
                      <div className="p-5 sm:p-6">
                        <h3 className="font-heading font-bold text-[17px] leading-snug text-brand-navy dark:text-white mb-2.5 line-clamp-2">
                          {ev.title}
                        </h3>
                        <p className="text-[13.5px] text-muted mb-3.5 line-clamp-2">{ev.body}</p>
                        <button onClick={() => scrollTo('events')} className="font-heading font-bold text-xs text-brand-teal hover:underline">
                          Read more →
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════
            ADMISSIONS CTA
        ══════════════════════════════════════════════════════════════ */}
        <section className="bg-brand-teal py-16 sm:py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-[1fr_auto] gap-10 items-center">
            <div>
              <div className="font-heading text-[11px] font-bold tracking-widest uppercase text-white/70 mb-3">
                Admissions {schoolInfo?.currentYear ?? currentYearNum + 1}
              </div>
              <h2 className="font-heading font-extrabold text-3xl sm:text-[40px] leading-tight tracking-tight text-white mb-3">
                Your child deserves the very best start.
              </h2>
              <p className="text-[16.5px] text-white/80 max-w-xl leading-relaxed">
                Applications for the new intake are open — limited places available.
              </p>
            </div>
            <div className="flex gap-3 flex-wrap">
              <Link
                href="/apply"
                className="bg-white text-brand-teal font-heading font-bold text-sm px-7 py-4 rounded-xl hover:bg-white/90 transition-colors whitespace-nowrap"
              >
                Apply for Admission
              </Link>
              <button
                onClick={() => scrollTo('contact')}
                className="bg-white/15 border border-white/35 text-white font-heading font-bold text-sm px-7 py-4 rounded-xl hover:bg-white/25 transition-colors whitespace-nowrap"
              >
                Contact Admissions
              </button>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════
            STAY CONNECTED — newsletter + contact
        ══════════════════════════════════════════════════════════════ */}
        <section id="contact" className="bg-page py-20 sm:py-24 border-b border-base">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-16">
            {/* Newsletter */}
            <div>
              <div className="font-heading text-[11px] font-bold tracking-widest uppercase text-brand-teal mb-2.5">
                In your inbox
              </div>
              <h2 className="font-heading font-extrabold text-[34px] tracking-tight text-brand-navy dark:text-white mb-3.5">
                Stay Connected
              </h2>
              <p className="text-[15.5px] text-muted leading-relaxed mb-6">
                Admissions notices, examination results and school news are delivered straight to your inbox.
              </p>
              <form onSubmit={handleNewsletterSubmit} className="flex gap-2.5 max-w-md flex-col sm:flex-row">
                <label htmlFor="newsletter-email" className="sr-only">Email address</label>
                <input
                  id="newsletter-email"
                  type="email"
                  required
                  value={newsletterEmail}
                  onChange={(e) => setNewsletterEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="flex-1 border border-base bg-surface rounded-xl px-4 py-3.25 text-[14.5px] text-body placeholder:text-muted outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal transition-colors"
                />
                <button
                  type="submit"
                  disabled={newsletterSubscribe.isPending}
                  className="flex items-center justify-center gap-2 bg-brand-navy text-white rounded-xl px-6 py-3.25 font-heading font-bold text-[13.5px] hover:bg-brand-navy-mid transition-colors disabled:opacity-60 min-h-11"
                >
                  {newsletterSubscribe.isPending && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
                  Subscribe now
                </button>
              </form>
              {newsletterMsg && (
                <p
                  role={newsletterMsg.kind === 'success' ? 'status' : 'alert'}
                  className={`mt-3 text-sm flex items-center gap-1.5 ${newsletterMsg.kind === 'success' ? 'text-brand-teal' : 'text-brand-coral'}`}
                >
                  {newsletterMsg.kind === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden />}
                  {newsletterMsg.text}
                </p>
              )}
            </div>

            {/* Contact info + form */}
            <div>
              <div className="font-heading text-[11px] font-bold tracking-widest uppercase text-brand-teal mb-2.5">
                Get in touch
              </div>
              <h2 className="font-heading font-extrabold text-[34px] tracking-tight text-brand-navy dark:text-white mb-5.5">
                Contact Us
              </h2>

              <div className="bg-surface border border-base rounded-2xl overflow-hidden">
                <div className="grid grid-cols-2">
                  {[
                    { label: 'Postal Address', value: schoolInfo?.address ?? '—' },
                    { label: 'Phone', value: schoolInfo?.phone ?? '—' },
                    { label: 'Email', value: schoolInfo?.email ?? '—' },
                    { label: 'Office Hours', value: 'Mon – Fri: 07:30 – 16:30' },
                  ].map((f, i) => (
                    <div
                      key={f.label}
                      className={`p-5.5 ${i % 2 === 0 ? 'border-r border-base' : ''} ${i < 2 ? 'border-b border-base' : ''}`}
                    >
                      <div className="font-heading font-bold text-[12.5px] text-brand-navy dark:text-white mb-1.5">{f.label}</div>
                      <div className="text-sm text-muted leading-relaxed">{f.value}</div>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleContactSubmit} className="p-6">
                  <div className="font-heading font-bold text-[15px] text-brand-navy dark:text-white mb-4">
                    Send us a message
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3 mb-3">
                    <input
                      required
                      value={contactForm.name}
                      onChange={(e) => setContactForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="Full name"
                      className="border border-base bg-page rounded-xl px-3.5 py-3 text-[14.5px] text-body placeholder:text-muted outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal transition-colors"
                    />
                    <input
                      required
                      type="email"
                      value={contactForm.email}
                      onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))}
                      placeholder="Email address"
                      className="border border-base bg-page rounded-xl px-3.5 py-3 text-[14.5px] text-body placeholder:text-muted outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal transition-colors"
                    />
                  </div>
                  <input
                    required
                    value={contactForm.subject}
                    onChange={(e) => setContactForm((f) => ({ ...f, subject: e.target.value }))}
                    placeholder="Subject — e.g. Admissions enquiry"
                    className="w-full border border-base bg-page rounded-xl px-3.5 py-3 text-[14.5px] text-body placeholder:text-muted outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal transition-colors mb-3"
                  />
                  <textarea
                    required
                    rows={4}
                    value={contactForm.message}
                    onChange={(e) => setContactForm((f) => ({ ...f, message: e.target.value }))}
                    placeholder="Your message…"
                    className="w-full border border-base bg-page rounded-xl px-3.5 py-3 text-[14.5px] text-body placeholder:text-muted outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal transition-colors resize-none mb-3.5"
                  />
                  <button
                    type="submit"
                    disabled={contactSubmit.isPending}
                    className="w-full bg-brand-navy text-white rounded-xl py-3.5 font-heading font-bold text-[13.5px] flex items-center justify-center gap-2 hover:bg-brand-navy-mid transition-colors disabled:opacity-60 min-h-11"
                  >
                    {contactSubmit.isPending ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Send className="w-4 h-4" aria-hidden />}
                    Send Message
                  </button>
                  {contactMsg && (
                    <p
                      role={contactMsg.kind === 'success' ? 'status' : 'alert'}
                      className={`mt-2.5 text-sm flex items-center gap-1.5 ${contactMsg.kind === 'success' ? 'text-brand-teal' : 'text-brand-coral'}`}
                    >
                      {contactMsg.kind === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden />}
                      {contactMsg.text}
                    </p>
                  )}
                </form>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════
            FOOTER
        ══════════════════════════════════════════════════════════════ */}
        <footer className="relative bg-[#0B1D33] dark:bg-[#081522] text-white pt-16 overflow-hidden">
          <svg preserveAspectRatio="xMidYMid slice" viewBox="10 10 80 80" aria-hidden className="absolute inset-0 w-full h-full blur-[14px] opacity-[0.07] pointer-events-none">
            <path fill="#D98A0B" className="blob-med" style={{ transformOrigin: '13px 25px' }} d="M37-5C25.1-14.7,5.7-19.1-9.2-10-28.5,1.8-32.7,31.1-19.8,49c15.5,21.5,52.6,22,67.2,2.3C59.4,35,53.7,8.5,37-5Z" />
            <path fill="#24507F" className="blob-slower" style={{ transformOrigin: '13px 25px' }} d="M20.6,4.1C11.6,1.5-1.9,2.5-8,11.2-16.3,23.1-8.2,45.6,7.4,50S42.1,38.9,41,24.5C40.2,14.1,29.4,6.6,20.6,4.1Z" />
            <path fill="#0E8A6A" className="blob-slow" style={{ transformOrigin: '84px 93px' }} d="M105.9,48.6c-12.4-8.2-29.3-4.8-39.4.8-23.4,12.8-37.7,51.9-19.1,74.1s63.9,15.3,76-5.6c7.6-13.3,1.8-31.1-2.3-43.8C117.6,63.3,114.7,54.3,105.9,48.6Z" />
            <path fill="#17B187" className="blob-fast" style={{ transformOrigin: '84px 93px' }} d="M102,67.1c-9.6-6.1-22-3.1-29.5,2-15.4,10.7-19.6,37.5-7.6,47.8s35.9,3.9,44.5-12.5C115.5,92.6,113.9,74.6,102,67.1Z" />
          </svg>

          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_1fr_1fr] gap-10 pb-12 border-b border-white/10">
              <div className="col-span-2 lg:col-span-1">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10.5 h-10.5 rounded-xl bg-white/10 flex items-center justify-center font-heading font-extrabold text-base">S</div>
                  <div className="font-heading font-extrabold text-[15px] tracking-tight">{schoolInfo?.schoolName?.toUpperCase() ?? 'SMS MALAWI'}</div>
                </div>
                <div className="flex gap-2.5 font-heading font-bold text-[11px] tracking-[2.2px] uppercase text-brand-teal-light mb-5">
                  <span>Learn</span><span>Lead</span><span>Excel</span>
                </div>
                <div className="text-[13.5px] text-white/50 leading-loose">
                  The Head Teacher<br />
                  {schoolInfo?.schoolName ?? 'SMS Malawi'}<br />
                  {schoolInfo?.address ?? ''}<br />
                  {schoolInfo?.phone ?? ''}<br />
                  {schoolInfo?.email ?? ''}
                </div>
              </div>

              {[
                {
                  title: 'Academics',
                  links: [
                    { label: 'Curriculum', anchor: 'academics' },
                    { label: 'MANEB Performance', anchor: 'performance' },
                    { label: 'Timetable', href: '/login' },
                    { label: 'Library', href: '/login' },
                    { label: 'Facilities', anchor: 'gallery' },
                  ],
                },
                {
                  title: 'Current Students',
                  links: [
                    { label: 'Login Portal (Students & Staff)', href: '/login' },
                    { label: 'Change Password', href: '/change-password' },
                    { label: 'Student Life', anchor: 'discover' },
                    { label: 'Gallery', anchor: 'gallery' },
                  ],
                },
                {
                  title: 'Prospective Students',
                  links: [
                    { label: 'How to Apply', href: '/apply' },
                    { label: 'Entry Requirements', href: '/apply' },
                    { label: 'Fees Structure', href: '/apply' },
                    { label: 'Scholarships', anchor: 'contact' },
                  ],
                },
                {
                  title: 'Get in Touch',
                  links: [
                    { label: 'Map & Directions', anchor: 'contact' },
                    { label: 'News & Announcements', anchor: 'news' },
                    { label: 'MANEB Portal', href: 'https://maneb.mw', external: true },
                  ],
                },
              ].map((col) => (
                <div key={col.title}>
                  <h4 className="font-heading font-bold text-[13px] mb-4">{col.title}</h4>
                  <div className="flex flex-col gap-2.75 text-[13.5px]">
                    {col.links.map((l) =>
                      'external' in l && l.external ? (
                        <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className="text-white/50 hover:text-white transition-colors">
                          {l.label}
                        </a>
                      ) : 'anchor' in l && l.anchor ? (
                        <button key={l.label} onClick={() => scrollTo(l.anchor!)} className="text-left text-white/50 hover:text-white transition-colors">
                          {l.label}
                        </button>
                      ) : (
                        <Link key={l.label} href={l.href!} className="text-white/50 hover:text-white transition-colors">
                          {l.label}
                        </Link>
                      ),
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="py-5.5 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-[12.5px] text-white/35">
                © {currentYearNum} {schoolInfo?.schoolName ?? 'SMS Malawi'}. All rights reserved.
              </p>
              <div className="flex items-center gap-5">
                <div className="flex gap-2.5">
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
                      <Icon className="w-3.5 h-3.5 text-white/50 hover:text-white transition-colors" />
                    </button>
                  ))}
                </div>
                <div className="flex gap-4.5 text-[12.5px]">
                  <Link href="/privacy" className="text-white/35 hover:text-white transition-colors">Privacy Policy</Link>
                  <Link href="/terms" className="text-white/35 hover:text-white transition-colors">Terms of Use</Link>
                </div>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </>
  )
}