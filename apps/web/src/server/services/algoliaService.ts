import 'server-only'
import { algoliasearch, type Algoliasearch } from 'algoliasearch'
import { logger } from '@/lib/logger'

// ─────────────────────────────────────────────────────────
//  CLIENT INITIALISATION
//  Lazy singleton — mirrors lib/email.ts's getResendClient() pattern.
//  The Algolia v5 SDK's algoliasearch() factory throws synchronously
//  ("`appId` is missing.") when constructed with an empty appId. Building
//  the client eagerly at module scope meant this module — pulled in
//  transitively by api-app.ts via search.ts/algoliaAdmin.ts/studentService.ts/
//  hrService.ts/libraryService.ts — crashed Next.js's build-time "Collecting
//  page data" step for the /api/[[...slug]] catch-all route whenever
//  ALGOLIA_APP_ID/ALGOLIA_ADMIN_KEY weren't present in the build environment.
//  Deferring construction to first real use (request time, when env vars are
//  actually populated) avoids the build-time crash; every call site below
//  already degrades gracefully to fallbackSearch() when Algolia is
//  unavailable, so returning null here rather than throwing is consistent
//  with this file's own existing error-handling design.
// ─────────────────────────────────────────────────────────

let _adminClient: Algoliasearch | null = null

function getAlgoliaAdminClient(): Algoliasearch | null {
  if (_adminClient) return _adminClient
  const appId    = process.env.ALGOLIA_APP_ID
  const adminKey = process.env.ALGOLIA_ADMIN_KEY
  if (!appId || !adminKey) {
    if (process.env.NODE_ENV === 'production') {
      logger.error('[algoliaService] ALGOLIA_APP_ID/ALGOLIA_ADMIN_KEY not set — search indexing is disabled, fallbackSearch() will be used')
    }
    return null
  }
  _adminClient = algoliasearch(appId, adminKey)
  return _adminClient
}

export const STUDENTS_INDEX             = 'students'
export const STAFF_INDEX                = 'staff_profiles'
export const BOOKS_INDEX                = 'books'
export const USER_ACCOUNTS_INDEX        = 'user_accounts'
export const APPLICATIONS_INDEX         = 'applications'
export const INVOICES_INDEX             = 'invoices'
export const UNIVERSITY_PLACEMENTS_INDEX = 'university_placements'
export const ASSETS_INDEX               = 'assets'
export const ANNOUNCEMENTS_INDEX        = 'announcements'

// ─── INDEX SETTINGS (facets, searchable attributes, replicas) ───────────────
// [ALGOLIA ROLLOUT — Tier 0] Nothing in this codebase ever called
// setSettings() on any index — students/staff_profiles/books have been
// running on Algolia's bare defaults (no attributesForFaceting, no
// searchableAttributes ranking, no replicas) since they were first created.
// That means every faceted-filter UI and every sort-order dropdown planned
// against these indices would fail outright (Algolia errors on filtering an
// attribute that was never declared in attributesForFaceting, and a replica
// index name that was never created 404s). This section is the one-time
// (and re-runnable — see applyIndexSettings) fix: it declares, per index,
// what's filterable, what's searchable and in what priority order, and
// which sort-order replicas should exist. Safe to re-run any time a facet
// or sort order is added — setSettings() is idempotent, it replaces the
// named index's settings wholesale rather than accumulating diffs.
//
// `filterOnly(x)` marks a facet that's used to filter results but is never
// itself rendered as a browsable "pick a value" list in the UI (no facet
// counts needed) — cheaper for Algolia to maintain than a full facet.
// Everything below is a plain facet (rendered as a filter with counts)
// unless commented otherwise.
export interface AlgoliaIndexConfig {
  indexName: string
  searchableAttributes: string[]
  attributesForFaceting: string[]
  /** Replica index names, one per sort order. Each is created empty here;
   *  actual ranking (sort-by-field) is then set on the replica itself in
   *  the same applyIndexSettings() call, right after the primary index's
   *  settings are pushed — see that function below. */
  replicas?: { indexName: string; ranking: string[] }[]
}

export const INDEX_CONFIGS: AlgoliaIndexConfig[] = [
  {
    indexName: STUDENTS_INDEX,
    searchableAttributes: ['fullName', 'registrationNo', 'otherNames'],
    attributesForFaceting: ['status', 'form', 'className', 'sex', 'academicYear', 'riskLevel'],
    replicas: [
      { indexName: 'students_name_asc',  ranking: ['asc(lastName)', 'asc(firstName)'] },
      { indexName: 'students_regno_desc', ranking: ['desc(registrationNo)'] },
      { indexName: 'students_form_asc',  ranking: ['asc(form)'] },
    ],
  },
  {
    indexName: STAFF_INDEX,
    searchableAttributes: ['fullName', 'email'],
    attributesForFaceting: ['department', 'jobTitle', 'status', 'employmentType', 'role'],
    replicas: [
      { indexName: 'staff_profiles_name_asc',      ranking: ['asc(lastName)', 'asc(firstName)'] },
      { indexName: 'staff_profiles_datejoined_desc', ranking: ['desc(dateJoined)'] },
      { indexName: 'staff_profiles_contractexpiry_asc', ranking: ['asc(contractExpiry)'] },
    ],
  },
  {
    indexName: BOOKS_INDEX,
    searchableAttributes: ['title', 'author', 'isbn'],
    attributesForFaceting: ['category', 'publisher', 'publishedYear', 'shelf', 'filterOnly(availableCopies)'],
    replicas: [
      { indexName: 'books_title_asc',  ranking: ['asc(title)'] },
      { indexName: 'books_author_asc', ranking: ['asc(author)'] },
      { indexName: 'books_year_desc',  ranking: ['desc(publishedYear)'] },
      { indexName: 'books_available_desc', ranking: ['desc(availableCopies)'] },
    ],
  },
  {
    indexName: USER_ACCOUNTS_INDEX,
    searchableAttributes: ['displayName', 'email', 'employeeNo', 'registrationNo'],
    attributesForFaceting: ['role', 'disabled', 'accountType', 'requiresPasswordChange'],
    replicas: [
      { indexName: 'user_accounts_name_asc',       ranking: ['asc(displayName)'] },
      { indexName: 'user_accounts_created_desc',   ranking: ['desc(createdAt)'] },
      { indexName: 'user_accounts_lastsignin_desc', ranking: ['desc(lastSignIn)'] },
    ],
  },
  {
    indexName: APPLICATIONS_INDEX,
    searchableAttributes: ['firstName', 'lastName', 'guardianName', 'previousSchool'],
    attributesForFaceting: ['status', 'applyingForForm', 'academicYear', 'sex'],
    replicas: [
      { indexName: 'applications_created_desc', ranking: ['desc(createdAt)'] },
      { indexName: 'applications_created_asc',  ranking: ['asc(createdAt)'] },
      { indexName: 'applications_name_asc',     ranking: ['asc(lastName)', 'asc(firstName)'] },
    ],
  },
  {
    indexName: INVOICES_INDEX,
    searchableAttributes: ['studentName', 'registrationNo'],
    attributesForFaceting: ['status', 'academicYear', 'term', 'className'],
    replicas: [
      { indexName: 'invoices_duedate_asc',  ranking: ['asc(dueDate)'] },
      { indexName: 'invoices_balance_desc', ranking: ['desc(balance)'] },
      { indexName: 'invoices_created_desc', ranking: ['desc(createdAt)'] },
    ],
  },
  {
    indexName: UNIVERSITY_PLACEMENTS_INDEX,
    searchableAttributes: ['studentName', 'placedUniversityName', 'placedProgrammeName'],
    attributesForFaceting: ['placedUniversityName', 'placedProgrammeName', 'admissionYear', 'status', 'entrySource'],
    replicas: [
      { indexName: 'university_placements_name_asc', ranking: ['asc(studentName)'] },
      { indexName: 'university_placements_university_asc', ranking: ['asc(placedUniversityName)'] },
    ],
  },
  {
    indexName: ASSETS_INDEX,
    searchableAttributes: ['name', 'serialNumber', 'location'],
    attributesForFaceting: ['category', 'status', 'location'],
    replicas: [
      { indexName: 'assets_name_asc',      ranking: ['asc(name)'] },
      { indexName: 'assets_acquired_desc', ranking: ['desc(acquisitionDate)'] },
      { indexName: 'assets_cost_desc',     ranking: ['desc(acquisitionCost)'] },
    ],
  },
  {
    indexName: ANNOUNCEMENTS_INDEX,
    searchableAttributes: ['title'],
    attributesForFaceting: ['status', 'postType', 'targetRoles'],
    replicas: [
      { indexName: 'announcements_created_desc',  ranking: ['desc(createdAt)'] },
      { indexName: 'announcements_eventdate_asc', ranking: ['asc(eventDate)'] },
    ],
  },
]

/**
 * Pushes searchableAttributes + attributesForFaceting to one index, and
 * creates + ranks any declared replicas. Idempotent: safe to call
 * repeatedly, e.g. from an admin "Configure indices" button, any time
 * INDEX_CONFIGS changes.
 */
export async function applyIndexSettings(config: AlgoliaIndexConfig): Promise<{ ok: boolean; error?: string }> {
  const client = getAlgoliaAdminClient()
  if (!client) return { ok: false, error: 'Algolia is not configured on the server.' }
  try {
    await client.setSettings({
      indexName: config.indexName,
      indexSettings: {
        searchableAttributes: config.searchableAttributes,
        attributesForFaceting: config.attributesForFaceting,
        replicas: (config.replicas ?? []).map((r) => r.indexName),
      },
    })
    // Each replica needs its own ranking set on the replica index itself —
    // declaring it as a replica in the primary's settings only creates the
    // (empty-ranking) shell.
    for (const replica of config.replicas ?? []) {
      await client.setSettings({
        indexName: replica.indexName,
        indexSettings: { ranking: [...replica.ranking, 'typo', 'geo', 'words', 'filters', 'proximity', 'attribute', 'exact', 'custom'] },
      })
    }
    return { ok: true }
  } catch (err) {
    logger.error({ event: 'algolia.configure_index_failed', indexName: config.indexName, err })
    return { ok: false, error: err instanceof Error ? err.message : 'Algolia setSettings failed' }
  }
}

/** Applies every declared index's settings + replicas in one call — the
 *  full one-time (or re-run-after-a-plan-change) setup step. */
export async function configureAllIndices(): Promise<Record<string, { ok: boolean; error?: string }>> {
  const results: Record<string, { ok: boolean; error?: string }> = {}
  for (const config of INDEX_CONFIGS) {
    results[config.indexName] = await applyIndexSettings(config)
  }
  return results
}

// ─── STUDENT RECORDS ─────────────────────────────────────────────────────────

export interface AlgoliaStudent {
  objectID:       string
  registrationNo: string
  firstName:      string
  lastName:       string
  otherNames:     string | null
  fullName:       string
  className:      string | null
  form:           number | null
  status:         string
  sex:            string
  academicYear:   string | null
  district:       string | null
  /** Derived, weekly — see riskJob.ts. Deliberately NOT a Postgres column
   *  (Student.riskLevel was removed as a data-integrity trap, see riskJob.ts's
   *  header) — Algolia is the persistence layer for this cache value, kept
   *  fresh by the existing Monday 02:00 UTC cron rather than computed live. */
  riskLevel?:     'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | null
}

export async function indexStudent(record: AlgoliaStudent): Promise<void> {
  const client = getAlgoliaAdminClient()
  if (!client) return
  try {
    await client.saveObject({ indexName: STUDENTS_INDEX, body: record })
  } catch (err) {
    console.error('[algoliaService] indexStudent failed', err)
  }
}

export async function updateStudent(record: Partial<AlgoliaStudent> & { objectID: string }): Promise<void> {
  const client = getAlgoliaAdminClient()
  if (!client) return
  try {
    await client.partialUpdateObject({
      indexName:  STUDENTS_INDEX,
      objectID:   record.objectID,
      attributesToUpdate: record,
    })
  } catch (err) {
    console.error('[algoliaService] updateStudent failed', err)
  }
}

export async function deleteStudent(studentId: string): Promise<void> {
  const client = getAlgoliaAdminClient()
  if (!client) return
  try {
    await client.deleteObject({ indexName: STUDENTS_INDEX, objectID: studentId })
  } catch (err) {
    console.error('[algoliaService] deleteStudent failed', err)
  }
}

// ─── STAFF RECORDS ───────────────────────────────────────────────────────────

export interface AlgoliaStaff {
  objectID:       string
  uid:            string
  firstName:      string
  lastName:       string
  fullName:       string
  role:           string
  department:     string
  status:         string
  email:          string | null
  // [ALGOLIA ROLLOUT — Tier 1 item 4] the directory's own dependent
  // job-title filter and the contract-expiry alert feature both already
  // depend on exactly this data (see hrService.ts) — it just never made it
  // into this interface. dateJoined added for the "recent hires" sort
  // order the plan calls for.
  jobTitle:       string | null
  employmentType: string | null
  contractExpiry: string | null   // ISO date, or null if none set
  dateJoined:     string | null   // ISO date
}

export async function indexStaff(record: AlgoliaStaff): Promise<void> {
  const client = getAlgoliaAdminClient()
  if (!client) return
  try {
    await client.saveObject({ indexName: STAFF_INDEX, body: record })
  } catch (err) {
    console.error('[algoliaService] indexStaff failed', err)
  }
}

export async function updateStaff(record: Partial<AlgoliaStaff> & { objectID: string }): Promise<void> {
  const client = getAlgoliaAdminClient()
  if (!client) return
  try {
    await client.partialUpdateObject({
      indexName:  STAFF_INDEX,
      objectID:   record.objectID,
      attributesToUpdate: record,
    })
  } catch (err) {
    console.error('[algoliaService] updateStaff failed', err)
  }
}

export async function deleteStaff(staffId: string): Promise<void> {
  const client = getAlgoliaAdminClient()
  if (!client) return
  try {
    await client.deleteObject({ indexName: STAFF_INDEX, objectID: staffId })
  } catch (err) {
    console.error('[algoliaService] deleteStaff failed', err)
  }
}

// ─── BOOK RECORDS ────────────────────────────────────────────────────────────

export interface AlgoliaBook {
  objectID:        string
  title:           string
  author:          string
  isbn:            string | null
  category:        string
  availableCopies: number
  totalCopies:     number
  // [ALGOLIA ROLLOUT — Tier 1 item 5] the catalog's own filter/sort UI
  // already depends on publisher/publishedYear (listBooks() supports both
  // today) — this was the one place the plan found an existing Algolia
  // record actually incomplete relative to what the UI already offers.
  // shelf is newer still (added after the original plan) — a physical
  // shelf/location label, useful as a "where is this physically" facet.
  publisher:       string | null
  publishedYear:   number | null
  shelf:           string | null
}

export async function indexBook(record: AlgoliaBook): Promise<void> {
  const client = getAlgoliaAdminClient()
  if (!client) return
  try {
    await client.saveObject({ indexName: BOOKS_INDEX, body: record })
  } catch (err) {
    console.error('[algoliaService] indexBook failed', err)
  }
}

export async function updateBook(record: Partial<AlgoliaBook> & { objectID: string }): Promise<void> {
  const client = getAlgoliaAdminClient()
  if (!client) return
  try {
    await client.partialUpdateObject({
      indexName:  BOOKS_INDEX,
      objectID:   record.objectID,
      attributesToUpdate: record,
    })
  } catch (err) {
    console.error('[algoliaService] updateBook failed', err)
  }
}

export async function deleteBook(bookId: string): Promise<void> {
  const client = getAlgoliaAdminClient()
  if (!client) return
  try {
    await client.deleteObject({ indexName: BOOKS_INDEX, objectID: bookId })
  } catch (err) {
    console.error('[algoliaService] deleteBook failed', err)
  }
}

// ─── USER ACCOUNTS ───────────────────────────────────────────────────────────
// [ALGOLIA ROLLOUT — Tier 1 item 2] New index. Fixes the real bug this whole
// item targets: useUsers() (hooks/useAdmin.ts) only ever fetches the first
// Firebase listUsers() page of 100 and never loops pageToken, so search/
// filter/sort in the User Management Accounts tab has silently stopped
// covering every account past the first 100 since the school passed that
// mark. Moving search/filter/sort to Algolia removes the need for the
// client to hold the full list in memory at all — it queries Algolia
// directly instead of filtering a JS array — so the pageToken loop only
// needs to exist in the seed/sync paths below, not in the UI's read path.

export interface AlgoliaUserAccount {
  objectID:               string   // Firebase uid
  displayName:            string | null
  email:                  string | null
  role:                   string | null
  disabled:               boolean
  requiresPasswordChange: boolean
  createdAt:              string | null   // ISO — Firebase metadata.creationTime
  lastSignIn:             string | null   // ISO — Firebase metadata.lastSignInTime
  employeeNo:             string | null
  registrationNo:         string | null
  staffProfileId:         string | null
  studentId:              string | null
  /** Derived from staffProfileId/studentId presence — see item 2 in the
   *  plan. Computed once here rather than left for the client to derive. */
  accountType:            'staff' | 'student' | 'unlinked'
}

function deriveAccountType(staffProfileId: string | null, studentId: string | null): AlgoliaUserAccount['accountType'] {
  if (staffProfileId) return 'staff'
  if (studentId) return 'student'
  return 'unlinked'
}

export async function indexUserAccount(record: Omit<AlgoliaUserAccount, 'accountType'>): Promise<void> {
  const client = getAlgoliaAdminClient()
  if (!client) return
  try {
    const body: AlgoliaUserAccount = { ...record, accountType: deriveAccountType(record.staffProfileId, record.studentId) }
    await client.saveObject({ indexName: USER_ACCOUNTS_INDEX, body })
  } catch (err) {
    console.error('[algoliaService] indexUserAccount failed', err)
  }
}

export async function updateUserAccount(
  record: Partial<Omit<AlgoliaUserAccount, 'accountType'>> & { objectID: string },
): Promise<void> {
  const client = getAlgoliaAdminClient()
  if (!client) return
  try {
    // accountType is only recomputable if both link fields are present in
    // this partial update; when neither is being changed, omit it so the
    // partial update doesn't clobber a previously-correct value with
    // 'unlinked' just because this particular call didn't pass either field.
    const attributesToUpdate: Partial<AlgoliaUserAccount> = { ...record }
    if (record.staffProfileId !== undefined || record.studentId !== undefined) {
      attributesToUpdate.accountType = deriveAccountType(record.staffProfileId ?? null, record.studentId ?? null)
    }
    await client.partialUpdateObject({
      indexName:  USER_ACCOUNTS_INDEX,
      objectID:   record.objectID,
      attributesToUpdate,
    })
  } catch (err) {
    console.error('[algoliaService] updateUserAccount failed', err)
  }
}

export async function bulkIndexUserAccounts(records: Omit<AlgoliaUserAccount, 'accountType'>[]): Promise<BulkIndexResult> {
  const client = getAlgoliaAdminClient()
  if (!client) return { indexed: 0, configured: false }
  if (records.length === 0) return { indexed: 0, configured: true }
  try {
    const objects = records.map((r) => ({ ...r, accountType: deriveAccountType(r.staffProfileId, r.studentId) }))
    await client.saveObjects({ indexName: USER_ACCOUNTS_INDEX, objects: objects as unknown as Record<string, unknown>[] })
    return { indexed: records.length, configured: true }
  } catch (err) {
    console.error('[algoliaService] bulkIndexUserAccounts failed', err)
    return { indexed: 0, configured: true, error: err instanceof Error ? err.message : 'Algolia write failed' }
  }
}

// ─── APPLICATIONS ────────────────────────────────────────────────────────────
// [ALGOLIA ROLLOUT — Tier 1 item 6] New index. listApplications() currently
// supports only a status filter and a fixed createdAt-desc sort — no name
// search at all, which is a real day-to-day admissions-office gap ("find
// this applicant by name" isn't possible without scrolling a status-
// filtered, paginated list today).

export interface AlgoliaApplication {
  objectID:        string
  firstName:       string
  lastName:        string
  otherNames:      string | null
  fullName:        string
  guardianName:    string
  previousSchool:  string | null
  status:          string
  applyingForForm: number
  academicYear:    string | null
  sex:             string
  createdAt:       string   // ISO — for the "Newest/Oldest first" sort orders
}

export async function indexApplication(record: AlgoliaApplication): Promise<void> {
  const client = getAlgoliaAdminClient()
  if (!client) return
  try {
    await client.saveObject({ indexName: APPLICATIONS_INDEX, body: record })
  } catch (err) {
    console.error('[algoliaService] indexApplication failed', err)
  }
}

export async function updateApplication(
  record: Partial<AlgoliaApplication> & { objectID: string },
): Promise<void> {
  const client = getAlgoliaAdminClient()
  if (!client) return
  try {
    await client.partialUpdateObject({
      indexName:  APPLICATIONS_INDEX,
      objectID:   record.objectID,
      attributesToUpdate: record,
    })
  } catch (err) {
    console.error('[algoliaService] updateApplication failed', err)
  }
}

export async function bulkIndexApplications(records: AlgoliaApplication[]): Promise<BulkIndexResult> {
  const client = getAlgoliaAdminClient()
  if (!client) return { indexed: 0, configured: false }
  if (records.length === 0) return { indexed: 0, configured: true }
  try {
    await client.saveObjects({ indexName: APPLICATIONS_INDEX, objects: records as unknown as Record<string, unknown>[] })
    return { indexed: records.length, configured: true }
  } catch (err) {
    console.error('[algoliaService] bulkIndexApplications failed', err)
    return { indexed: 0, configured: true, error: err instanceof Error ? err.message : 'Algolia write failed' }
  }
}

// ─── INVOICES ────────────────────────────────────────────────────────────────
// [ALGOLIA ROLLOUT — Tier 2 item 7, upgraded to high priority — see the
// plan] GET /finances/invoices is hardcoded to `take: 100` with zero
// pagination — the same silent-truncation bug class as the original User
// Management item, just not caught yet because 100 is still a plausible
// invoice count for this school today.

export interface AlgoliaInvoice {
  objectID:       string
  studentName:    string   // denormalized — Invoice has no direct join in the list route today
  registrationNo: string | null
  status:         string
  academicYear:   string
  term:           number
  className:      string | null
  dueDate:        string | null   // ISO
  balance:        number          // for the "Balance (highest first)" sort order
  createdAt:      string          // ISO — for "Newest invoice"
}

export async function indexInvoice(record: AlgoliaInvoice): Promise<void> {
  const client = getAlgoliaAdminClient()
  if (!client) return
  try {
    await client.saveObject({ indexName: INVOICES_INDEX, body: record })
  } catch (err) {
    console.error('[algoliaService] indexInvoice failed', err)
  }
}

export async function updateInvoice(
  record: Partial<AlgoliaInvoice> & { objectID: string },
): Promise<void> {
  const client = getAlgoliaAdminClient()
  if (!client) return
  try {
    await client.partialUpdateObject({
      indexName:  INVOICES_INDEX,
      objectID:   record.objectID,
      attributesToUpdate: record,
    })
  } catch (err) {
    console.error('[algoliaService] updateInvoice failed', err)
  }
}

export async function bulkIndexInvoices(records: AlgoliaInvoice[]): Promise<BulkIndexResult> {
  const client = getAlgoliaAdminClient()
  if (!client) return { indexed: 0, configured: false }
  if (records.length === 0) return { indexed: 0, configured: true }
  try {
    await client.saveObjects({ indexName: INVOICES_INDEX, objects: records as unknown as Record<string, unknown>[] })
    return { indexed: records.length, configured: true }
  } catch (err) {
    console.error('[algoliaService] bulkIndexInvoices failed', err)
    return { indexed: 0, configured: true, error: err instanceof Error ? err.message : 'Algolia write failed' }
  }
}

// ─── UNIVERSITY PLACEMENTS ───────────────────────────────────────────────────
// [ALGOLIA ROLLOUT — Tier 1/2 item 10 — new domain, not in the original
// plan] listConfirmedPlacements()/listClaimsQueue() currently filter by
// academicYear only, no search box, on a screen with a genuinely public
// (unauthenticated) view — see placement-results/page.tsx. Only CONFIRMED
// records are meant to be publicly searchable; a PENDING_APPROVAL claim is
// still indexed (so staff can search the claims queue too) but the public
// page's own query must filter status:CONFIRMED itself — this index does
// not enforce that visibility split on its own.

export interface AlgoliaPlacement {
  objectID:            string
  studentName:         string
  placedUniversityName: string | null
  placedProgrammeName:  string | null
  admissionYear:        string | null
  status:                string   // PENDING_APPROVAL | CONFIRMED | REJECTED
  entrySource:           string   // STAFF_OFFICIAL | STUDENT_CLAIM — staff view only, never rendered publicly
}

export async function indexPlacement(record: AlgoliaPlacement): Promise<void> {
  const client = getAlgoliaAdminClient()
  if (!client) return
  try {
    await client.saveObject({ indexName: UNIVERSITY_PLACEMENTS_INDEX, body: record })
  } catch (err) {
    console.error('[algoliaService] indexPlacement failed', err)
  }
}

export async function updatePlacement(
  record: Partial<AlgoliaPlacement> & { objectID: string },
): Promise<void> {
  const client = getAlgoliaAdminClient()
  if (!client) return
  try {
    await client.partialUpdateObject({
      indexName:  UNIVERSITY_PLACEMENTS_INDEX,
      objectID:   record.objectID,
      attributesToUpdate: record,
    })
  } catch (err) {
    console.error('[algoliaService] updatePlacement failed', err)
  }
}

export async function bulkIndexPlacements(records: AlgoliaPlacement[]): Promise<BulkIndexResult> {
  const client = getAlgoliaAdminClient()
  if (!client) return { indexed: 0, configured: false }
  if (records.length === 0) return { indexed: 0, configured: true }
  try {
    await client.saveObjects({ indexName: UNIVERSITY_PLACEMENTS_INDEX, objects: records as unknown as Record<string, unknown>[] })
    return { indexed: records.length, configured: true }
  } catch (err) {
    console.error('[algoliaService] bulkIndexPlacements failed', err)
    return { indexed: 0, configured: true, error: err instanceof Error ? err.message : 'Algolia write failed' }
  }
}

// ─── ASSETS ──────────────────────────────────────────────────────────────────
// [ALGOLIA ROLLOUT — Tier 1/2 item 11 — new domain, not in the original
// plan] listAssets() already does category/status/search/sort correctly in
// Prisma — same "purely UX" case as the Library Catalog. Worth noting
// alongside this: listAssets() has no pagination at all today
// (unbounded findMany) — a separate, non-Algolia fix worth making too.

export interface AlgoliaAsset {
  objectID:     string
  name:         string
  serialNumber: string | null
  location:     string | null
  category:     string
  status:       string
  acquisitionDate: string | null   // ISO
  acquisitionCost: number | null
}

export async function indexAsset(record: AlgoliaAsset): Promise<void> {
  const client = getAlgoliaAdminClient()
  if (!client) return
  try {
    await client.saveObject({ indexName: ASSETS_INDEX, body: record })
  } catch (err) {
    console.error('[algoliaService] indexAsset failed', err)
  }
}

export async function updateAsset(
  record: Partial<AlgoliaAsset> & { objectID: string },
): Promise<void> {
  const client = getAlgoliaAdminClient()
  if (!client) return
  try {
    await client.partialUpdateObject({
      indexName:  ASSETS_INDEX,
      objectID:   record.objectID,
      attributesToUpdate: record,
    })
  } catch (err) {
    console.error('[algoliaService] updateAsset failed', err)
  }
}

export async function bulkIndexAssets(records: AlgoliaAsset[]): Promise<BulkIndexResult> {
  const client = getAlgoliaAdminClient()
  if (!client) return { indexed: 0, configured: false }
  if (records.length === 0) return { indexed: 0, configured: true }
  try {
    await client.saveObjects({ indexName: ASSETS_INDEX, objects: records as unknown as Record<string, unknown>[] })
    return { indexed: records.length, configured: true }
  } catch (err) {
    console.error('[algoliaService] bulkIndexAssets failed', err)
    return { indexed: 0, configured: true, error: err instanceof Error ? err.message : 'Algolia write failed' }
  }
}

// ─── ANNOUNCEMENTS ───────────────────────────────────────────────────────────
// [ALGOLIA ROLLOUT — Tier 2 item 8] Firestore-backed (COLLECTIONS.
// ANNOUNCEMENTS), not Prisma — sync calls for this one go into
// announcementService.ts's Firestore write functions directly, not a
// Prisma create/update hook. status is a 4-value workflow
// (DRAFT/PENDING_APPROVAL/PUBLISHED/SCHEDULED), not a boolean.

export interface AlgoliaAnnouncement {
  objectID:     string
  title:        string
  status:       string
  // [ALGOLIA ROLLOUT — Tier 2 item 8, correction] The real schema has no
  // `category` field at all — confirmed by reading createAnnouncement()
  // directly. The actual type-of-post facet is `postType`
  // (announcement/event/news/ad), so that's what's indexed here; the
  // plan's "category" facet is this field under a different name.
  postType:     string
  targetRoles:  string[]
  eventDate:    string | null   // ISO
  createdAt:    string          // ISO — for "Newest first"
}

export async function indexAnnouncement(record: AlgoliaAnnouncement): Promise<void> {
  const client = getAlgoliaAdminClient()
  if (!client) return
  try {
    await client.saveObject({ indexName: ANNOUNCEMENTS_INDEX, body: record })
  } catch (err) {
    console.error('[algoliaService] indexAnnouncement failed', err)
  }
}

export async function updateAnnouncement(
  record: Partial<AlgoliaAnnouncement> & { objectID: string },
): Promise<void> {
  const client = getAlgoliaAdminClient()
  if (!client) return
  try {
    await client.partialUpdateObject({
      indexName:  ANNOUNCEMENTS_INDEX,
      objectID:   record.objectID,
      attributesToUpdate: record,
    })
  } catch (err) {
    console.error('[algoliaService] updateAnnouncement failed', err)
  }
}

export async function deleteAnnouncementFromIndex(objectID: string): Promise<void> {
  const client = getAlgoliaAdminClient()
  if (!client) return
  try {
    await client.deleteObject({ indexName: ANNOUNCEMENTS_INDEX, objectID })
  } catch (err) {
    console.error('[algoliaService] deleteAnnouncementFromIndex failed', err)
  }
}

export async function bulkIndexAnnouncements(records: AlgoliaAnnouncement[]): Promise<BulkIndexResult> {
  const client = getAlgoliaAdminClient()
  if (!client) return { indexed: 0, configured: false }
  if (records.length === 0) return { indexed: 0, configured: true }
  try {
    await client.saveObjects({ indexName: ANNOUNCEMENTS_INDEX, objects: records as unknown as Record<string, unknown>[] })
    return { indexed: records.length, configured: true }
  } catch (err) {
    console.error('[algoliaService] bulkIndexAnnouncements failed', err)
    return { indexed: 0, configured: true, error: err instanceof Error ? err.message : 'Algolia write failed' }
  }
}

// ─── BULK SEED ───────────────────────────────────────────────────────────────
// Called once from admin panel or CLI to populate indices from Postgres.

// BulkIndexResult distinguishes two very different failure modes that a
// caller (the admin seed routes) needs to report differently:
//  - configured: false  → ALGOLIA_APP_ID/ALGOLIA_ADMIN_KEY aren't set, so
//    nothing was ever attempted. This used to be silently swallowed and the
//    route reported `indexed: records.length` anyway, which is how the
//    Algolia dashboard could show 0 records while the admin UI claimed
//    success.
//  - configured: true, error set → client existed but the Algolia API call
//    itself failed (bad key, network, index perms, etc).
export interface BulkIndexResult {
  indexed:    number
  configured: boolean
  error?:     string
}

export async function bulkIndexStudents(records: AlgoliaStudent[]): Promise<BulkIndexResult> {
  const client = getAlgoliaAdminClient()
  if (!client) return { indexed: 0, configured: false }
  if (records.length === 0) return { indexed: 0, configured: true }
  try {
    // AlgoliaStudent (and AlgoliaStaff / AlgoliaBook below) is a plain,
    // JSON-serializable interface — string/number/null fields only, no
    // methods or symbols. The Algolia v5 SDK's SaveObjectsOptions.objects
    // requires an index signature (Record<string, unknown>[]), which a
    // named-property interface never structurally satisfies regardless of
    // its field types — a nominal-typing gap in the SDK's own types, not a
    // real safety concern here, so the cast below is safe.
    await client.saveObjects({ indexName: STUDENTS_INDEX, objects: records as unknown as Record<string, unknown>[] })
    return { indexed: records.length, configured: true }
  } catch (err) {
    console.error('[algoliaService] bulkIndexStudents failed', err)
    return { indexed: 0, configured: true, error: err instanceof Error ? err.message : 'Algolia write failed' }
  }
}

export async function bulkIndexStaff(records: AlgoliaStaff[]): Promise<BulkIndexResult> {
  const client = getAlgoliaAdminClient()
  if (!client) return { indexed: 0, configured: false }
  if (records.length === 0) return { indexed: 0, configured: true }
  try {
    // See the comment on bulkIndexStudents above — same nominal-typing gap.
    await client.saveObjects({ indexName: STAFF_INDEX, objects: records as unknown as Record<string, unknown>[] })
    return { indexed: records.length, configured: true }
  } catch (err) {
    console.error('[algoliaService] bulkIndexStaff failed', err)
    return { indexed: 0, configured: true, error: err instanceof Error ? err.message : 'Algolia write failed' }
  }
}

export async function bulkIndexBooks(records: AlgoliaBook[]): Promise<BulkIndexResult> {
  const client = getAlgoliaAdminClient()
  if (!client) return { indexed: 0, configured: false }
  if (records.length === 0) return { indexed: 0, configured: true }
  try {
    // See the comment on bulkIndexStudents above — same nominal-typing gap.
    await client.saveObjects({ indexName: BOOKS_INDEX, objects: records as unknown as Record<string, unknown>[] })
    return { indexed: records.length, configured: true }
  } catch (err) {
    console.error('[algoliaService] bulkIndexBooks failed', err)
    return { indexed: 0, configured: true, error: err instanceof Error ? err.message : 'Algolia write failed' }
  }
}

// ─── LIVE SEARCH ─────────────────────────────────────────────────────────────
// This is the actual read path GlobalSearch.tsx / library BorrowerPicker hit.
//
// Historically nothing in the app ever called search()/searchSingleIndex()
// on the Algolia client — indexStudent/indexStaff/indexBook etc. only ever
// WROTE to Algolia. The route at server/routes/search.ts always called
// fallbackSearch() (Postgres `contains`) unconditionally, so despite records
// being indexed, no query ever reached Algolia. algoliaSearch() below is the
// missing read side; the route now tries this first and only drops to
// fallbackSearch() when Algolia is unconfigured or the request fails.
//
// Uses the admin client rather than a public search-only key: there is no
// NEXT_PUBLIC_ALGOLIA_SEARCH_KEY configured for this project, this call is
// server-side only (the admin key never reaches the browser), and the route
// calling it is already gated by verifyAuth + 'search.globalSearch'.
export interface SearchAllResult {
  students: { id: string; fullName: string; registrationNo: string; className: string | null }[]
  staff:    { id: string; fullName: string; role: string; department: string }[]
  books:    { id: string; title: string; author: string; category: string }[]
}

export async function algoliaSearch(query: string, limit = 8): Promise<SearchAllResult | null> {
  const client = getAlgoliaAdminClient()
  if (!client) return null
  try {
    const { results } = await client.search<Record<string, unknown>>({
      requests: [
        { indexName: STUDENTS_INDEX, query, hitsPerPage: limit },
        { indexName: STAFF_INDEX,    query, hitsPerPage: limit },
        { indexName: BOOKS_INDEX,    query, hitsPerPage: limit },
      ],
    })

    // v5 SDK: each entry in `results` is a per-request result carrying its
    // own `hits` array, in the same order the requests were submitted.
    const [studentRes, staffRes, bookRes] = results as unknown as {
      hits: Record<string, unknown>[]
    }[]

    return {
      students: (studentRes?.hits ?? []).map((h) => ({
        id:             String(h.objectID),
        fullName:       String(h.fullName ?? ''),
        registrationNo: String(h.registrationNo ?? ''),
        className:      (h.className as string | null) ?? null,
      })),
      staff: (staffRes?.hits ?? []).map((h) => ({
        id:         String(h.objectID),
        fullName:   String(h.fullName ?? ''),
        role:       String(h.role ?? ''),
        department: String(h.department ?? ''),
      })),
      books: (bookRes?.hits ?? []).map((h) => ({
        id:       String(h.objectID),
        title:    String(h.title ?? ''),
        author:   String(h.author ?? ''),
        category: String(h.category ?? ''),
      })),
    }
  } catch (err) {
    console.error('[algoliaService] algoliaSearch failed', err)
    return null
  }
}

// ─── GRACEFUL FALLBACK SEARCH ────────────────────────────────────────────────
// Used when Algolia is unavailable — falls back to Prisma contains queries.

import { prisma } from '@/lib/prisma'

export async function fallbackSearch(query: string, limit = 8): Promise<{
  students: { id: string; fullName: string; registrationNo: string; className: string | null }[]
  staff:    { id: string; fullName: string; role: string; department: string }[]
  books:    { id: string; title: string; author: string; category: string }[]
}> {
  const q = query.trim()
  if (!q) return { students: [], staff: [], books: [] }

  const [students, staff, books] = await Promise.all([
    prisma.student.findMany({
      where: {
        OR: [
          { firstName:      { contains: q, mode: 'insensitive' } },
          { lastName:       { contains: q, mode: 'insensitive' } },
          { registrationNo: { contains: q, mode: 'insensitive' } },
        ],
      },
      include: { class: { select: { name: true } } },
      take: limit,
    }),
    prisma.staffProfile.findMany({
      where: {
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName:  { contains: q, mode: 'insensitive' } },
        ],
      },
      take: limit,
    }),
    prisma.book.findMany({
      where: {
        OR: [
          { title:  { contains: q, mode: 'insensitive' } },
          { author: { contains: q, mode: 'insensitive' } },
          { isbn:   { contains: q, mode: 'insensitive' } },
        ],
      },
      take: limit,
    }),
  ])

  return {
    students: students.map((s) => ({
      id:             s.id,
      fullName:       `${s.firstName} ${s.lastName}`,
      registrationNo: s.registrationNo,
      className:      (s as typeof s & { class: { name: string } | null }).class?.name ?? null,
    })),
    staff: staff.map((s) => ({
      id:         s.id,
      fullName:   `${s.firstName} ${s.lastName}`,
      role:       s.role,
      department: s.department,
    })),
    books: books.map((b) => ({
      id:       b.id,
      title:    b.title,
      author:   b.author,
      category: b.category,
    })),
  }
}