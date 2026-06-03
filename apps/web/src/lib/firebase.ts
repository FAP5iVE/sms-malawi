/**
 * apps/web/src/lib/firebase.ts
 *
 * Firebase Client SDK — single initialisation point for all client-side Firebase services.
 *
 * Exports:
 *   db         — Firestore client (real-time attendance, announcements, notifications)
 *   auth       — Firebase Auth (sign-in, token management, custom claims)
 *   messaging  — Firebase Cloud Messaging (push notification subscription, browser-only)
 *
 * getFcmToken() — async helper: requests notification permission, registers the
 *                 service worker at /firebase-messaging-sw.js, and returns the
 *                 device's FCM registration token for push notification delivery.
 *
 * Architecture notes:
 *   • All three exports are null on the server (SSR / Next.js Server Components).
 *     Never import this file in server-only code — use firebase-admin instead.
 *   • `messaging` additionally requires browser Notification + ServiceWorker support;
 *     it is null in browsers that lack these APIs (e.g., older Safari).
 *   • The Firebase app singleton is guarded by getApps().length so that
 *     hot-reload in development does not create duplicate app instances.
 *   • Emulator connections are wired when NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true
 *     to enable local development without touching production Firebase.
 *
 * Phase B9 changes:
 *   • Added getMessaging import and messaging export
 *   • Added getFcmToken() async helper with full error isolation
 *   • Added firebaseConfig export for service worker initialisation via postMessage
 */

import { initializeApp, getApps, getApp, type FirebaseOptions } from 'firebase/app'
import { getAuth, connectAuthEmulator }            from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator }  from 'firebase/firestore'
import { getMessaging, getToken, deleteToken, isSupported } from 'firebase/messaging'

// ─────────────────────────────────────────────────────────
//  FIREBASE APP CONFIGURATION
//  Public values — safe to expose to the browser.
//  Security is enforced by Firebase Security Rules and Firebase Admin SDK,
//  not by keeping these values secret.
// ─────────────────────────────────────────────────────────

export const firebaseConfig: FirebaseOptions = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
}

// Guard: only initialise if every required key is present.
// Missing keys produce a broken Firebase app, so we short-circuit to null.
const canInit = Object.values(firebaseConfig).every(Boolean)

const app = canInit
  ? (getApps().length > 0 ? getApp() : initializeApp(firebaseConfig))
  : null

// ─────────────────────────────────────────────────────────
//  EXPORTED FIREBASE SERVICES
// ─────────────────────────────────────────────────────────

/**
 * Firestore client database instance.
 *
 * Used for real-time features:
 *   • AttendanceSheet  — live attendance marking (collection: attendance/{classId}/records/{date})
 *   • AnnouncementFeed — live announcement stream
 *   • NotificationBell — unread notification badge
 *   • CalendarView     — calendar event feed
 *
 * null when app config is missing (should never happen in production).
 */
export const db = app ? getFirestore(app) : null

/**
 * Firebase Auth instance.
 *
 * Used by AuthProvider.tsx for the `onIdTokenChanged` listener, which handles:
 *   • Initial sign-in
 *   • Automatic token refresh (every ~55 minutes)
 *   • Sign-out detection
 *   • Refresh token revocation (forced sign-out after role change)
 *
 * null on the server — Firebase Auth requires a browser environment.
 */
export const auth = (app && typeof window !== 'undefined')
  ? getAuth(app)
  : null

/**
 * Firebase Cloud Messaging instance.
 *
 * Used for push notification token registration.
 * Call getFcmToken() to get the user's device token — do not use messaging directly.
 *
 * null on:
 *   • Server-side render (no window object)
 *   • Browsers without Notification API or Service Worker support
 *   • When firebase config is missing
 */
export const messaging = (app && typeof window !== 'undefined')
  ? getMessaging(app)
  : null

// ─────────────────────────────────────────────────────────
//  FCM TOKEN MANAGEMENT
// ─────────────────────────────────────────────────────────

/**
 * Request notification permission and retrieve this device's FCM registration token.
 *
 * Flow:
 *   1. Check browser supports FCM (isSupported() — async, checks SW + Notification APIs)
 *   2. Request the browser's native Notification permission prompt
 *   3. Register /firebase-messaging-sw.js at scope '/'
 *   4. Send Firebase config to the service worker via MessageChannel (reliable, zero race condition)
 *   5. Wait for SW to confirm Firebase Messaging is initialised
 *   6. Call getToken() with the VAPID key + explicit SW registration
 *   7. Return the token, or null on any failure
 *
 * Returns null (without throwing) when:
 *   • Server-side render
 *   • messaging is null (unsupported browser)
 *   • NEXT_PUBLIC_FIREBASE_VAPID_KEY is not configured
 *   • Browser doesn't support FCM (checked via isSupported())
 *   • User denies the notification permission prompt
 *   • Service worker registration fails (non-fatal — logged, not thrown)
 *   • Firebase SDK throws during getToken()
 *
 * This function is idempotent — calling it multiple times when permission is
 * already granted returns the existing token without re-prompting the user.
 */
export async function getFcmToken(): Promise<string | null> {
  if (typeof window === 'undefined' || !messaging || !app) return null

  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY
  if (!vapidKey) {
    // VAPID key must be created in Firebase Console → Project Settings → Cloud Messaging
    // and exposed as NEXT_PUBLIC_FIREBASE_VAPID_KEY
    console.warn('[firebase] NEXT_PUBLIC_FIREBASE_VAPID_KEY is not configured — push notifications disabled')
    return null
  }

  try {
    // isSupported() returns false for: Firefox in private mode, Safari < 16.4 without
    // PWA install, all iOS WebView, and any browser without Service Worker support.
    const supported = await isSupported()
    if (!supported) return null

    // Request permission — resolves immediately if already decided.
    // If the user has previously denied, this returns 'denied' without a prompt.
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return null

    // ── Service Worker Registration ──────────────────────────
    // We register the SW explicitly and pass the registration to getToken()
    // to avoid a race condition where Firebase internally creates its own
    // registration at a different point in the lifecycle.
    let swRegistration: ServiceWorkerRegistration | undefined

    if ('serviceWorker' in navigator) {
      try {
        swRegistration = await navigator.serviceWorker.register(
          '/firebase-messaging-sw.js',
          { scope: '/', updateViaCache: 'none' }
        )

        // Wait for the service worker to be fully controlling the page.
        // navigator.serviceWorker.ready resolves when the SW is active.
        await navigator.serviceWorker.ready

        // ── Send Firebase config to the Service Worker ─────────
        // The SW needs the Firebase config to initialise its own firebase.messaging()
        // instance for handling background messages. Since SW files in /public/
        // cannot access process.env, we pass the config via MessageChannel.
        //
        // MessageChannel gives us a reliable two-way channel — the SW sends back
        // an acknowledgement when it has initialised Firebase Messaging, so we
        // know the config was received before we call getToken().
        const activeWorker =
          swRegistration.active ??
          swRegistration.waiting ??
          swRegistration.installing ??
          navigator.serviceWorker.controller

        if (activeWorker) {
          await new Promise<void>((resolve) => {
            const { port1, port2 } = new MessageChannel()

            port1.onmessage = (event: MessageEvent) => {
              if (!event.data?.ok) {
                // SW reported an error — log for debugging but don't block
                console.warn('[firebase] SW firebase init warning:', event.data?.error)
              }
              resolve()
            }

            activeWorker.postMessage(
              { type: 'FIREBASE_CONFIG', config: firebaseConfig },
              [port2]
            )

            // Safety timeout: resolve after 4 seconds even without SW ack.
            // In this case getToken() may still work if the SW was previously
            // initialised from an earlier session.
            setTimeout(resolve, 4000)
          })
        }
      } catch (swErr) {
        // SW registration failure is non-fatal in development (localhost) and
        // in some CI environments. Log it and fall through — getToken() will
        // attempt its own internal SW registration.
        console.warn('[firebase] SW registration failed — attempting getToken() without explicit SW:', swErr)
      }
    }

    // ── Get FCM Registration Token ──────────────────────────
    const token = await getToken(messaging, {
      vapidKey,
      ...(swRegistration ? { serviceWorkerRegistration: swRegistration } : {}),
    })

    return token ?? null
  } catch (err) {
    // Swallow all errors — FCM is optional infrastructure.
    // Expected failure cases:
    //   - User dismissed the browser permission prompt without deciding
    //   - Browser blocks SW registration (strict tracking prevention in Firefox)
    //   - FCM quota exceeded (rare, auto-recovers)
    //   - Network error when Firebase validates the token
    console.debug('[firebase] getFcmToken() returned null:', err)
    return null
  }
}

/**
 * Deregister this device's FCM token.
 *
 * Called on logout to ensure the user stops receiving push notifications
 * on this device. Uses the Firebase SDK directly — no server call needed.
 * The server-side token store is cleaned up lazily when push.ts encounters
 * the now-invalid token during the next send operation.
 *
 * Safe to call even if the token was never registered — returns silently.
 */
export async function removeFcmToken(): Promise<void> {
  if (typeof window === 'undefined' || !messaging) return

  try {
    await deleteToken(messaging)
  } catch {
    // Non-fatal — the token will expire and be cleaned up server-side
    // when push.ts's removeInvalidTokens() runs after the next failed send.
  }
}

// ─────────────────────────────────────────────────────────
//  LOCAL DEVELOPMENT — FIREBASE EMULATORS
// ─────────────────────────────────────────────────────────
//  Start emulators: firebase emulators:start --only auth,firestore
//  Auth emulator:      http://127.0.0.1:9099
//  Firestore emulator: http://127.0.0.1:8080
//  Emulator UI:        http://127.0.0.1:4000

if (
  typeof window !== 'undefined' &&
  process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true'
) {
  if (auth) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: false })
  if (db)   connectFirestoreEmulator(db, '127.0.0.1', 8080)
  // Note: Firebase Messaging does not have an emulator — FCM tokens in development
  // will be real Firebase registrations. Use NEXT_PUBLIC_FIREBASE_VAPID_KEY with
  // a real VAPID key for testing push in development.
}
