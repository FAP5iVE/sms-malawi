import 'server-only'

import { Router, type Request, type Response } from 'express'
import { verifyAuth, requireRole } from '@/lib/verifyAuth'
import {
  requirePermission,
  requireAnyPermission,
} from '@/server/middleware/verifyPermission'
import * as settingsService from '@/server/services/settingsService'
import { SETTING_META, SETTING_KEYS, type SettingKey } from '@shared/types/settings'
import { SETTING_VALUE_SCHEMAS, BatchSettingsUpdateSchema } from '@shared/schemas/settings'
import { hasPermission } from '@shared/types/permissions'

export const settingsRouter = Router()

// ─── PERMISSION MAP PER CATEGORY ─────────────────────────
// Determines which Permission is required to UPDATE settings in each category.
// Read permissions are broader — governed by isPublic and role.
import type { Permission } from '@shared/types/permissions'
import type { SettingCategory } from '@shared/types/settings'

const CATEGORY_UPDATE_PERMISSION: Record<SettingCategory, Permission> = {
  academic:       'settings.manageAcademicPolicy',
  school_identity:'settings.manageAcademicPolicy',
  exam:           'settings.manageExamConfig',
  finance:        'settings.manageFinanceConfig',
  library:        'settings.manageLibraryConfig',
  hr:             'settings.manageHRConfig',
  security:       'settings.manageSecurityConfig',
  system:         'settings.manageSystemConfig',
}

// ─────────────────────────────────────────────────────────
//  GET /settings/identity
//  School identity settings — no auth required.
//  Safe for the public landing page (ISR server-side fetch).
// ─────────────────────────────────────────────────────────

settingsRouter.get('/identity', async (_req: Request, res: Response) => {
  const identity = await settingsService.getIdentitySettings()
  res.json(identity)
})

// ─────────────────────────────────────────────────────────
//  GET /settings/public
//  All settings marked isPublic = true.
//  Any authenticated user may read these.
// ─────────────────────────────────────────────────────────

settingsRouter.get(
  '/public',
  verifyAuth,
  async (_req: Request, res: Response) => {
    const settings = await settingsService.getPublicSettings()
    res.json(settings)
  }
)

// ─────────────────────────────────────────────────────────
//  GET /settings/all
//  All settings with full metadata, grouped by category.
//  Admin and high_rank only.
// ─────────────────────────────────────────────────────────

settingsRouter.get(
  '/all',
  verifyAuth,
  requireAnyPermission([
    'settings.viewSystemConfig',
    'settings.manageAcademicPolicy',
  ]),
  async (_req: Request, res: Response) => {
    const grouped = await settingsService.getAll()
    res.json(grouped)
  }
)

// ─────────────────────────────────────────────────────────
//  GET /settings/:key
//  Single setting value.
//  Access rules:
//    • isPublic settings: any authenticated role
//    • Non-public settings: role must have read permission for that category
// ─────────────────────────────────────────────────────────

settingsRouter.get(
  '/:key',
  verifyAuth,
  async (req: Request, res: Response) => {
    const key = req.params.key as SettingKey

    // Validate the key exists in our schema
    if (!SETTING_META[key]) {
      res.status(404).json({ error: `Unknown setting key: "${key}"` })
      return
    }

    const meta = SETTING_META[key]
    const { user } = req

    // Non-public settings require the update permission for that category
    // (read + write are gated at the same level for non-public settings)
    if (!meta.isPublic && user) {
      const updatePerm = CATEGORY_UPDATE_PERMISSION[meta.category]
      if (!hasPermission(user.role, updatePerm)) {
        // Also allow admin to read any setting (system oversight)
        if (user.role !== 'admin') {
          res.status(403).json({
            error: `You do not have permission to read the "${key}" setting.`,
          })
          return
        }
      }
    }

    const value = await settingsService.get(key)
    res.json({ key, value, category: meta.category, isPublic: meta.isPublic })
  }
)

// ─────────────────────────────────────────────────────────
//  PATCH /settings/:key
//  Update a single setting value.
//  The required permission is determined by the setting's category.
// ─────────────────────────────────────────────────────────

settingsRouter.patch(
  '/:key',
  verifyAuth,
  async (req: Request, res: Response) => {
    const key = req.params.key as SettingKey

    if (!SETTING_META[key]) {
      res.status(404).json({ error: `Unknown setting key: "${key}"` })
      return
    }

    const meta = SETTING_META[key]
    const { user } = req

    if (!user) {
      res.status(401).json({ error: 'Not authenticated.' })
      return
    }

    // Check category-specific update permission
    const updatePerm = CATEGORY_UPDATE_PERMISSION[meta.category]
    if (!hasPermission(user.role, updatePerm)) {
      res.status(403).json({
        error: `You do not have permission to update settings in the "${meta.category}" category.`,
        required: updatePerm,
        role: user.role,
      })
      return
    }

    // Validate the incoming value against the setting's Zod schema
    const schema = SETTING_VALUE_SCHEMAS[key]
    if (!schema) {
        res.status(500).json({ error: `No schema registered for setting "${key}".` })
        return
      }
    const parsed = schema.safeParse(req.body.value)
    if (!parsed.success) {
      res.status(400).json({
        error: `Invalid value for setting "${key}".`,
        issues: parsed.error.flatten(),
      })
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await settingsService.set(key, parsed.data as any, user.uid)

    res.json({
      key,
      value: parsed.data,
      updatedByUid: user.uid,
      updatedAt: new Date().toISOString(),
    })
  }
)

// ─────────────────────────────────────────────────────────
//  POST /settings/batch
//  Update multiple settings in a single atomic transaction.
//  Each setting's category permission is checked individually.
//  Admin-only — widest permission scope, safest to restrict.
// ─────────────────────────────────────────────────────────

settingsRouter.post(
  '/batch',
  verifyAuth,
  requirePermission('settings.manageSystemConfig'),
  async (req: Request, res: Response) => {
    const parsed = BatchSettingsUpdateSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid batch update payload.', issues: parsed.error.flatten() })
      return
    }

    const { updates } = parsed.data
    const { user } = req

    if (!user) {
      res.status(401).json({ error: 'Not authenticated.' })
      return
    }

    // Validate each key exists and user has permission for its category
    for (const { key } of updates) {
      const meta = SETTING_META[key as SettingKey]
      if (!meta) {
        res.status(400).json({ error: `Unknown setting key: "${key}"` })
        return
      }
      const updatePerm = CATEGORY_UPDATE_PERMISSION[meta.category]
      if (!hasPermission(user.role, updatePerm)) {
        res.status(403).json({
          error: `No permission to update setting "${key}" (category: ${meta.category}).`,
          required: updatePerm,
        })
        return
      }
    }

    await settingsService.setMany(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      updates.map((u) => ({ key: u.key as SettingKey, value: u.value as any })),
      user.uid
    )

    res.json({
      updated: updates.map((u) => u.key),
      count: updates.length,
      updatedAt: new Date().toISOString(),
    })
  }
)

// ─────────────────────────────────────────────────────────
//  POST /settings/seed
//  Seed all default setting values for any missing keys.
//  Idempotent — safe to call repeatedly. Admin only.
// ─────────────────────────────────────────────────────────

settingsRouter.post(
  '/seed',
  verifyAuth,
  requireRole(['admin']),
  async (_req: Request, res: Response) => {
    const result = await settingsService.seedDefaults()
    res.json(result)
  }
)

// ─────────────────────────────────────────────────────────
//  POST /settings/cache/invalidate
//  Invalidate the module-level settings cache.
//  Useful after bulk database changes or admin imports. Admin only.
// ─────────────────────────────────────────────────────────

settingsRouter.post(
  '/cache/invalidate',
  verifyAuth,
  requireRole(['admin']),
  async (req: Request, res: Response) => {
    const { key } = req.body as { key?: string }

    if (key) {
      if (!SETTING_META[key as SettingKey]) {
        res.status(400).json({ error: `Unknown setting key: "${key}"` })
        return
      }
      settingsService.invalidate(key as SettingKey)
      res.json({ invalidated: [key] })
    } else {
      settingsService.invalidateAll()
      res.json({ invalidated: 'all' })
    }
  }
)