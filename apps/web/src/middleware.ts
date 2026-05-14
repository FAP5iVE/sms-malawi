import { NextRequest, NextResponse } from 'next/server'

/*
  We store a lightweight "session" cookie when the user logs in.
  The cookie holds the Firebase UID — we only use it to decide
  whether to show the route or redirect. The actual role/permission
  check happens server-side in Cloud Functions (JWT custom claims).
  Never trust a cookie for permissions — only for routing.
*/

const AUTH_COOKIE = 'sms_session'

// Routes that require authentication
const PROTECTED_PATHS = [
  '/dashboard',
  '/students',
  '/staff',
  '/classes',
  '/finances',
  '/exams',
  '/library',
  '/hr',
  '/reports',
  '/settings',
  '/user-management',
  '/announcements',
  '/calendar',
  '/timetable',
]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const session = request.cookies.get(AUTH_COOKIE)?.value

  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p))
  const isLoginPage = pathname.startsWith('/login')

  // Unauthenticated user trying to access protected route → login
  if (isProtected && !session) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('from', pathname) // preserve intended destination
    return NextResponse.redirect(url)
  }

  // Authenticated user on login page → dashboard
  if (isLoginPage && session) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  // Run middleware on all routes except static files and API routes
  matcher: ['/((?!_next/static|_next/image|favicon.ico|fonts/).*)'],
}
