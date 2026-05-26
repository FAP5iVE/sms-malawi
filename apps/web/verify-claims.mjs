import { initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { readFileSync } from 'fs'

const sa = JSON.parse(readFileSync('./service-account.json', 'utf-8'))
initializeApp({ credential: cert(sa) })

const emails = [
  'admin@sms.test',
  'principal@sms.test',
  'finance@sms.test',
  'teacher@sms.test',
  'library@sms.test',
  'hr@sms.test',
  'clerk@sms.test',
  'exams@sms.test',
  'student@sms.test',
]

console.log('\nVerifying custom claims...\n')

for (const email of emails) {
  const user = await getAuth().getUserByEmail(email)
  const c = user.customClaims
  if (!c?.role) console.log('NO CLAIMS:', email)
  else console.log('OK', email, '|', c.role, '|', c.subtitle)
}

process.exit(0)