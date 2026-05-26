import { markOverdueInstallments } from '@/server/services/installmentService'
import { logger } from '@/lib/logger'

export async function dailyInstallmentCheckJob(): Promise<{ count: number }> {
  const count = await markOverdueInstallments()
  logger.info({ event: 'installments.overdue_checked', count })
  return { count }
}