import type { UserRole } from '@shared/types/roles'

declare global {
  namespace Express {
    interface Request {
      user?: {
        uid: string
        role: UserRole
        email: string
      }
    }
  }
}

export {}  // makes this a module so the global augmentation is applied
