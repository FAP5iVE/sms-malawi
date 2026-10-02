import type { Metadata, Viewport } from 'next'
import './globals.css'
import {
  BRAND_NAVY,
  DEFAULT_OG_IMAGE,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
} from '@/lib/site'
import { Analytics }            from '@vercel/analytics/next'
import { AuthProvider }         from '@/components/providers/AuthProvider'
import { QueryProvider }        from '@/components/providers/QueryProvider'
import { ThemeProvider }        from '@/components/providers/ThemeProvider'
import { Toaster }              from '@/components/ui/sonner'

// Per-page titles and descriptions live in each route segment's layout.tsx
// (the public pages are client components and cannot export metadata
// themselves). Anything set here is the fallback.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default:  `${SITE_NAME} | ${SITE_TAGLINE}`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: `${SITE_NAME} | ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    locale: 'en_MW',
    images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630, alt: SITE_NAME }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} | ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE],
  },
  // Set NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION to the token Search Console gives
  // you (HTML tag method). Omitted entirely while unset.
  verification: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION }
    : undefined,
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: BRAND_NAVY,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      // suppressHydrationWarning is required because next-themes
      // modifies the class attribute on <html> client-side to apply
      // the user's saved theme preference ("dark" or nothing).
      // Without this, React raises a hydration warning because the
      // server-rendered HTML never has the "dark" class.
      //
      // data-scroll-behavior="smooth" acknowledges globals.css's
      // `scroll-behavior: smooth` so Next.js does not warn about
      // scroll restoration during route transitions.
    >
      <body>
        <ThemeProvider>
          <QueryProvider>
            {/*
              AuthProvider must wrap BOTH the (public) and (auth) route
              groups, so it is mounted here at the root rather than inside
              (auth)/layout.tsx.

              Its onIdTokenChanged listener is what sets the session/role
              cookies and populates the Zustand auth store after sign-in.
              Mounted only under (auth), that listener did not exist on
              /login, so a successful signInWithEmailAndPassword() was
              never observed by anything: no cookies were written, the
              store's `initialized` stayed false, the login page's redirect
              effect never fired, and its submit button span indefinitely
              with no console output (AuthProvider's own diagnostics never
              ran either, because it was never mounted).
            */}
            <AuthProvider>
              {children}
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
        {/* [PRODUCTION FIX, user-requested] sonner was an installed
           dependency with a fully themed Toaster wrapper
           (components/ui/sonner.tsx) that was never mounted anywhere,
           every toast() call anywhere in the app was a silent no-op.
           Surfaced first by downloadPayslip() in usePayroll.ts, whose
           rejected promise (a 403/404 from the payslip download route)
           had nowhere to go, so "View Payslip" looked like it did nothing
           at all when it actually failed. Mounted once, here, so any
           future toast() call anywhere in the app also just works. */}
        <Toaster />
        <Analytics />
      </body>
    </html>
  )
}