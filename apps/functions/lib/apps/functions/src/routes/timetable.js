"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.timetableRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const prisma_1 = require("../lib/prisma");
exports.timetableRouter = (0, express_1.Router)();
// GET /timetable?academicYear=2025/2026&term=1&day=MONDAY
exports.timetableRouter.get('/', auth_1.verifyAuth, (0, auth_1.requireRole)(['admin', 'high_rank', 'lower_rank', 'academic', 'exam_officer', 'student']), async (req, res) => {
    const { academicYear = '2025/2026', term = '1', day } = req.query;
    const where = { academicYear, term: Number(term) };
    if (day)
        where.day = day;
    const slots = await prisma_1.prisma.timetableSlot.findMany({
        where,
        include: { class: { select: { name: true, form: true, stream: true } } },
        orderBy: [{ day: 'asc' }, { periodStart: 'asc' }],
    });
    res.json(slots);
});
//# sourceMappingURL=timetable.js.map