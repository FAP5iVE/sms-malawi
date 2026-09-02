/**
 * apps/web/src/server/routes/search.ts
 *
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R4 — Auth/Security Domain
 * [PURPOSE]: GET /fallback was gated by verifyAuth alone — any authenticated
 *   user of any of the 9 roles could retrieve any student's full name,
 *   registration number, and class, or any staff member's full name, role,
 *   and department, school-wide, with no scoping. Now requires
 *   'search.globalSearch', granted only to the six staff roles with a
 *   confirmed legitimate school-wide lookup need (see the role-mapping
 *   decision documented in packages/shared/types/permissions.ts's header
 *   comment). student and lower_rank are excluded.
 * [DEPENDS ON]: R4's own edit to packages/shared/types/permissions.ts
 *   (adds the 'search.globalSearch' permission this route now requires).
 */
import { Router }             from 'express'
import { verifyAuth }         from '@/lib/verifyAuth'
import { requirePermission }  from '@/server/middleware/verifyPermission'
import { algoliaSearch, fallbackSearch } from '@/server/services/algoliaService'

export const searchRouter = Router()

// [FIX] This route previously called fallbackSearch() (Postgres `contains`)
// unconditionally — Algolia was fully wired for indexing (writes) but had
// no consumer on the read side, so every search in the app bypassed Algolia
// entirely regardless of how well the indices were seeded. Now Algolia is
// queried first; fallbackSearch() only runs when Algolia isn't configured
// or the request to it fails, so it's an actual fallback again rather than
// the only path. Route name/path kept as `/fallback` to avoid touching the
// two existing call sites (GlobalSearch.tsx, library page BorrowerPicker).
searchRouter.get('/fallback',
  verifyAuth,
  requirePermission('search.globalSearch'),
  async (req, res) => {
    const query = String(req.query.q ?? '').trim()
    if (query.length < 2) return res.json({ students: [], staff: [], books: [] })
    const viaAlgolia = await algoliaSearch(query, 8)
    res.json(viaAlgolia ?? await fallbackSearch(query, 8))
  },
)