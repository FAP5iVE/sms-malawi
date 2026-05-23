"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBudget = createBudget;
exports.getBudgets = getBudgets;
exports.getBudgetVsActual = getBudgetVsActual;
exports.updateBudgetSpent = updateBudgetSpent;
const prisma_1 = require("../lib/prisma");
async function createBudget(data, actorUid) {
    // Explicit spread instead of ...data to satisfy TS strict spread check
    return prisma_1.prisma.budget.create({
        data: {
            academicYear: data.academicYear,
            term: data.term,
            department: data.department,
            category: data.category,
            allocated: data.allocated,
            description: data.description,
            createdByUid: actorUid,
        },
    });
}
async function getBudgets(academicYear) {
    return prisma_1.prisma.budget.findMany({
        where: { academicYear },
        orderBy: [{ department: 'asc' }, { category: 'asc' }],
    });
}
async function getBudgetVsActual(academicYear, term) {
    const budgets = await prisma_1.prisma.budget.findMany({
        where: { academicYear, ...(term ? { term } : {}) },
    });
    const actuals = await prisma_1.prisma.expense.groupBy({
        by: ['category'],
        where: { academicYear, status: 'APPROVED', ...(term ? { term } : {}) },
        _sum: { amount: true },
    });
    const byCategory = Object.fromEntries(actuals.map((a) => [a.category, Number(a._sum.amount ?? 0)]));
    return budgets.map((b) => ({
        department: b.department,
        category: b.category,
        allocated: Number(b.allocated),
        spent: byCategory[b.category] ?? 0,
        remaining: Number(b.allocated) - (byCategory[b.category] ?? 0),
    }));
}
async function updateBudgetSpent(category, academicYear, amount) {
    await prisma_1.prisma.budget.updateMany({
        where: { academicYear, category },
        data: { spent: { increment: amount } },
    });
}
//# sourceMappingURL=budgetService.js.map