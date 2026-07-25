/**
 * FILE: apps/web/scripts/create-test-accounts.mjs
 *
 * Creates all SMS Malawi test accounts (10 accounts across 9 roles) in
 * Firebase Auth and sets (and verifies) the custom 'role' claim on each one.
 *
 * RUN (from project root sms-malawi/):
 *   node apps/web/scripts/create-test-accounts.mjs
 *
 * Prerequisites:
 *   - apps/web/service-account.json must exist (real Firebase Admin key)
 *   - Writes to the project named in that key's project_id
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
// 10 accounts across the 9 roles (two high_rank: principal + headteacher).
// Change passwords before using in production.
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
    email: 'headteacher@sms.test',
    password: 'HeadTeacher@1234!',
    displayName: 'Head Teacher',
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

  // Verify the claim actually landed. setCustomUserClaims resolves before the
  // claim is guaranteed readable, and a silent no-op here is precisely how an
  // account ends up existing with NO role — which then loops forever in
  // AuthProvider ("no role claim after 2 retries"). Read it back and confirm.
  const check = await admin.auth().getUser(user.uid)
  const written = check.customClaims?.role
  if (written !== role) {
    throw new Error(
      `claim verification failed — expected role='${role}', ` + `read back '${written ?? '(none)'}'`
    )
  }

  console.log(`  🏷  Role set & verified: ${role} (UID: ${user.uid})`)
  return user
}

async function main() {
  console.log('🚀 SMS Malawi — Creating test accounts...\n')

  const succeeded = []
  const failed = []

  for (const account of TEST_ACCOUNTS) {
    try {
      await createOrUpdate(account)
      succeeded.push(account.email)
    } catch (err) {
      console.error(`  ✗ Failed for ${account.email}: ${err.message}`)
      failed.push({ email: account.email, reason: err.message })
    }
  }

  // Honest summary — never claim success when an account was skipped or its
  // claim did not verify.
  console.log('\n─────────────────────────────────────────────')
  console.log(`  Succeeded: ${succeeded.length}/${TEST_ACCOUNTS.length}`)
  if (failed.length > 0) {
    console.log(`  Failed:    ${failed.length}/${TEST_ACCOUNTS.length}`)
    for (const f of failed) console.log(`    ✗ ${f.email} — ${f.reason}`)
    console.log('─────────────────────────────────────────────')
    console.error(
      '\n❌ Some accounts are incomplete. Those that failed have NO usable ' +
        'role claim and will loop on login until this is resolved. Re-run after ' +
        'fixing the cause above (network, quota, or credentials).'
    )
    process.exit(1)
  }

  console.log('─────────────────────────────────────────────')
  console.log('\n✅ All test accounts created/updated and role claims verified.')
  console.log('   Log in at http://localhost:3000/login with any account above.')
  console.log('   NOTE: if an account was already signed in, sign out and back')
  console.log('   in — custom claims only appear in a freshly minted ID token.')
  process.exit(0)
}

main().catch((err) => {
  console.error('\n❌ Fatal:', err.message)
  process.exit(1)
})
