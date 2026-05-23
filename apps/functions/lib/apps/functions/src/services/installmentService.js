"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInstallmentPlan = createInstallmentPlan;
exports.getInstallmentPlan = getInstallmentPlan;
exports.markOverdueInstallments = markOverdueInstallments;
const prisma_1 = require("../lib/prisma");
const logger_1 = require("../lib/logger");
const date_fns_1 = require("date-fns");
// Create an installment plan for an invoice
async function createInstallmentPlan(invoiceId, frequency, count, // number of installments e.g. 3 for term-wise, 6 for bi-monthly
startDate, actorUid) {
    const invoice = await prisma_1.prisma.invoice.findUniqueOrThrow({
        where: { id: invoiceId },
    });
    if (invoice.status === 'PAID') {
        throw new Error('Cannot create installment plan for a fully paid invoice');
    }
    // Check no plan already exists
    const existing = await prisma_1.prisma.installmentPlan.findUnique({ where: { invoiceId } });
    if (existing)
        throw new Error('Installment plan already exists for this invoice');
    const totalAmount = Number(invoice.balance);
    const baseAmount = Math.floor((totalAmount / count) * 100) / 100;
    const lastAmount = totalAmount - baseAmount * (count - 1); // absorb rounding diff
    const plan = await prisma_1.prisma.installmentPlan.create({
        data: { invoiceId, totalAmount, createdByUid: actorUid },
    });
    const installmentData = Array.from({ length: count }, (_, i) => {
        const dueDate = frequency === 'MONTHLY' ? (0, date_fns_1.addMonths)(startDate, i) : (0, date_fns_1.addWeeks)(startDate, i * 16); // ~term length
        return {
            planId: plan.id,
            dueDate,
            amount: i === count - 1 ? lastAmount : baseAmount,
            status: 'PENDING',
        };
    });
    await prisma_1.prisma.installment.createMany({ data: installmentData });
    logger_1.logger.info({
        event: 'installment_plan.created',
        planId: plan.id,
        invoiceId,
        count,
        frequency,
        actorUid,
    });
    return plan.id;
}
async function getInstallmentPlan(invoiceId) {
    return prisma_1.prisma.installmentPlan.findUnique({
        where: { invoiceId },
        include: { installments: { orderBy: { dueDate: 'asc' } } },
    });
}
// Mark overdue installments — called by Cloud Scheduler daily
async function markOverdueInstallments() {
    const result = await prisma_1.prisma.installment.updateMany({
        where: {
            status: 'PENDING',
            dueDate: { lt: new Date() },
        },
        data: { status: 'OVERDUE' },
    });
    logger_1.logger.info({ event: 'installments.overdue_marked', count: result.count });
    return result.count;
}
//# sourceMappingURL=installmentService.js.map