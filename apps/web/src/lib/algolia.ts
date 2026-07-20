import { algoliasearch, type Algoliasearch } from 'algoliasearch'

const APP_ID  = process.env.NEXT_PUBLIC_ALGOLIA_APP_ID     ?? ''
const API_KEY = process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_KEY ?? ''

export const STUDENTS_INDEX     = 'students'
export const STAFF_INDEX        = 'staff_profiles'
export const BOOKS_INDEX        = 'books'

// Lazy singleton — mirrors algoliaService.ts's getAlgoliaAdminClient() /
// lib/email.ts's getResendClient() pattern. algoliasearch() throws
// synchronously ("`appId` is missing.") on an empty appId; deferring
// construction to first call avoids that if this ever gets a real consumer
// while NEXT_PUBLIC_ALGOLIA_APP_ID is unset.
let _searchClient: Algoliasearch | null = null

export function getSearchClient(): Algoliasearch | null {
  if (_searchClient) return _searchClient
  if (!APP_ID || !API_KEY) return null
  _searchClient = algoliasearch(APP_ID, API_KEY)
  return _searchClient
}