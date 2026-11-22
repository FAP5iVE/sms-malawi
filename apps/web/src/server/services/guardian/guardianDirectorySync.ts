/**
 * [FILE]: apps/web/src/server/services/guardian/guardianDirectorySync.ts
 * [PURPOSE]: The hooks studentService calls when a guardian CONTACT CARD is created,
 *   edited or removed, so the guardian portal never drifts from the school record.
 *
 *   Two different failure policies, on purpose:
 *
 *   - syncAfterWrite  (create / add / update)  BEST EFFORT, runs after the staff
 *     transaction has committed and NEVER throws. A miss is harmless: it can only
 *     mean a card has no proposal yet, or an edit is not yet flagged, and the next
 *     sync (every sync re-checks the whole student) repairs it. Staff work is never
 *     blocked by the portal.
 *
 *   - guardRemovalInTx (delete)  FAIL CLOSED, runs INSIDE the delete's transaction and
 *     before the row is deleted. If a guardian's access could not be suspended, the card
 *     must not be removed (otherwise the foreign key would orphan an ACTIVE link and
 *     nothing would ever suspend it). The error propagates and aborts the delete.
 */
import 'server-only'
import type { Prisma } from '@prisma/client'
import { logger } from '@/lib/logger'
import * as auditService from '@/server/services/auditService'
import type { Actor, AuditRecord, GuardianDb } from './db'
import { prismaGuardianDb } from './prismaDb'
import { suspendLinksForRemovedCard, syncStudentDirectory } from './guardianIdentityService'

/** Writes audit records after the transaction that produced them has committed. Never throws. */
export async function emitAudit(records: readonly AuditRecord[]): Promise<void> {
  for (const r of records) {
    try {
      await auditService.log(r)
    } catch (err) {
      logger.error({ event: 'guardian.audit_failed', action: r.action, entityId: r.entityId, err }, '[guardianDirectorySync] audit write failed')
    }
  }
}

/** Propose any card without a link, drift-check the rest. Best effort: never throws. */
export async function syncAfterWrite(studentId: string, actor: Actor, source: 'ADMISSION' | 'STAFF'): Promise<void> {
  try {
    const result = await syncStudentDirectory(prismaGuardianDb(), studentId, { actor, source })
    await emitAudit(result.audit)
  } catch (err) {
    logger.error(
      { event: 'guardian.directory_sync_failed', studentId, err },
      '[guardianDirectorySync] sync failed; the next sync or reconcile pass will repair it',
    )
  }
}

/**
 * Call inside the delete transaction, BEFORE deleting the card. Returns the audit
 * records to emit once the transaction commits. Throws (aborting the delete) on failure.
 */
export async function guardRemovalInTx(tx: Prisma.TransactionClient, cardId: string, actor: Actor): Promise<AuditRecord[]> {
  const result = await suspendLinksForRemovedCard(tx as unknown as GuardianDb, cardId, { actor })
  return result.audit
}
