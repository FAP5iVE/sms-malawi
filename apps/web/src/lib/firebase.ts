import { initializeApp, getApps, getApp } from 'firebase/app'
import { getAuth, connectAuthEmulator } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore'
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
}

// Prevent duplicate app init in Next.js dev mode (hot reload)
const app = getApps().length ? getApp() : initializeApp(firebaseConfig)

// Firestore is safe server-side (used for data fetching in RSC/SSR)
export const db = getFirestore(app)

// Auth is client-only — initializing it on the server causes
// auth/invalid-api-key during static prerendering
export const auth = typeof window !== 'undefined' ? getAuth(app) : null
export const functions = getFunctions(app, 'africa-south1') 


/**
 * Connect to local emulators when running in development.
 *
 * WHY THE LOGIN FAILED:
 * The emulator was started without --only auth, so login calls went to
 * production Firebase which doesn't know the test accounts. Even when auth
 * IS emulated, the client must be explicitly pointed at the emulator host —
 * it does NOT auto-detect.
 *
 * Add these env vars to apps/web/.env.local:
 *   NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true
 *
 * Then start the emulator WITH auth:
 *   firebase emulators:start --only functions,firestore,auth
 *
 * The guard (typeof window !== 'undefined') prevents this running on the
 * server during SSR, and the flag check prevents it in production.
 */
if (
  typeof window !== 'undefined' &&
  process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true'
) {
  // auth is guaranteed non-null here since typeof window !== 'undefined'
  connectAuthEmulator(auth!, 'http://127.0.0.1:9099', { disableWarnings: false })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
connectFunctionsEmulator(functions, '127.0.0.1', 5001) // 👈 ADD THIS
}
