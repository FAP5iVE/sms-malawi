import { Router } from 'express'
import { verifyAuth, requireRole } from '@/lib/verifyAuth'
import { CreateUserSchema, UpdateUserRoleSchema, NotificationPrefSchema } from '@shared/schemas/admin'
import * as userService from '@/server/services/userManagementService'
import type { UserRole } from '@shared/types/roles'

export const usersRouter = Router()

// GET /users — list all Firebase Auth users (admin only)
usersRouter.get('/', verifyAuth, requireRole(['admin']),
  async (req, res) => {
    const { pageToken } = req.query as { pageToken?: string }
    return res.json(await userService.listUsers(pageToken))
  })

// POST /users — create user, send temp password email (admin only)
usersRouter.post('/', verifyAuth, requireRole(['admin']),
  async (req, res) => {
    const parsed = CreateUserSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    try {
      return res.status(201).json(await userService.createUser(parsed.data, req.user!.uid))
    } catch (err: unknown) {
      const e = err as Error & { code?: string }
      if (e.code === 'auth/email-already-exists')
        return res.status(409).json({ error: 'A user with this email already exists.' })
      throw e
    }
  })

// PATCH /users/role — change a user's role
usersRouter.patch('/role', verifyAuth, requireRole(['admin']),
  async (req, res) => {
    const parsed = UpdateUserRoleSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.json(await userService.updateUserRole(parsed.data.uid, parsed.data.role as UserRole, req.user!.uid))
  })

// PATCH /users/:uid/disable
usersRouter.patch('/:uid/disable', verifyAuth, requireRole(['admin']),
  async (req, res) => {
    const { disabled } = req.body as { disabled: boolean }
    await userService.toggleUserDisabled(String(req.params.uid), disabled, req.user!.uid)
    return res.json({ success: true })
  })

// POST /users/:uid/reset-password
usersRouter.post('/:uid/reset-password', verifyAuth, requireRole(['admin']),
  async (req, res) => {
    await userService.sendPasswordReset(String(req.params.uid))
    return res.json({ success: true })
  })

// GET /users/me/notification-prefs
usersRouter.get('/me/notification-prefs', verifyAuth,
  async (req, res) => res.json(await userService.getNotificationPrefs(req.user!.uid)))

// PATCH /users/me/notification-prefs
usersRouter.patch('/me/notification-prefs', verifyAuth,
  async (req, res) => {
    const parsed = NotificationPrefSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.json(await userService.updateNotificationPrefs(req.user!.uid, parsed.data))
  })