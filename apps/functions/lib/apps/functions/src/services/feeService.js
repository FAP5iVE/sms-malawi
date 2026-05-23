"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkBalanceGate = checkBalanceGate;
exports.getStudentBalance = getStudentBalance;
exports.generateInvoice = generateInvoice;
exports.recordPayment = recordPayment;
exports.applyLatePenalties = applyLatePenalties;
exports.getFinanceSummary = getFinanceSummary;
const prisma_1 = require("../lib/prisma");
const logger_1 = require("../lib/logger");
const receiptService_1 = require("./receiptService");
// ---------------------------------------------------------
// CRITICAL: FEE GATE — called by examService before every
// result query. Returns true if student can see results.
// Returns false if balance > 0 for the given term/year.
// ---------------------------------------------------------
async function checkBalanceGate(studentId, term, academicYear) {
    const invoice = await prisma_1.prisma.invoice.findUnique({
        where: { studentId_academicYear_term: { studentId, academicYear, term } },
        select: { balance: true, status: true },
    });
    // No invoice found → no fees charged → gate is open
    if (!invoice)
        return true;
    // Balance must be exactly 0 to pass the gate
    const balance = Number(invoice.balance);
    const gateOpen = balance <= 0;
    logger_1.logger.info({
        event: 'fee_gate_check',
        studentId,
        academicYear,
        term,
        balance,
        gateOpen,
    });
    return gateOpen;
}
// --- GET STUDENT BALANCE ---------------------------------
async function getStudentBalance(studentId, academicYear) {
    const invoices = await prisma_1.prisma.invoice.findMany({
        where: { studentId, academicYear },
        orderBy: { term: 'asc' },
    });
    const totalBalance = invoices.reduce((sum, inv) => sum + Number(inv.balance), 0);
    return { invoices, totalBalance };
}
// --- GENERATE INVOICE FOR STUDENT/TERM -------------------
async function generateInvoice(data, actorUid, actorRole) {
    // Check for existing invoice
    const existing = await prisma_1.prisma.invoice.findUnique({
        where: {
            studentId_academicYear_term: {
                studentId: data.studentId,
                academicYear: data.academicYear,
                term: data.term,
            },
        },
    });
    if (existing)
        throw new Error('Invoice already exists for this term');
    // Get applicable fee structures for this student's class + year + term
    const student = await prisma_1.prisma.student.findUniqueOrThrow({
        where: { id: data.studentId },
        select: { classId: true },
    });
    const feeStructures = await prisma_1.prisma.feeStructure.findMany({
        where: {
            academicYear: data.academicYear,
            isActive: true,
            OR: [{ classId: null }, { classId: student.classId ?? undefined }],
            AND: [{ OR: [{ term: null }, { term: data.term }] }],
        },
    });
    const subtotal = feeStructures.reduce((sum, f) => sum + Number(f.amount), 0);
    // Apply scholarship if exists
    const scholarship = await prisma_1.prisma.scholarship.findFirst({
        where: { studentId: data.studentId, academicYear: data.academicYear, isActive: true },
    });
    let discount = 0;
    if (scholarship) {
        discount =
            scholarship.discountType === 'PERCENTAGE'
                ? subtotal * (Number(scholarship.value) / 100)
                : Number(scholarship.value);
    }
    const totalAmount = Math.max(0, subtotal - discount);
    const invoice = await prisma_1.prisma.invoice.create({
        data: {
            studentId: data.studentId,
            academicYear: data.academicYear,
            term: data.term,
            subtotal,
            discount,
            latePenalty: 0,
            totalAmount,
            paidAmount: 0,
            balance: totalAmount,
            status: 'UNPAID',
            dueDate: new Date(data.dueDate),
            scholarshipId: scholarship?.id,
        },
    });
    logger_1.logger.info({
        event: 'invoice.generated',
        invoiceId: invoice.id,
        studentId: data.studentId,
        totalAmount,
        actorUid,
        actorRole,
    });
    return invoice;
}
// --- RECORD PAYMENT --------------------------------------
async function recordPayment(data, actorUid, actorRole) {
    const invoice = await prisma_1.prisma.invoice.findUniqueOrThrow({
        where: { id: data.invoiceId },
        include: { payments: true },
    });
    // Validate amount doesn't exceed outstanding balance
    if (data.amount > Number(invoice.balance)) {
        throw new Error(`Payment MWK ${data.amount} exceeds outstanding balance MWK ${invoice.balance}`);
    }
    // Create payment record in transaction
    const [payment, updatedInvoice] = await prisma_1.prisma.$transaction(async (tx) => {
        const p = await tx.payment.create({
            data: {
                invoiceId: data.invoiceId,
                amount: data.amount,
                method: data.method,
                reference: data.reference,
                notes: data.notes,
                recordedByUid: actorUid,
            },
        });
        const newPaid = Number(invoice.paidAmount) + data.amount;
        const newBalance = Number(invoice.totalAmount) - newPaid;
        const newStatus = newBalance <= 0 ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'UNPAID';
        const inv = await tx.invoice.update({
            where: { id: data.invoiceId },
            data: { paidAmount: newPaid, balance: newBalance, status: newStatus },
        });
        return [p, inv];
    });
    // Generate receipt PDF — non-critical: log failure but don't rethrow
    let receiptKey;
    try {
        receiptKey = await (0, receiptService_1.generateReceipt)(payment.id, invoice, data.amount, actorUid);
        await prisma_1.prisma.payment.update({
            where: { id: payment.id },
            data: { receiptKey },
        });
    }
    catch (err) {
        logger_1.logger.error({ event: 'receipt.generation_failed', paymentId: payment.id, err });
    }
    logger_1.logger.info({
        event: 'payment.recorded',
        paymentId: payment.id,
        invoiceId: data.invoiceId,
        amount: data.amount,
        method: data.method,
        actorUid,
        actorRole,
    });
    return { payment: { ...payment, receiptKey }, invoice: updatedInvoice };
}
// --- APPLY LATE PENALTY ----------------------------------
// Called by Cloud Scheduler daily (scheduledJobs.ts).
// Penalises outstanding balance (not gross total) and guards
// against double-penalising via latePenalty: { equals: 0 }.
// penaltyRate: 0.05 = 5%
async function applyLatePenalties(penaltyRate = 0.05) {
    const overdue = await prisma_1.prisma.invoice.findMany({
        where: {
            status: { in: ['UNPAID', 'PARTIAL'] },
            dueDate: { lt: new Date() },
            latePenalty: { equals: 0 }, // prevents double-penalising if job runs twice
        },
    });
    for (const inv of overdue) {
        const penalty = Number(inv.balance) * penaltyRate; // penalise outstanding, not gross
        await prisma_1.prisma.invoice.update({
            where: { id: inv.id },
            data: {
                latePenalty: { increment: penalty }, // safe for concurrent writes
                totalAmount: { increment: penalty },
                balance: { increment: penalty },
                status: 'OVERDUE',
            },
        });
    }
    logger_1.logger.info({ event: 'late_penalties.applied', count: overdue.length, rate: penaltyRate });
    return overdue.length;
}
// --- FINANCE SUMMARY (dashboard widget) ------------------
async function getFinanceSummary(academicYear, term) {
    const invoices = await prisma_1.prisma.invoice.findMany({
        where: { academicYear, term },
        select: { totalAmount: true, paidAmount: true, balance: true },
    });
    const totalCollected = invoices.reduce((s, i) => s + Number(i.paidAmount), 0);
    const totalOutstanding = invoices.reduce((s, i) => s + Number(i.balance), 0);
    const collectionTarget = invoices.reduce((s, i) => s + Number(i.totalAmount), 0);
    const collectionPercent = collectionTarget > 0 ? Math.round((totalCollected / collectionTarget) * 100) : 0;
    const expenses = await prisma_1.prisma.expense.aggregate({
        where: { academicYear, term, status: 'APPROVED' },
        _sum: { amount: true },
    });
    return {
        totalCollected,
        totalOutstanding,
        totalExpenses: Number(expenses._sum.amount ?? 0),
        collectionTarget,
        collectionPercent,
    };
}
//# sourceMappingURL=feeService.js.map