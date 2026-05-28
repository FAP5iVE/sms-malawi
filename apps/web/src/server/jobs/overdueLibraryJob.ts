import { markOverdueBorrowings } from '@/server/services/libraryService'
import { logger } from '@/lib/logger'

export async function overdueLibraryJob(): Promise<void> {
  const count = await markOverdueBorrowings()
  logger.info({ event: 'overdue_library.processed', count })
}