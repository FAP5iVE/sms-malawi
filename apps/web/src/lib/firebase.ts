import { initializeApp, getApps, getApp } from 'firebase/app'
import { getAuth, connectAuthEmulator } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
}

const canInit = Object.values(firebaseConfig).every(Boolean)
const app = canInit
  ? (getApps().length ? getApp() : initializeApp(firebaseConfig))
  : null

export const db   = app ? getFirestore(app) : null
export const auth = (app && typeof window !== 'undefined') ? getAuth(app) : null


if (
  typeof window !== 'undefined' &&
  process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true'
) {
  // auth is guaranteed non-null here since typeof window !== 'undefined'
  connectAuthEmulator(auth!, 'http://127.0.0.1:9099', { disableWarnings: false })
  connectFirestoreEmulator(db!, '127.0.0.1', 8080)
}
