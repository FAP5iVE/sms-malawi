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
 *   2. [PRODUCTION FIX, this phase] News, Announcements, Academic
 *      Advertisements, and Events are now four genuinely separate feeds —
 *      usePublicNews()/usePublicAnnouncements()/usePublicAdverts()/
 *      usePublicEvents() — each backed by its own /public/* route filtered
 *      on the server by an explicit postType tag (see
 *      server/routes/public.ts and @shared/schemas/announcement). Previously
 *      all three non-Event sections drew from one usePublicAnnouncements()
 *      feed with no postType distinction at all (announcements WITHOUT an
 *      eventDate powered the rail, News, AND Academic Advertisements as
 *      three different slices of the exact same items), and Events was only
 *      inferred from eventDate being set rather than a real tag — nothing
 *      stopped a plain announcement or news article from also carrying one.
 *      Each section's "Read more"/"See all" links now go to that section's
 *      own archive + detail pages (/news, /notices,
 *      /academic-advertisements, /events, each with a matching [id] detail
 *      route) instead of every "See all" pointing at /news.
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
 *   8. Hero background is a real campus photo (apps/web/public/images/
 *      hero-campus.webp) via next/image with `fill` + `object-cover`, which
 *      crops to fill the banner on any viewport without ever stretching or
 *      squishing the source image — safe from mobile up. The gallery/news
 *      cards below still use ImagePlaceholder, since no per-item photo
 *      assets exist for those yet.
 *   9. The header/footer "S" badge is now the real favicon.png mark
 *      (apps/web/public/favicon.png — already in the repo, was only used
 *      as a favicon before) instead of a plain letter "S" in a coloured box.
 *  10. Added a shared decorative "scribble" background — the same organic
 *      line-art language as the login page's background (ScribbleDefs +
 *      ScribbleArt below), scattered across the sections that were a single
 *      flat colour with no texture at all (Announcement Rail, Academic
 *      Advertisements, Discover, Performance, Events, Admissions CTA,
 *      Contact). Hero and Footer already had their own decorative blobs and
 *      are unchanged. Each section gets a different shape arrangement
 *      (`variant`) so it doesn't read as one stamp repeated down the page,
 *      and opacity is tuned much lower on text-dense light sections than on
 *      the solid brand-colour bands, so it never fights legibility.
 *  11. [BUG FIX] Six spots in the header (both nav-link classes, the search
 *      and theme-toggle buttons, the search-close button, and search-result
 *      rows) used `hover:bg-page` / `hover:text-body` — like `text-muted/70`
 *      on the login page, these are hand-rolled `@layer utilities` classes
 *      (not Tailwind `@theme` tokens), so `hover:` never compiled for them;
 *      confirmed absent from the compiled CSS output before this fix. Now
 *      `hover:bg-background` / `hover:text-foreground` — the token-backed
 *      equivalents of the same two colours — which do support variants.
 *      These hover states had never actually worked; unrelated to this
 *      change's stated purpose, but caught while re-verifying the file.

 * [DEPENDS ON]: apps/web/src/hooks/usePublic.ts, next-themes
 */

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { useHasMounted } from '@/hooks/useHasMounted'
import { FaFacebook, FaTwitter, FaInstagram, FaYoutube, FaLinkedin } from 'react-icons/fa'
import {
  Sun, Moon, Monitor, Search, ArrowRight, Menu, X,
  ExternalLink, Send, Loader2, CheckCircle2,
  ImageIcon, Target, Compass, Sparkles, CalendarDays, LogIn,
} from 'lucide-react'
import {
  usePublicSchoolInfo,
  usePublicManebStats,
  usePublicPlacementStats,
  usePublicAnnouncements,
  usePublicNews,
  usePublicAdverts,
  usePublicEvents,
  usePublicGallery,
  useNewsletterSubscribe,
  useContactForm,
} from '@/hooks/usePublic'

// ─────────────────────────────────────────────────────────────────────────────
// SHARED HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Placeholder for a section that would show a real per-item photo once
 *  those assets exist — used for gallery/news/event cards. The hero banner
 *  now has a real photo (see file header note 8); these per-item images
 *  still don't exist anywhere in the project. */
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

/** Gradient defs shared by every <ScribbleArt> instance on this page — SVG
 *  gradient ids are addressable anywhere in the document, so this renders
 *  once (0×0, visually hidden) and every scribble below just references
 *  these by url(#id) instead of redeclaring the same five gradients per
 *  section. Colours are the project's real brand-* tokens via CSS var(),
 *  the same approach the login page's background art uses, so both
 *  surfaces draw from one accurate source of truth for the palette. */
function ScribbleDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden>
      <defs>
        <linearGradient id="scribbleTeal" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--color-brand-teal-light)" />
          <stop offset="100%" stopColor="var(--color-brand-teal)" />
        </linearGradient>
        <linearGradient id="scribbleCoral" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--color-brand-coral)" />
          <stop offset="100%" stopColor="var(--color-brand-amber)" />
        </linearGradient>
        <linearGradient id="scribbleNavy" x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stopColor="var(--color-brand-navy-light)" />
          <stop offset="55%" stopColor="var(--color-brand-navy-mid)" />
          <stop offset="100%" stopColor="var(--color-brand-navy)" />
        </linearGradient>
        <linearGradient id="scribblePurple" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--color-brand-purple)" />
          <stop offset="100%" stopColor="var(--color-brand-navy-mid)" />
        </linearGradient>
        <linearGradient id="scribbleAmber" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--color-brand-amber)" />
          <stop offset="100%" stopColor="var(--color-brand-coral)" />
        </linearGradient>
      </defs>
    </svg>
  )
}

/** Decorative organic line-art — same visual language as the login page's
 *  background scribbles, scattered across this page's plain flat-colour
 *  sections. `variant` picks one of five different shape arrangements so
 *  the same motif doesn't repeat identically down the page (mirrors how
 *  the login page scatters its own shapes rather than tiling one). Always
 *  render this as an absolutely-positioned sibling BEFORE a section's real
 *  content, with the content wrapper given `relative z-10` and the
 *  section itself `relative overflow-hidden`, so it never intercepts
 *  clicks or clips real content. */
function ScribbleArt({ variant, className = '' }: { variant: 1 | 2 | 3 | 4 | 5; className?: string }) {
  const layouts: Record<1 | 2 | 3 | 4 | 5, React.ReactNode> = {
    1: (
      <>
        <circle cx="90" cy="70" r="42" stroke="url(#scribbleTeal)" strokeWidth="15" fill="none" />
        <path d="M 850 50 C 900 32 958 54 968 104 C 978 154 928 186 878 176" stroke="url(#scribbleCoral)" strokeWidth="17" strokeLinecap="round" fill="none" />
        <path d="M 55 250 L 96 250 C 108 250 114 256 114 268 L 114 286 C 114 298 108 304 96 304 L 55 304" stroke="url(#scribbleNavy)" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </>
    ),
    2: (
      <>
        <path d="M 918 36 C 958 56 968 106 928 126 C 888 146 848 116 858 76 C 866 44 898 26 928 36" stroke="url(#scribblePurple)" strokeWidth="15" fill="none" />
        <circle cx="66" cy="222" r="32" stroke="url(#scribbleAmber)" strokeWidth="13" fill="none" />
        <path d="M 495 26 C 535 16 575 41 570 81 C 565 116 520 131 490 111" stroke="url(#scribbleTeal)" strokeWidth="14" strokeLinecap="round" fill="none" />
      </>
    ),
    3: (
      <>
        <path d="M 78 36 C 38 56 28 106 68 126 C 108 146 148 116 138 76 C 130 44 98 26 68 36" stroke="url(#scribbleCoral)" strokeWidth="15" fill="none" />
        <circle cx="928" cy="240" r="38" stroke="url(#scribbleNavy)" strokeWidth="14" fill="none" />
        <path d="M 545 244 C 585 254 596 294 561 309 C 526 324 491 299 501 269" stroke="url(#scribblePurple)" strokeWidth="13" strokeLinecap="round" fill="none" />
      </>
    ),
    4: (
      <>
        <path d="M 898 192 C 938 212 943 257 903 272 C 863 287 833 257 848 222" stroke="url(#scribbleAmber)" strokeWidth="15" strokeLinecap="round" fill="none" />
        <circle cx="58" cy="54" r="28" stroke="url(#scribbleTeal)" strokeWidth="12" fill="none" />
        <path d="M 475 252 L 515 252 C 527 252 533 258 533 270 L 533 280 C 533 292 527 298 515 298 L 475 298" stroke="url(#scribbleNavy)" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </>
    ),
    5: (
      <>
        <circle cx="500" cy="44" r="34" stroke="url(#scribbleCoral)" strokeWidth="14" fill="none" />
        <path d="M 56 192 C 16 212 11 257 51 272 C 91 287 126 257 111 222" stroke="url(#scribbleTeal)" strokeWidth="15" fill="none" />
        <path d="M 918 54 C 958 69 963 109 928 124 C 893 139 863 114 873 84" stroke="url(#scribbleAmber)" strokeWidth="13" strokeLinecap="round" fill="none" />
      </>
    ),
  }
  return (
    <svg
      className={`absolute inset-0 w-full h-full pointer-events-none ${className}`}
      viewBox="0 0 1000 340"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      {layouts[variant]}
    </svg>
  )
}

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
  // [PRODUCTION FIX] Four genuinely separate feeds now, each postType-
  // filtered server-side (see public.ts) — previously all four sections
  // below shared one usePublicAnnouncements() call and were sliced apart
  // client-side with no real distinction between them.
  const { data: announcementsPage, isLoading: announcementsLoading } = usePublicAnnouncements(2)
  const { data: newsPage,          isLoading: newsLoading }          = usePublicNews(4)
  const { data: advertsPage,       isLoading: advertsLoading }       = usePublicAdverts(4)
  const { data: eventsPage,        isLoading: eventsLoading }        = usePublicEvents(3)
  const { data: galleryPage, isLoading: galleryLoading } = usePublicGallery(5)
  const galleryPhotos = galleryPage?.photos ?? []

  const currentYearNum = new Date().getFullYear()
  const yearsOfExcellence = schoolInfo ? currentYearNum - schoolInfo.founded : null

  const railItems  = announcementsPage?.announcements ?? []
  const newsItems  = newsPage?.news ?? []
  const adItems     = advertsPage?.adverts ?? []
  const eventItems = eventsPage?.events ?? []

  // [PRODUCTION FIX 2026-07-28] Search previously only matched announcements
  // — the new static pages (Academics, Admissions, Student Life, Leadership,
  // Gallery) were invisible to it. There's still no real search backend
  // (see the header flyout's comment), so this stays a client-side filter,
  // just widened to a static index of every real page/section that exists
  // on the site, searched alongside the live announcements.
  const SEARCHABLE_PAGES = [
    { title: 'Academics — Curriculum', href: '/academics#curriculum', keywords: 'academics curriculum subjects JCE MSCE form syllabus' },
    { title: 'Academics — MANEB Standards', href: '/academics', keywords: 'maneb standards grading exam board' },
    { title: 'Academics — Facilities', href: '/academics#facilities', keywords: 'facilities laboratory library computer classroom' },
    { title: 'Admissions — How to Apply', href: '/admissions#how-to-apply', keywords: 'apply admission enrol enrolment steps' },
    { title: 'Admissions — Entry Requirements', href: '/admissions#entry-requirements', keywords: 'entry requirements pslce jce transcript' },
    { title: 'Admissions — Fees Structure', href: '/admissions#fees', keywords: 'fees tuition boarding cost pay price' },
    { title: 'Admissions — Scholarships', href: '/admissions#scholarships', keywords: 'scholarship bursary financial aid' },
    { title: 'Student Life — Clubs & Societies', href: '/student-life', keywords: 'clubs societies innovation debate drama choir' },
    { title: 'Student Life — Wellness & Support', href: '/student-life', keywords: 'wellness support pastoral care wellbeing' },
    { title: 'Student Life — Sports', href: '/student-life', keywords: 'sport football netball athletics extracurricular' },
    { title: 'Student Life — Boarding', href: '/student-life', keywords: 'boarding dormitory residential accommodation' },
    { title: 'School Leadership', href: '/leadership', keywords: 'leadership head teacher management board' },
    { title: 'School Gallery', href: '/gallery', keywords: 'gallery photos pictures images' },
    { title: 'Performance & MANEB Results', href: '/#performance', keywords: 'performance results pass rate msce jce placement university' },
    { title: 'Contact & Location', href: '/#contact', keywords: 'contact phone email address map directions' },
  ]

  const searchResults = searchQuery.trim().length >= 2
    ? [
        // [PRODUCTION FIX] Now searches across all four real, separate
        // feeds (previously one combined announcements array with the
        // News/Event distinction merely inferred from eventDate) and links
        // straight to each item's own detail page rather than just its
        // section root.
        ...railItems
          .filter((a) => `${a.title} ${a.body}`.toLowerCase().includes(searchQuery.toLowerCase()))
          .map((a) => ({ kind: 'announcement' as const, title: a.title, href: `/notices/${a.id}`, tag: 'Announcement' })),
        ...newsItems
          .filter((a) => `${a.title} ${a.body}`.toLowerCase().includes(searchQuery.toLowerCase()))
          .map((a) => ({ kind: 'announcement' as const, title: a.title, href: `/news/${a.id}`, tag: 'News' })),
        ...adItems
          .filter((a) => `${a.title} ${a.body}`.toLowerCase().includes(searchQuery.toLowerCase()))
          .map((a) => ({ kind: 'announcement' as const, title: a.title, href: `/academic-advertisements/${a.id}`, tag: 'Advertisement' })),
        ...eventItems
          .filter((a) => `${a.title} ${a.body}`.toLowerCase().includes(searchQuery.toLowerCase()))
          .map((a) => ({ kind: 'announcement' as const, title: a.title, href: `/events/${a.id}`, tag: 'Event' })),
        ...SEARCHABLE_PAGES
          .filter((p) => `${p.title} ${p.keywords}`.toLowerCase().includes(searchQuery.toLowerCase()))
          .map((p) => ({ kind: 'page' as const, title: p.title, href: p.href, tag: 'Page' })),
      ].slice(0, 8)
    : []

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
    { label: 'Placements', href: '/placement-results' },
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
        <ScribbleDefs />
        {/* ══════════════════════════════════════════════════════════════
            HEADER — fixed, transparent over hero, solid once scrolled
        ══════════════════════════════════════════════════════════════ */}
        <header
          ref={headerRef}
          className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b ${
            scrolled
              ? 'bg-surface border-base shadow-md'
              : 'bg-transparent border-white/15'
          }`}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-[72px] flex items-center gap-6">
            <button onClick={() => scrollTo('top')} className="flex items-center gap-3 shrink-0">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center p-1.5 transition-colors ${
                  scrolled ? 'bg-brand-navy' : 'bg-white/15'
                }`}
              >
                <Image src="/favicon.png" alt="" width={40} height={40} className="w-full h-full object-contain" />
              </div>
              <div className="text-left leading-tight hidden sm:block">
                <div className={`font-heading font-extrabold text-sm tracking-tight transition-colors ${scrolled ? 'text-brand-navy dark:text-white' : 'text-white'}`}>
                  {schoolInfo?.schoolName?.toUpperCase() ?? 'SMS MALAWI'}
                </div>
                <div className={`text-[11px] tracking-wide transition-colors ${scrolled ? 'text-muted' : 'text-white/60'}`}>
                  {schoolInfo?.systemTagline ?? 'Secondary School Management System'}
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
                      scrolled ? 'text-foreground hover:bg-background' : 'text-white/85 hover:bg-white/10'
                    }`}
                  >
                    {l.label}
                  </button>
                ) : (
                  <Link
                    key={l.label}
                    href={l.href}
                    className={`nav-link-underline px-2.5 py-2 rounded-lg transition-colors ${
                      scrolled ? 'text-foreground hover:bg-background' : 'text-white/85 hover:bg-white/10'
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
                  scrolled ? 'border-base text-foreground hover:bg-background' : 'border-white/25 text-white hover:bg-white/10'
                }`}
              >
                <Search className="w-4 h-4" />
              </button>
              <button
                onClick={cycleTheme}
                aria-label={mounted ? `Theme: ${theme}. Click to change.` : 'Toggle theme'}
                className={`w-9 h-9 rounded-lg border flex items-center justify-center transition-colors ${
                  scrolled ? 'border-base text-foreground hover:bg-background' : 'border-white/25 text-white hover:bg-white/10'
                }`}
              >
                {mounted ? themeIcons[theme ?? 'system'] : <Monitor className="w-4 h-4" aria-hidden />}
              </button>
              <Link
                href="/login"
                aria-label="Login Portal"
                className={`sm:hidden w-9 h-9 rounded-lg border flex items-center justify-center transition-colors ${
                  scrolled ? 'border-base text-body hover:bg-page' : 'border-white/25 text-white hover:bg-white/10'
                }`}
              >
                <LogIn className="w-4 h-4" />
              </Link>
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

          {/* Search flyout — [PRODUCTION FIX 2026-07-28] real client-side
              filter over the already-fetched announcements (title/body
              substring match). There is no search backend anywhere in the
              system (no Algolia wiring, no full-text endpoint) for public
              content, so this is scoped to what's actually loaded rather
              than either a decorative no-op or new backend infrastructure. */}
          {searchOpen && (
            <div className="border-t border-base bg-surface">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
                <div className="flex items-center gap-3">
                  <Search className="w-4.5 h-4.5 text-muted shrink-0" aria-hidden />
                  <input
                    autoFocus
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search announcements, results, programmes…"
                    className="flex-1 bg-transparent outline-none text-base text-body placeholder:text-muted"
                  />
                  <button
                    onClick={() => { setSearchOpen(false); setSearchQuery('') }}
                    aria-label="Close search"
                    className="w-8 h-8 rounded-lg bg-page text-muted hover:text-foreground flex items-center justify-center shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                {searchQuery.trim().length >= 2 && (
                  <div className="mt-4 border-t border-base pt-4">
                    {searchResults.length === 0 ? (
                      <p className="text-sm text-muted">Nothing matches &quot;{searchQuery}&quot;.</p>
                    ) : (
                      <div className="space-y-1">
                        {searchResults.map((r) => (
                          <Link
                            key={`${r.kind}-${r.title}`}
                            href={r.href}
                            onClick={() => { setSearchOpen(false); setSearchQuery('') }}
                            className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-background transition-colors flex items-center justify-between gap-4"
                          >
                            <span className="text-sm font-heading font-semibold text-body line-clamp-1">{r.title}</span>
                            <span className="text-xs text-muted shrink-0">{r.tag}</span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )}
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
                      { label: 'Curriculum & Subjects', href: '/academics#curriculum' },
                      { label: 'MANEB Performance', anchor: 'performance' },
                      { label: 'Timetable', href: '/login' },
                      { label: 'Library', href: '/login' },
                    ],
                  },
                  {
                    title: 'Admissions',
                    links: [
                      { label: 'How to Apply', href: '/admissions#how-to-apply' },
                      { label: 'Entry Requirements', href: '/admissions#entry-requirements' },
                      { label: 'Fees Structure', href: '/admissions#fees' },
                      { label: 'Scholarships', href: '/admissions#scholarships' },
                    ],
                  },
                  {
                    title: 'Current Students',
                    links: [
                      { label: 'Login Portal (Students & Staff)', href: '/login' },
                      { label: 'Student Life', href: '/student-life' },
                      { label: 'Facilities', href: '/academics#facilities' },
                      { label: 'Gallery', href: '/gallery' },
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
          <Image
            src="/images/hero-campus.webp"
            alt={`${schoolInfo?.schoolName ?? 'School'} campus entrance`}
            fill
            priority
            sizes="100vw"
            className="object-cover object-center"
          />
          <div className="absolute inset-0 bg-linear-to-b from-[rgba(11,29,51,.55)] via-[rgba(11,29,51,.72)] to-[rgba(11,29,51,.96)]" />

          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-[180px] w-full">
            <div className="max-w-3xl fade-up">
              <h1 className="font-heading font-extrabold text-white leading-[1.04] tracking-tight text-5xl md:text-6xl lg:text-7xl mb-4">
                Welcome to {schoolInfo?.schoolName ?? 'Malawi Scondary School'}
              </h1>
              <p className="font-heading font-semibold text-xl text-white/80 mb-1.5">
                {schoolInfo?.systemTagline ?? 'Secondary School Management System'}
              </p>
              <p className="text-lg text-white/55 max-w-xl leading-relaxed mb-8">
                {schoolInfo?.heroSubtitle ?? 'Excellence in Education — from Form 1 through MSCE.'}
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
            ANNOUNCEMENT RAIL — id="announcements", latest 2 general
            announcements (postType ANNOUNCEMENT — its own feed, see
            usePublicAnnouncements above)
        ══════════════════════════════════════════════════════════════ */}
        <section id="announcements" className="relative overflow-hidden bg-brand-navy">
          <ScribbleArt variant={1} className="opacity-[0.16]" />
          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-7 grid md:grid-cols-[200px_1fr] gap-8 items-center">
            <div>
              <div className="font-heading text-[11px] font-bold tracking-widest uppercase text-brand-teal-light mb-1.5">
                Announcements
              </div>
              <Link href="/notices" className="text-[13px] text-white/50 hover:text-white transition-colors">
                View all →
              </Link>
            </div>
            <div className="grid sm:grid-cols-2 gap-5">
              {announcementsLoading ? (
                <>
                  <div className="h-20 bg-white/5 rounded-lg animate-pulse" />
                  <div className="h-20 bg-white/5 rounded-lg animate-pulse" />
                </>
              ) : railItems.length === 0 ? (
                <p className="text-sm text-white/40 sm:col-span-2">No announcements yet — check back soon.</p>
              ) : (
                railItems.map((a) => (
                  <Link href={`/notices/${a.id}`} key={a.id} className="border-l-2 border-brand-teal-light/55 pl-4.5 block group">
                    <h4 className="font-heading font-bold text-[15px] text-white mb-1.5 leading-snug line-clamp-2 group-hover:underline">
                      {a.title}
                    </h4>
                    <p className="text-[13.5px] text-white/50 mb-2 leading-relaxed line-clamp-2">{a.body}</p>
                    <span className="font-mono text-[11px] text-white/35">{formatRelativeDate(a.createdAt)}</span>
                  </Link>
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
              <Link
                href="/news"
                className="inline-flex items-center gap-2 border border-base text-body px-4.5 py-2.5 rounded-full font-heading font-bold text-[13px] hover:border-brand-teal hover:text-brand-teal transition-colors"
              >
                All News →
              </Link>
            </div>

            {newsLoading ? (
              <div className="grid lg:grid-cols-2 gap-10" role="status" aria-label="Loading news">
                <div className="h-96 bg-page rounded-2xl animate-pulse" />
                <div className="space-y-5">
                  {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-page rounded-xl animate-pulse" />)}
                </div>
              </div>
            ) : newsItems.length === 0 ? (
              <div className="text-center py-14 text-muted text-sm">No news articles have been published yet — check back soon.</div>
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
                  <Link href={`/news/${newsItems[0]!.id}`} className="font-heading font-bold text-[13.5px] text-brand-teal hover:underline">
                    Read more →
                  </Link>
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
                        <Link href={`/news/${a.id}`} className="font-heading font-bold text-xs text-brand-teal hover:underline">
                          Read more →
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════
            ACADEMIC ADVERTISEMENTS — id="ads"
            [PRODUCTION FIX] Now a genuinely standalone section: its own
            postType (ADVERTISEMENT), its own /public/academic-advertisements
            feed, its own archive + detail pages — previously this was just
            another slice of the same feed as News, and every link here
            (section "See all" and every item) pointed at /news.
        ══════════════════════════════════════════════════════════════ */}
        <section id="ads" className="relative overflow-hidden bg-page py-16 sm:py-18 border-y border-base">
          <ScribbleArt variant={2} className="opacity-[0.08] dark:opacity-[0.14]" />
          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-[300px_1fr] gap-12">
            <div>
              <h2 className="font-heading font-extrabold text-2xl sm:text-[28px] tracking-tight text-brand-navy dark:text-white mb-3 leading-tight">
                Academic Advertisements
              </h2>
              <p className="text-[14.5px] text-muted leading-relaxed mb-5">
                Calls for applications, intake notices and examination circulars, published as they are issued.
              </p>
              <Link
                href="/academic-advertisements"
                className="inline-flex items-center gap-2 border border-base bg-surface text-body px-4.5 py-2.5 rounded-full font-heading font-bold text-[13px] hover:border-brand-teal hover:text-brand-teal transition-colors"
              >
                All Advertisements →
              </Link>
            </div>
            <div className="flex flex-col">
              {advertsLoading ? (
                <div className="space-y-5 py-2" role="status" aria-label="Loading advertisements">
                  {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-surface rounded-lg animate-pulse" />)}
                </div>
              ) : adItems.length === 0 ? (
                <p className="text-sm text-muted py-5">No circulars published yet.</p>
              ) : (
                adItems.map((a, i) => (
                  <Link
                    key={a.id}
                    href={`/academic-advertisements/${a.id}`}
                    className={`flex items-baseline justify-between gap-6 py-5 text-left text-body hover:text-brand-teal transition-colors ${i < adItems.length - 1 ? 'border-b border-base' : ''}`}
                  >
                    <span className="font-heading font-semibold text-base sm:text-[16.5px] leading-snug">{a.title}</span>
                    <span className="font-mono text-[11.5px] text-muted whitespace-nowrap shrink-0">{formatRelativeDate(a.createdAt)}</span>
                  </Link>
                ))
              )}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════
            DISCOVER — id="about"
        ══════════════════════════════════════════════════════════════ */}
        <section id="about" className="relative overflow-hidden bg-surface py-20 sm:py-24">
          <ScribbleArt variant={3} className="opacity-[0.08] dark:opacity-[0.14]" />
          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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
                { title: 'Leadership', desc: 'A head teacher and board committed to transparent, forward-thinking school governance.', href: '/leadership', tint: 'from-brand-navy-light/40 to-brand-navy' },
                { title: 'Academics', desc: 'A rigorous curriculum aligned to MANEB standards for both JCE and MSCE candidates.', href: '/academics', tint: 'from-brand-teal/70 to-brand-navy' },
                { title: 'Student Life', desc: 'Sport, drama, choir, debate and community service alongside a full boarding programme.', href: '/student-life', tint: 'from-brand-purple/70 to-brand-navy' },
                { title: 'Admissions', desc: 'Everything a prospective family needs — entry requirements, fees and application steps.', href: '/admissions', tint: 'from-brand-amber/70 to-brand-navy' },
              ].map((card) => (
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
              ))}
            </div>

            {/* Mission, Vision & Core Values — real Settings-backed fields.
                [PRODUCTION FIX 2026-07-28] Merged into a single flat card
                (was three separate cards); core values render as a plain
                list, not pills. */}
            {(schoolInfo?.mission || schoolInfo?.vision || (schoolInfo?.coreValues?.length ?? 0) > 0) && (
              <div className="mt-14 bg-page border border-base rounded-2xl p-8 sm:p-10 grid sm:grid-cols-2 gap-8">
                {schoolInfo?.mission && (
                  <div>
                    <div className="flex items-center gap-2.5 mb-3">
                      <Target className="w-5 h-5 text-brand-teal shrink-0" />
                      <h4 className="font-heading font-bold text-lg text-brand-teal">Our Mission</h4>
                    </div>
                    <p className="text-sm text-muted leading-relaxed">{schoolInfo.mission}</p>
                  </div>
                )}
                {schoolInfo?.vision && (
                  <div>
                    <div className="flex items-center gap-2.5 mb-3">
                      <Compass className="w-5 h-5 text-brand-purple shrink-0" />
                      <h4 className="font-heading font-bold text-lg text-brand-purple">Our Vision</h4>
                    </div>
                    <p className="text-sm text-muted leading-relaxed">{schoolInfo.vision}</p>
                  </div>
                )}
                {schoolInfo?.coreValues && schoolInfo.coreValues.length > 0 && (
                  <div className="sm:col-span-2 pt-2 border-t border-base">
                    <div className="flex items-center gap-2.5 mb-3 mt-6">
                      <Sparkles className="w-5 h-5 text-brand-amber shrink-0" />
                      <h4 className="font-heading font-bold text-lg text-brand-navy dark:text-white">Our Core Values</h4>
                    </div>
                    <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-2">
                      {schoolInfo.coreValues.map((v) => (
                        <li key={v} className="text-sm text-body flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-brand-amber shrink-0" aria-hidden />
                          {v}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* [PRODUCTION FIX 2026-07-28] Gallery strip now fetches real
                photos (usePublicGallery, GalleryPhoto table + Appwrite
                FILE_PREFIX.SCHOOL_GALLERY) instead of the permanent
                placeholder. Shows a plain "no photos yet" note if the
                gallery is empty, rather than staged filler. */}
            <div id="gallery" className="mt-12 pt-9 border-t border-base">
              <div className="flex items-baseline justify-between mb-4.5">
                <h3 className="font-heading font-bold text-xl tracking-tight text-brand-navy dark:text-white">
                  Life at our school
                </h3>
                <Link href="/gallery" className="font-heading font-bold text-[13px] text-brand-teal hover:underline">
                  View our gallery →
                </Link>
              </div>
              {galleryLoading ? (
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                  {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-32 rounded-xl bg-page animate-pulse" />)}
                </div>
              ) : galleryPhotos.length === 0 ? (
                <div className="text-center py-10 text-muted text-sm border border-base rounded-xl">
                  No photos have been added to the gallery yet.
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                  {galleryPhotos.map((p) => (
                    // eslint-disable-next-line @next/next/no-img-element -- external Appwrite view URL, not a local/remote-pattern asset
                    <img
                      key={p.id}
                      src={p.url}
                      alt={p.caption ?? p.category ?? 'School photo'}
                      className="h-32 w-full object-cover rounded-xl border border-base"
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════
            PERFORMANCE — id="academics" anchors here too (see file header)
        ══════════════════════════════════════════════════════════════ */}
        <div id="academics" />
        <section id="performance" className="relative overflow-hidden bg-brand-navy py-20 sm:py-24 text-white">
          <ScribbleArt variant={4} className="opacity-[0.16]" />
          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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
                href="https://www.maneb.edu.mw/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 border border-white/25 text-white px-5 py-2.75 rounded-full font-heading font-bold text-[13px] hover:bg-white/10 transition-colors whitespace-nowrap"
              >
                MANEB Portal <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* [PRODUCTION FIX 2026-07-28] Fixed 4-slot grid — MSCE pass
                rate / JCE pass rate / Learners enrolled / Years of
                excellence — matching the redesign exactly. Previously this
                whole section (grid + detail cards) vanished entirely
                whenever no MANEB records existed for the year, and the
                grid generically mapped over whatever exam types existed
                rather than fixed MSCE/JCE slots, silently dropping
                "Learners enrolled" for a substitute. Each slot now always
                renders its header; only the value falls back to a short
                "Data unavailable" note when that specific figure isn't
                published yet. */}
            {(() => {
              const msce = manebStats?.stats.find((s) => s.examType === 'MSCE')
              const jce  = manebStats?.stats.find((s) => s.examType === 'JCE')
              return (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/10 border border-white/10 rounded-2xl overflow-hidden mb-6">
                    {[
                      { value: msce ? `${msce.passRate}%` : null, label: 'MSCE pass rate' },
                      { value: jce ? `${jce.passRate}%` : null, label: 'JCE pass rate' },
                      { value: manebStats ? manebStats.enrolledStudents.toLocaleString() : null, label: 'Learners enrolled' },
                      { value: yearsOfExcellence != null ? `${yearsOfExcellence}+` : null, label: 'Years of excellence' },
                    ].map((s) => (
                      <div key={s.label} className="bg-brand-navy p-7">
                        {s.value != null ? (
                          <div className="font-heading font-extrabold text-[44px] leading-none tracking-tight">{s.value}</div>
                        ) : (
                          <div className="font-heading font-semibold text-sm text-white/35 h-[44px] flex items-center">Data unavailable</div>
                        )}
                        <div className="text-[13.5px] text-white/50 mt-2">{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* [PRODUCTION FIX 2026-07-28] Was three separate
                      side-by-side cards; now one unified card with MSCE,
                      JCE, and University Placement as internal rows. */}
                  <div className="bg-white/5 border border-white/10 rounded-2xl grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-white/10">
                    {[
                      { key: 'MSCE', stat: msce, rateLabel: 'Pass rate', totalLabel: 'Candidates', totalText: msce ? `${msce.passed} passed / ${msce.total} total` : null, rate: msce?.passRate, year: manebStats?.year },
                      { key: 'JCE', stat: jce, rateLabel: 'Pass rate', totalLabel: 'Candidates', totalText: jce ? `${jce.passed} passed / ${jce.total} total` : null, rate: jce?.passRate, year: manebStats?.year },
                      {
                        key: 'University Placement',
                        stat: placementStats && placementStats.qualified > 0 ? placementStats : undefined,
                        rateLabel: 'Selection rate',
                        totalLabel: 'MSCE leavers',
                        totalText: placementStats && placementStats.qualified > 0
                          ? `${placementStats.selected} selected / ${placementStats.qualified} qualified`
                          : null,
                        rate: placementStats && placementStats.qualified > 0 ? placementStats.selectionRate : undefined,
                        year: placementStats?.year,
                      },
                    ].map((card) => (
                      <div key={card.key} className="p-6">
                        <div className="flex items-center justify-between mb-4.5">
                          <h4 className="font-heading font-bold text-sm">{card.key}</h4>
                          {card.stat && (
                            <span className="font-mono text-[11.5px] text-brand-teal-light">
                              {card.year}
                            </span>
                          )}
                        </div>
                        {card.stat ? (
                          <>
                            <div className="flex justify-between text-xs mb-2">
                              <span className="text-white/50">{card.rateLabel}</span>
                              <span className="font-heading font-bold">{card.rate}%</span>
                            </div>
                            <div className="h-1.75 bg-white/10 rounded-full overflow-hidden mb-3.5">
                              <div className="h-full bg-brand-teal rounded-full" style={{ width: `${card.rate}%` }} />
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-white/50">{card.totalLabel}</span>
                              <span className="text-white/75 font-semibold">{card.totalText}</span>
                            </div>
                          </>
                        ) : (
                          <div className="py-4 text-center text-sm text-white/35">Data unavailable</div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )
            })()}
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════
            EVENTS — dated announcements
        ══════════════════════════════════════════════════════════════ */}
        <section id="events" className="relative overflow-hidden bg-surface py-20 sm:py-24">
          <ScribbleArt variant={5} className="opacity-[0.08] dark:opacity-[0.14]" />
          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-end justify-between mb-9 gap-4 flex-wrap">
              <h2 className="font-heading font-extrabold text-3xl sm:text-4xl tracking-tight text-brand-navy dark:text-white">
                Events
              </h2>
              <Link
                href="/events"
                className="inline-flex items-center gap-2 border border-base text-body px-4.5 py-2.5 rounded-full font-heading font-bold text-[13px] hover:border-brand-teal hover:text-brand-teal transition-colors"
              >
                All events →
              </Link>
            </div>

            {eventsLoading ? (
              <div className="grid md:grid-cols-3 gap-6" role="status" aria-label="Loading events">
                {[1, 2, 3].map((i) => <div key={i} className="h-64 bg-page rounded-2xl animate-pulse" />)}
              </div>
            ) : eventItems.length === 0 ? (
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
                        <Link href={`/events/${ev.id}`} className="font-heading font-bold text-xs text-brand-teal hover:underline">
                          Read more →
                        </Link>
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
        <section className="relative overflow-hidden bg-brand-teal py-16 sm:py-20">
          <ScribbleArt variant={2} className="opacity-[0.14]" />
          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-[1fr_auto] gap-10 items-center">
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
        <section id="contact" className="relative overflow-hidden bg-page py-20 sm:py-24 border-b border-base">
          <ScribbleArt variant={1} className="opacity-[0.08] dark:opacity-[0.14]" />
          {/* [PRODUCTION FIX 2026-07-28] Two columns: left = Newsletter
              with Map stacked directly below it; right = the full Contact
              Us card, same height as the left column. Confirmed against
              a hand sketch before implementing (previous attempt used
              three equal columns, which wasn't what was asked for). */}
          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-10 lg:gap-16">
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

              {/* Map — stacked directly below Newsletter in the same
                  left-hand column, per the confirmed sketch. */}
              <div className="mt-10">
                <div className="font-heading text-[11px] font-bold tracking-widest uppercase text-brand-teal mb-2.5">
                  Find us
                </div>
                <h3 className="font-heading font-extrabold text-2xl tracking-tight text-brand-navy dark:text-white mb-4">
                  Map &amp; Directions
                </h3>
                <div id="map" className="rounded-2xl overflow-hidden border border-base h-[300px] scroll-mt-24">
                  <iframe
                    title="School location on Google Maps"
                    width="100%"
                    height="100%"
                    style={{ border: 0 }}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    src={`https://www.google.com/maps?q=${encodeURIComponent(schoolInfo?.address ?? 'Blantyre, Malawi')}&output=embed`}
                  />
                </div>
              </div>
            </div>

            {/* Contact info + form */}
            <div>
              <div className="font-heading text-[11px] font-bold tracking-widest uppercase text-brand-teal mb-2.5">
                Get in touch
              </div>
              <h2 className="font-heading font-extrabold text-[34px] tracking-tight text-brand-navy dark:text-white mb-5.5">
                Contact Us
              </h2>

              {/* [PRODUCTION FIX 2026-07-28] Address/Phone/Email combined
                  into one compact box (was three separately-spaced blocks).
                  Office Hours sits beside it; Send Message now spans full
                  width below both, instead of being squeezed into the
                  Office Hours column. */}
              <div className="bg-surface border border-base rounded-2xl overflow-hidden">
                <div className="grid sm:grid-cols-2 border-b border-base">
                  <div className="p-5 border-b sm:border-b-0 sm:border-r border-base">
                    <div className="font-heading font-bold text-[11px] uppercase tracking-wider text-brand-teal mb-2">
                      Postal Address
                    </div>
                    <p className="text-sm text-body mb-3 leading-relaxed">{schoolInfo?.address ?? '—'}</p>
                    <p className="text-sm text-muted leading-snug">
                      <span className="font-semibold text-body">Phone:</span> {schoolInfo?.phone ?? '—'}
                    </p>
                    <p className="text-sm text-muted leading-snug">
                      <span className="font-semibold text-body">Email:</span> {schoolInfo?.email ?? '—'}
                    </p>
                  </div>
                  <div className="p-5">
                    <div className="font-heading font-bold text-[11px] uppercase tracking-wider text-brand-teal mb-2">
                      Office Hours
                    </div>
                    <p className="text-sm text-body">Mon – Fri: 07:30 – 16:30</p>
                  </div>
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
        <footer className="relative bg-brand-navy text-white pt-16 overflow-hidden rounded-t-[2.5rem]">
          {/* Background photo — same hero campus image + treatment as the
              HERO section above, reused here so the page's two navy
              bookends share one visual language instead of the footer
              being a flat colour. `fill` + `object-cover` + `sizes="100vw"`
              is the same responsive approach the hero uses, so this scales
              correctly on mobile without any separate breakpoint handling.
              The gradient overlay opacity is pushed higher than the hero's
              (.55/.72/.96 → .82/.90/.98) because footer text runs much
              smaller than the hero's large display type and needs more
              contrast against the photo to stay legible on every screen
              size, phones included. */}
          <Image
            src="/images/hero-campus.webp"
            alt=""
            fill
            sizes="100vw"
            className="object-cover object-center pointer-events-none select-none"
          />
          <div className="absolute inset-0 bg-linear-to-b from-[rgba(11,29,51,.82)] via-[rgba(11,29,51,.90)] to-[rgba(11,29,51,.98)]" />

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
                  <div className="w-10.5 h-10.5 rounded-xl bg-white/10 flex items-center justify-center p-2">
                    <Image src="/favicon.png" alt="" width={42} height={42} className="w-full h-full object-contain" />
                  </div>
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
                    { label: 'Curriculum', href: '/academics#curriculum' },
                    { label: 'MANEB Performance', anchor: 'performance' },
                    { label: 'Timetable', href: '/login' },
                    { label: 'Library', href: '/login' },
                    { label: 'Facilities', href: '/academics#facilities' },
                  ],
                },
                {
                  title: 'Current Students',
                  links: [
                    { label: 'Login Portal (Students & Staff)', href: '/login' },
                    { label: 'Change Password', href: '/change-password' },
                    { label: 'Student Life', href: '/student-life' },
                    { label: 'Gallery', href: '/gallery' },
                  ],
                },
                {
                  title: 'Prospective Students',
                  links: [
                    { label: 'How to Apply', href: '/admissions#how-to-apply' },
                    { label: 'Entry Requirements', href: '/admissions#entry-requirements' },
                    { label: 'Fees Structure', href: '/admissions#fees' },
                    { label: 'Scholarships', href: '/admissions#scholarships' },
                  ],
                },
                {
                  title: 'Get in Touch',
                  links: [
                    { label: 'Map & Directions', anchor: 'map' },
                    { label: 'News', href: '/news' },
                    { label: 'Announcements', href: '/notices' },
                    { label: 'Academic Advertisements', href: '/academic-advertisements' },
                    { label: 'Events', href: '/events' },
                    { label: 'MANEB Portal', href: 'https://www.maneb.edu.mw/', external: true },
                  ],
                },
              ].map((col) => (
                <div key={col.title}>
                  <h4 className="font-heading font-bold text-[13px] mb-4 text-brand-teal-light">{col.title}</h4>
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

            {/* [PRODUCTION FIX 2026-07-28] Social icons now get their own
                row (were crammed onto the same line as the copyright
                notice). The space that opens up next to Privacy/Terms
                below now credits the system builder instead. */}
            <div className="py-5 flex justify-center sm:justify-end border-b border-white/10">
              <div className="flex gap-2.5">
                {[
                  { Icon: FaFacebook, label: 'Facebook', url: schoolInfo?.social.facebook },
                  { Icon: FaTwitter, label: 'Twitter', url: schoolInfo?.social.twitter },
                  { Icon: FaInstagram, label: 'Instagram', url: schoolInfo?.social.instagram },
                  { Icon: FaYoutube, label: 'YouTube', url: schoolInfo?.social.youtube },
                  { Icon: FaLinkedin, label: 'LinkedIn', url: schoolInfo?.social.linkedin },
                ]
                  // [PRODUCTION FIX 2026-07-28] Real URLs now, editable
                  // under Settings -> School Identity. An icon with no URL
                  // set simply doesn't render, rather than being a dead
                  // decorative button.
                  .filter((s) => s.url)
                  .map(({ Icon, label, url }) => (
                    <a
                      key={label}
                      href={url!}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={label}
                      className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/15 flex items-center justify-center transition-colors"
                    >
                      <Icon className="w-3.5 h-3.5 text-white/50 hover:text-white transition-colors" />
                    </a>
                  ))}
              </div>
            </div>

            <div className="py-5.5 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-[12.5px] text-white/35">
                © {currentYearNum} {schoolInfo?.schoolName ?? 'SMS Malawi'}. All rights reserved.
              </p>
              <div className="flex items-center gap-5">
                <p className="text-[12.5px] text-white/30">The system designed by 5ive Stack Labs</p>
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