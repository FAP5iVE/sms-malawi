/**
 * apps/web/src/proxy.ts
 *
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R3 — Gateway Hardening
 * [PURPOSE]: Four independent fixes, all UX-routing-layer only (this file's
 *   own documented posture — real authorization is server-side):
 *   (1) PAGE_ROLES['/finances'] gains 'hr' — HR staff hold
 *       finance.viewOwnStatement/hr.viewOwnPayslips per PERMISSIONS_MAP.md
 *       but were locked out of the page that surfaces them.
 *   (2) PAGE_ROLES['/reports'] gains 'student' — students hold three
 *       report.viewOwn* permissions but could not reach the page.
 *   (3) PUBLIC_PATHS drops '/explore' — no route exists at this path; it
 *       was a dead entry (also the target of a dead homepage anchor per
 *       Phase 8E).
 *   (4) BYPASS_PREFIXES drops '/fonts/' and '/images/' — both are already
 *       excluded by config.matcher's own negative-lookahead pattern below;
 *       keeping them here was a harmless but confusing double-exclusion.
 * [DEPENDS ON]: none
 */
import { NextRequest, NextResponse } from 'next/server'
import type { UserRole } from '@shared/types/roles'
import { getAllowedRolesForPath } from '@shared/constants/pageAccess'

// ─── COOKIE NAMES ─────────────────────────────────────────
// These constants must stay in sync with AuthProvider.tsx
export const SESSION_COOKIE = 'sms_session' // Firebase UID — presence = logged in
export const ROLE_COOKIE = 'sms_role'       // UserRole string — for route protection

// ─── SECURITY RESPONSE HEADERS ────────────────────────────
// Applied to every non-static response.
// CSP is intentionally omitted here — configure it per-page via
// next.config.ts headers() or meta tags to avoid breaking
// inline scripts from shadcn/ui and Recharts.
const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=()',
  // HSTS — only meaningful over HTTPS; ignored by browsers on HTTP
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
}

function applySecurityHeaders(response: NextResponse): NextResponse {
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value)
  })
  return response
}

// ─── ROUTE CLASSIFICATION ─────────────────────────────────

/** Paths that are fully public — no auth, no role check. */
const PUBLIC_PATHS = [
  '/login',
  '/apply',
  '/forgot-password',
  '/change-password',
  '/privacy',
  '/terms',
  // [PRODUCTION FIX 2026-07-28] All seven of the landing-page redesign's new
  // pages were built without ever being added here — same class of bug as
  // /privacy and /terms earlier: none of them have a page-level auth check,
  // but the edge proxy defaulted every unlisted path to "requires login",
  // so every public link on the landing page (News, Events, Gallery,
  // Leadership, Academics, Student Life, Admissions) actually redirected
  // anonymous visitors to /login. This is the fix.
  '/news',
  '/events',
  '/gallery',
  '/leadership',
  '/academics',
  '/student-life',
  '/admissions',
  '/',           // landing page
] as const

/** Path prefixes that bypass proxy logic entirely (handled by Next.js). */
const BYPASS_PREFIXES = [
  '/_next/',
  '/favicon',
  '/api/',       // API routes authenticate themselves via verifyAuth.ts
] as const

/**
 * Role-to-page access map.
 * The proxy uses this for UX-level routing only — not as a security
 * boundary.  True authorisation is enforced server-side by requireRole()
 * in every API route and by Server Component role checks.
 *
 * Roles listed = roles ALLOWED to access that path prefix.
 */
// [R16] PAGE_ROLES relocated to the shared /constants/pageAccess
// PAGE_ACCESS map (imported above as getAllowedRolesForPath) so this edge
// proxy and W/config/navigation.ts consume ONE role-per-page source.

// ─── HELPERS ──────────────────────────────────────────────

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  )
}

function isBypassPath(pathname: string): boolean {
  return BYPASS_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

function buildRedirect(request: NextRequest, destination: string): NextResponse {
  const url = request.nextUrl.clone()
  url.pathname = destination
  const response = NextResponse.redirect(url)
  return applySecurityHeaders(response)
}

function buildLoginRedirect(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone()
  const from = request.nextUrl.pathname
  url.pathname = '/login'
  url.searchParams.set('from', from)
  const response = NextResponse.redirect(url)
  return applySecurityHeaders(response)
}

// ─── MAIN PROXY FUNCTION ──────────────────────────────────

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl

  // ── Layer 1: Hard bypass — static assets & API routes
  if (isBypassPath(pathname)) {
    return applySecurityHeaders(NextResponse.next())
  }

  const session = request.cookies.get(SESSION_COOKIE)?.value
  const roleRaw = request.cookies.get(ROLE_COOKIE)?.value as UserRole | undefined

  // ── Layer 2: Public paths
  if (isPublicPath(pathname)) {
    // Authenticated user visiting login → send to dashboard
    if (pathname.startsWith('/login') && session) {
      return buildRedirect(request, '/dashboard')
    }
    return applySecurityHeaders(NextResponse.next())
  }

  // ── Layer 3: Authentication gate
  // Every path that is NOT public and NOT bypassed requires a session
  if (!session) {
    return buildLoginRedirect(request)
  }

  // ── Layer 4: Role-based page access
  // If the page has a role restriction, check the sms_role cookie.
  // This is UX-level only — the API enforces real authorisation.
  const allowedRoles = getAllowedRolesForPath(pathname)

  if (allowedRoles !== null) {
    if (!roleRaw || !allowedRoles.includes(roleRaw)) {
      // Authenticated but wrong role — send to dashboard (their home)
      // Do NOT send to login (they are logged in) or a 403 page
      // (confusing UX — the API will 403 any data requests anyway).
      return buildRedirect(request, '/dashboard')
    }
  }

  // ── Layer 5: Pass through with security headers
  // Attach the verified role as a header so downstream Server Components
  // can read it without re-parsing the cookie.
  const response = NextResponse.next()
  if (roleRaw) {
    response.headers.set('x-user-role', roleRaw)
  }
  if (session) {
    response.headers.set('x-user-uid', session)
  }
  return applySecurityHeaders(response)
}

// ─── MATCHER CONFIG ───────────────────────────────────────
// Excludes Next.js internal paths and font/image assets.
// API routes ARE included so security headers are applied to all
// API responses; the api/ bypass in Layer 1 handles passthrough.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|zero-threat\\.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?|ttf|otf)).*)',
  ],
}