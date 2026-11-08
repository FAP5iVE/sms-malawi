/**
 * [FILE]: apps/web/src/server/services/guardian/db.ts
 * [PURPOSE]: The narrow database surface the guardian-portal services depend on.
 *
 *   The services take a `GuardianDb` instead of importing the Prisma client, so the
 *   security-critical logic (claiming a code exactly once, the per-request access
 *   decision, onboarding rollback) can be exercised against an in-memory
 *   implementation with real transaction rollback, and so a service can run inside a
 *   caller's `prisma.$transaction(tx => ...)` simply by being handed `tx`.
 *
 *   Production wiring is ONE cast, in `prismaDb.ts` (kept separate so importing this
 *   file never loads the Prisma client or its environment validation): Prisma's
 *   delegates are a structural superset of these methods. Method arguments are intentionally loose
 *   (`any`): the Prisma types are not available to this layer and every query lives
 *   in the services next to a test.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Delegate {
  findUnique(args: any): Promise<any>
  findFirst(args?: any): Promise<any>
  findMany(args?: any): Promise<any[]>
  create(args: any): Promise<any>
  createMany?(args: any): Promise<{ count: number }>
  update(args: any): Promise<any>
  updateMany(args: any): Promise<{ count: number }>
  delete(args: any): Promise<any>
  deleteMany(args: any): Promise<{ count: number }>
  count(args?: any): Promise<number>
}

export interface GuardianDb {
  guardianProfile: Delegate
  guardianContact: Delegate
  guardianLink: Delegate
  guardianInvitation: Delegate
  guardianLinkRequest: Delegate
  guardianOnboardingBatch: Delegate
  guardianOnboardingItem: Delegate
  guardianAccessLog: Delegate
  studentGuardian: Delegate
  student: Delegate
  class: Delegate
  termResult: Delegate
  exam: Delegate
  examMark: Delegate
  invoice: Delegate
  payment: Delegate
  attendance: Delegate
  $transaction<T>(fn: (tx: GuardianDb) => Promise<T>): Promise<T>
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Prisma's unique-constraint error code, shared by services and the in-memory db. */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002'
}

/** Actor performing a staff action. */
export interface Actor {
  uid: string
  role: string
}

export interface AuditRecord {
  action: string
  entityType: string
  entityId: string
  actorUid: string
  actorRole: string
  metadata?: Record<string, unknown>
}

/** Audit sink. Production: auditService.log. Tests: an array push. */
export type AuditSink = (entry: AuditRecord) => Promise<void> | void
