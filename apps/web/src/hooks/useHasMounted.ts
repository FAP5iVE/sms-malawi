/**
 * apps/web/src/hooks/useHasMounted.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: Replaces the `useState(false)` + `useEffect(() => setMounted(true), [])`
 *   "mounted guard" pattern used to avoid a hydration mismatch with
 *   next-themes (server doesn't know the visitor's stored theme preference
 *   yet, so client-only theme-dependent UI must wait one tick past hydration
 *   before rendering). That pattern calls setState synchronously inside an
 *   effect body, which react-hooks/set-state-in-effect correctly flags as a
 *   cascading-render risk in the general case.
 *
 *   useSyncExternalStore's server/client snapshot split is the mechanism
 *   React itself ships for this exact situation: the server snapshot is
 *   always `false` (SSR has no notion of "mounted"), the client snapshot is
 *   always `true` once hydration has happened. No setState call is ever
 *   made — React manages the transition internally — so there is no
 *   cascading-render risk and no lint violation.
 *
 * [USAGE]:
 *   const mounted = useHasMounted()
 *   if (!mounted) return <Skeleton /> // or an inert placeholder
 */

import { useSyncExternalStore } from 'react'

// No external store actually changes here — "mounted" transitions exactly
// once, automatically, between the server and client snapshots themselves.
const emptySubscribe = () => () => {}

export function useHasMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  )
}