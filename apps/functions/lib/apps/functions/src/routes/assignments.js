"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assignmentsRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const prisma_1 = require("../lib/prisma");
exports.assignmentsRouter = (0, express_1.Router)({ mergeParams: true });
// GET /classes/:classId/assignments
exports.assignmentsRouter.get('/', auth_1.verifyAuth, async (req, res) => {
    const { classId } = req.params;
    const assignments = await prisma_1.prisma.assignment.findMany({
        where: { classId },
        include: { submissions: { select: { studentId: true, status: true, submittedAt: true } } },
        orderBy: { dueDate: 'asc' },
    });
    return res.json(assignments);
});
// POST /classes/:classId/assignments
exports.assignmentsRouter.post('/', auth_1.verifyAuth, (0, auth_1.requireRole)(['admin', 'high_rank', 'academic']), async (req, res) => {
    const { classId } = req.params;
    const { title, description, subject, dueDate } = req.body;
    const assignment = await prisma_1.prisma.assignment.create({
        data: {
            title,
            description,
            subject,
            dueDate: new Date(dueDate),
            classId,
            createdByUid: req.user.uid,
        },
    });
    return res.status(201).json(assignment);
});
//# sourceMappingURL=assignments.js.map