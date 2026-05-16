"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateTimetableSlotSchema = exports.CreateClassSchema = exports.CreateApplicationSchema = exports.ApplicationStatusSchema = exports.UpdateStudentSchema = exports.CreateStudentSchema = exports.SexSchema = exports.StudentStatusSchema = void 0;
const zod_1 = require("zod");
// ─── ENUMS ───────────────────────────────────────────────
exports.StudentStatusSchema = zod_1.z.enum([
    'ACTIVE',
    'AWAITING_MANEB_RESULTS',
    'GRADUATED',
    'ARCHIVED',
]);
exports.SexSchema = zod_1.z.enum(['MALE', 'FEMALE']);
// ─── CREATE STUDENT ──────────────────────────────────────
exports.CreateStudentSchema = zod_1.z.object({
    firstName: zod_1.z.string().min(1, 'First name required').max(100),
    lastName: zod_1.z.string().min(1, 'Last name required').max(100),
    dateOfBirth: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
    sex: exports.SexSchema,
    nationality: zod_1.z.string().min(1).default('Malawian'),
    district: zod_1.z.string().min(1, 'District required'),
    village: zod_1.z.string().optional(),
    address: zod_1.z.string().optional(),
    phone: zod_1.z.string().optional(),
    guardianName: zod_1.z.string().min(1, 'Guardian name required'),
    guardianPhone: zod_1.z.string().min(10, 'Valid guardian phone required'),
    guardianRelation: zod_1.z.string().min(1, 'Relationship required'),
    classId: zod_1.z.string().optional(),
});
exports.UpdateStudentSchema = exports.CreateStudentSchema.partial().extend({
    status: exports.StudentStatusSchema.optional(),
});
// ─── APPLICATION ─────────────────────────────────────────
exports.ApplicationStatusSchema = zod_1.z.enum([
    'PENDING',
    'APPROVED',
    'DENIED',
    'AWAITING_ADMISSION',
    'ADMITTED',
]);
exports.CreateApplicationSchema = zod_1.z.object({
    firstName: zod_1.z.string().min(1).max(100),
    lastName: zod_1.z.string().min(1).max(100),
    dateOfBirth: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    sex: exports.SexSchema,
    nationality: zod_1.z.string().min(1),
    district: zod_1.z.string().min(1),
    village: zod_1.z.string().optional(),
    guardianName: zod_1.z.string().min(1),
    guardianPhone: zod_1.z.string().min(10),
    guardianRelation: zod_1.z.string().min(1),
    applyingForForm: zod_1.z.number().int().min(1).max(4),
});
// ─── CLASS ───────────────────────────────────────────────
exports.CreateClassSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    form: zod_1.z.number().int().min(1).max(4),
    stream: zod_1.z.string().optional(),
    teacherId: zod_1.z.string().optional(),
    room: zod_1.z.string().optional(),
    academicYear: zod_1.z.string().regex(/^\d{4}\/\d{4}$/, 'Format: 2025/2026'),
});
// ─── TIMETABLE SLOT ──────────────────────────────────────
exports.CreateTimetableSlotSchema = zod_1.z.object({
    classId: zod_1.z.string().min(1),
    day: zod_1.z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']),
    periodStart: zod_1.z.string().regex(/^\d{2}:\d{2}$/),
    periodEnd: zod_1.z.string().regex(/^\d{2}:\d{2}$/),
    subject: zod_1.z.string().min(1),
    teacherUid: zod_1.z.string().min(1),
    room: zod_1.z.string().optional(),
    type: zod_1.z.enum(['REGULAR', 'EXAM', 'MANEB', 'LAB']).default('REGULAR'),
    academicYear: zod_1.z.string(),
    term: zod_1.z.number().int().min(1).max(3),
});
//# sourceMappingURL=student.js.map