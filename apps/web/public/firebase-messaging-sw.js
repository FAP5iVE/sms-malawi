/**
 * firebase-messaging-sw.js
 *
 * Firebase Cloud Messaging Service Worker for SMS Malawi.
 * Handles push notifications when the app is in the background or closed.
 *
 * Architecture:
 *   • This file lives in /public/ and is served at /firebase-messaging-sw.js
 *     giving it scope '/' — it controls all pages in the app.
 *
 *   • Firebase config cannot be injected at build time (service workers in
 *     /public/ are static files; Next.js does not process them with env vars).
 *     Instead, the main app thread sends the config via MessageChannel after
 *     registering the service worker. See getFcmToken() in lib/firebase.ts.
 *
 *   • The compat SDK (firebase-app-compat + firebase-messaging-compat) is used
 *     because importScripts() requires classic (non-module) scripts, and the
 *     modular Firebase SDK v9+ uses ES module syntax which not all browsers
 *     support inside service workers (requires type: 'module' registration).
 *
 *   • Version: Firebase 10.x compat — fully compatible with Firebase projects
 *     using any main-app SDK version for the web client.
 *
 * Message Protocol:
 *   Main thread → SW: { type: 'FIREBASE_CONFIG', config: FirebaseOptions }
 *   SW → Main thread: { ok: true | false, error?: string } (via MessageChannel port)
 *
 * Notification Payload Shape (from push.ts buildFcmMessage()):
 *   notification.title    — Short title shown in OS notification
 *   notification.body     — Body text
 *   notification.icon     — URL to 192x192 PNG icon
 *   data.clickAction      — Relative URL to navigate on tap (e.g. '/finances')
 *   data.tag              — Prevents duplicate notifications for same event
 */

/* global firebase, clients */

// ─── FIREBASE SDK (via CDN importScripts) ─────────────────
// Using Firebase v10.14.1 compat library — stable, broadly supported,
// compatible with the project's firebase npm package for FCM protocols.
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js')

// ─── STATE ────────────────────────────────────────────────

let messagingInstance  = null
let firebaseInitialised = false

// ─── FIREBASE INITIALISATION VIA MESSAGE ─────────────────
// The main thread sends { type: 'FIREBASE_CONFIG', config } after registering
// this service worker. We use a MessageChannel so the main thread knows exactly
// when Firebase Messaging is ready before calling getToken().

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'FIREBASE_CONFIG') return

  // Acknowledge via the port even if already initialised
  const replyPort = event.ports?.[0] ?? null

  if (firebaseInitialised) {
    replyPort?.postMessage({ ok: true, reused: true })
    return
  }

  try {
    const config = event.data.config

    if (!config?.projectId || !config?.messagingSenderId) {
      throw new Error('Firebase config is missing required fields (projectId, messagingSenderId)')
    }

    // Initialize the Firebase app inside the service worker.
    // Use getApps() guard to prevent duplicate initialisation if the SW
    // is reused across multiple message events.
    if (firebase.apps.length === 0) {
      firebase.initializeApp(config)
    }

    messagingInstance  = firebase.messaging()
    firebaseInitialised = true

    // ── Background Message Handler ───────────────────────
    // This fires when a push message arrives while the app is in the background
    // or the tab is closed. The message payload comes from the FCM server.
    // When the app IS in the foreground, firebase/messaging's onMessage() handler
    // in the main thread fires instead — not this handler.
    messagingInstance.onBackgroundMessage((payload) => {
      // Extract notification fields — use sensible defaults for all
      const title      = payload.notification?.title      ?? 'SMS Malawi'
      const body       = payload.notification?.body       ?? ''
      const icon       = payload.notification?.icon       ?? '/favicon.ico'
      const badge      = '/favicon.ico'
      const tag        = payload.data?.tag                ?? undefined
      const clickAction = payload.data?.clickAction       ?? '/dashboard'

      // Additional data forwarded to the notificationclick handler
      const notificationData = {
        clickAction,
        ...(payload.data ?? {}),
      }

      // showNotification() is required inside onBackgroundMessage()
      // to display the notification to the user.
      self.registration.showNotification(title, {
        body,
        icon,
        badge,
        tag,
        data: notificationData,
        // requireInteraction keeps the notification visible until user interacts.
        // Useful for urgent school alerts (exam results released, fee overdue).
        requireInteraction: false,
        // silent: false — allow default sound/vibration per OS settings
      })
    })

    replyPort?.postMessage({ ok: true })
  } catch (err) {
    console.error('[firebase-sw] Firebase initialisation failed:', err)
    replyPort?.postMessage({ ok: false, error: String(err) })
  }
})

// ─── NOTIFICATION CLICK HANDLER ──────────────────────────
// Fires when the user taps a notification displayed by this SW.
// Navigates to the relevant page in the existing app window, or opens a new one.

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const clickAction = event.notification.data?.clickAction ?? '/dashboard'

  // Ensure the URL is absolute — clickAction is a relative path
  const targetUrl = new URL(clickAction, self.location.origin).href

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus an existing app window if one is open
        for (const client of clientList) {
          // Check if this is an SMS Malawi window (same origin)
          if (client.url.startsWith(self.location.origin) && 'focus' in client) {
            void client.navigate(targetUrl)
            return client.focus()
          }
        }

        // No existing window — open a new one
        if (clients.openWindow) {
          return clients.openWindow(targetUrl)
        }
      })
  )
})

// ─── NOTIFICATION CLOSE HANDLER ──────────────────────────
// Optional: log when user dismisses without clicking (analytics).
// Kept minimal to avoid unnecessary overhead.

self.addEventListener('notificationclose', (_event) => {
  // No-op for now — can be extended to track dismissal analytics.
})

// ─── SERVICE WORKER LIFECYCLE ────────────────────────────

// skipWaiting() ensures the new SW version activates immediately
// when a new firebase-messaging-sw.js is deployed, rather than waiting
// for all existing tabs to be closed. This is safe for a push-notification-only
// SW that doesn't cache any network resources.
self.addEventListener('install', () => {
  self.skipWaiting()
})

// clients.claim() makes this SW immediately take control of all open pages
// without requiring a page reload. Required for the FCM token registration
// flow — getToken() needs an active, controlling SW.
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim())
})
