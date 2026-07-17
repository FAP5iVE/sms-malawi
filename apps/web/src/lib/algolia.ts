import { algoliasearch } from 'algoliasearch'

const APP_ID  = process.env.NEXT_PUBLIC_ALGOLIA_APP_ID  ?? ''
const API_KEY = process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_KEY ?? ''

export const algoliaClient      = algoliasearch(APP_ID, API_KEY)
export const STUDENTS_INDEX     = 'students'
export const STAFF_INDEX        = 'staff_profiles'
export const BOOKS_INDEX        = 'books'

export function getSearchClient() {
  return algoliaClient
}