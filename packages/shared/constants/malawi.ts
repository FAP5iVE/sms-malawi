// ─── MALAWI DISTRICTS ─────────────────────────────────────
export const MALAWI_DISTRICTS = [
  // Northern Region
  'Chitipa',
  'Karonga',
  'Likoma',
  'Mzimba',
  'Nkhata-Bay',
  'Rumphi',
  // Central Region
  'Dedza',
  'Dowa',
  'Kasungu',
  'Lilongwe',
  'Mchinji',
  'Nkhotakota',
  'Ntcheu',
  'Ntchisi',
  'Salima',
  // Southern Region
  'Balaka',
  'Blantyre',
  'Chikwawa',
  'Chiradzulu',
  'Machinga',
  'Mangochi',
  'Mulanje',
  'Mwanza',
  'Neno',
  'Nsanje',
  'Phalombe',
  'Thyolo',
  'Zomba',
] as const

export type MalawiDistrict = (typeof MALAWI_DISTRICTS)[number]

// ─── PUBLIC HOLIDAYS (verify at malawi.gov.mw) ───────────
export const MALAWI_PUBLIC_HOLIDAYS_2026 = [
  { date: '2026-01-01', name: "New Year's Day" },
  { date: '2026-01-15', name: 'John Chilembwe Day' },
  { date: '2026-03-03', name: "Martyrs' Day" },
  { date: '2026-04-03', name: 'Good Friday' },
  { date: '2026-04-06', name: 'Easter Monday' },
  { date: '2026-05-01', name: 'Labour Day' },
  { date: '2026-05-14', name: 'Kamuzu Day' },
  { date: '2026-06-14', name: 'Freedom Day' }, // verify exact date
  { date: '2026-07-06', name: 'Independence Day' },
  { date: '2026-10-15', name: "Mother's Day" }, // verify exact date
  { date: '2026-12-25', name: 'Christmas Day' },
  { date: '2026-12-26', name: 'Boxing Day' },
]

// ─── ACADEMIC TERM STRUCTURE ─────────────────────────────
export const ACADEMIC_TERMS = {
  TERM_1: { label: 'Term 1', months: 'September – December', start: '09-01', end: '12-15' },
  TERM_2: { label: 'Term 2', months: 'January – April', start: '01-10', end: '04-15' },
  TERM_3: { label: 'Term 3', months: 'May – July', start: '05-05', end: '07-25' },
} as const

// ─── MWK CURRENCY FORMATTER ──────────────────────────────
export function formatMWK(amount: number): string {
  return new Intl.NumberFormat('en-MW', {
    style: 'currency',
    currency: 'MWK',
    minimumFractionDigits: 2,
  }).format(amount)
}

// ─── REGISTRATION NUMBER GENERATOR ───────────────────────
export function generateRegistrationNo(year: number, sequence: number): string {
  return `MYSS-${year}-${String(sequence).padStart(4, '0')}`
}

// ─── MALAWI SUBJECTS ─────────────────────────────────────
export const MALAWI_SUBJECTS = [
  'English',
  'Chichewa',
  'Mathematics',
  'Biology',
  'Chemistry',
  'Physics',
  'History',
  'Geography',
  'Life Skills',
  'Agriculture',
  'Computer Studies',
  'Physical Education',
  'Bible Knowledge',
  'Home Economics',
  'Art',
  'Music',
  'Social Studies',
  'Business Studies',
  'French',
  'German',
  'Spanish',
  'Technical Drawing',
  'Woodwork',
  'Metal Work',
  'Creative Arts',
  'Performing Arts',
  'Religious and Moral Education',
] as const

// ─── FIRESTORE COLLECTION NAMES ──────────────────────────
// Use these constants everywhere — never hard-code collection strings in hooks
export const COLLECTIONS = {
  ANNOUNCEMENTS: 'announcements',
  CALENDAR_EVENTS: 'calendar_events',
  ATTENDANCE: 'attendance',
  NOTIFICATIONS: 'notifications',
  AUDIT_LOGS: 'audit_logs',
} as const

// ─── APPWRITE STORAGE ─────────────────────────────────────
// ONE bucket handles ALL file types (photos, PDFs, eBooks, payslips, report cards)
// Bucket ID: school_files — matches what was created in Appwrite dashboard
export const SCHOOL_BUCKET_ID = 'school_files' as const

export const STORAGE_BUCKET_IDS = {
  STUDENT_FILES: SCHOOL_BUCKET_ID,
  DIGITAL_LIBRARY: SCHOOL_BUCKET_ID,
  PAYSLIPS: SCHOOL_BUCKET_ID,
  REPORT_CARDS: SCHOOL_BUCKET_ID,
} as const
