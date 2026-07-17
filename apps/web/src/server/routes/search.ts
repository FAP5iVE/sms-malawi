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
import { fallbackSearch }     from '@/server/services/algoliaService'

export const searchRouter = Router()

searchRouter.get('/fallback',
  verifyAuth,
  requirePermission('search.globalSearch'),
  async (req, res) => {
    const query = String(req.query.q ?? '').trim()
    if (query.length < 2) return res.json({ students: [], staff: [], books: [] })
    res.json(await fallbackSearch(query, 8))
  },
)