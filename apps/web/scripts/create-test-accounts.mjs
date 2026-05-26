/**
 * FILE: apps/functions/scripts/create-test-accounts.mjs
 *
 * Creates all 9 SMS Malawi test accounts in Firebase Auth
 * and sets the custom 'role' claim on each one.
 *
 * RUN: node apps/functions/scripts/create-test-accounts.mjs
 *
 * Prerequisites:
 *   - apps/functions/service-account.json must exist
 *   - Run from the project root: sms-malawi/
 */
import { initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const serviceAccount = JSON.parse(readFileSync(join(__dirname, '../service-account.json'), 'utf-8'))

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })

// ─── TEST ACCOUNTS ────────────────────────────────────────
// All 9 roles. Change passwords before using in production.
const TEST_ACCOUNTS = [
  {
    email: 'admin@sms.test',
    password: 'Admin@1234!',
    displayName: 'System Admin',
    role: 'admin',
    subtitle: 'System Administrator',
  },
  {
    email: 'principal@sms.test',
    password: 'Principal@1234!',
    displayName: 'School Principal',
    role: 'high_rank',
    subtitle: 'Head Teacher',
  },
  {
    email: 'finance@sms.test',
    password: 'Finance@1234!',
    displayName: 'Finance Officer',
    role: 'finance',
    subtitle: 'Finance Department',
  },
  {
    email: 'teacher@sms.test',
    password: 'Teacher@1234!',
    displayName: 'Class Teacher',
    role: 'academic',
    subtitle: 'Mathematics',
  },
  {
    email: 'library@sms.test',
    password: 'Library@1234!',
    displayName: 'Librarian',
    role: 'library',
    subtitle: 'Library Staff',
  },
  {
    email: 'hr@sms.test',
    password: 'HrStaff@1234!',
    displayName: 'HR Officer',
    role: 'hr',
    subtitle: 'Human Resources',
  },
  {
    email: 'clerk@sms.test',
    password: 'Clerk@1234!',
    displayName: 'Admin Clerk',
    role: 'lower_rank',
    subtitle: 'Administrative Staff',
  },
  {
    email: 'exams@sms.test',
    password: 'Exams@1234!',
    displayName: 'Exam Officer',
    role: 'exam_officer',
    subtitle: 'Examinations',
  },
  {
    email: 'student@sms.test',
    password: 'Student@1234!',
    displayName: 'Test Student',
    role: 'student',
    subtitle: 'Form 1A',
  },
]

async function createOrUpdate(account) {
  const { email, password, displayName, role, subtitle } = account

  let user

  try {
    // Try to get existing user first
    user = await admin.auth().getUserByEmail(email)
    console.log(`  ↻ Updating existing user: ${email}`)

    // Update display name if needed
    await admin.auth().updateUser(user.uid, { displayName })
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      // Create new user
      user = await admin.auth().createUser({ email, password, displayName })
      console.log(`  ✓ Created: ${email}`)
    } else {
      throw err
    }
  }

  // Set the custom claims — THIS IS WHAT MAKES THE ROLE SYSTEM WORK
  await admin.auth().setCustomUserClaims(user.uid, {
    role,
    subtitle,
    requiresPasswordChange: false, // set true for real users on first login
  })

  console.log(`  🏷  Role set: ${role} (UID: ${user.uid})`)
  return user
}

async function main() {
  console.log('🚀 SMS Malawi — Creating test accounts...\n')

  for (const account of TEST_ACCOUNTS) {
    try {
      await createOrUpdate(account)
    } catch (err) {
      console.error(`  ✗ Failed for ${account.email}: ${err.message}`)
    }
  }

  console.log('\n✅ Done! All test accounts created/updated.')
  console.log('   Log in at http://localhost:3000/login with any of the accounts above.')
  process.exit(0)
}

main().catch(console.error)
