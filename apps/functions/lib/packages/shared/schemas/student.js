"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnnouncementSchema = exports.PublicApplicationSchema = exports.CreateTimetableSlotSchema = exports.CreateClassSchema = exports.CreateApplicationSchema = exports.ApplicationStatusSchema = exports.UpdateStudentSchema = exports.CreateStudentSchema = exports.SexSchema = exports.StudentStatusSchema = void 0;
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
    status: exports.StudentStatusSchema.optional(),
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
// ─── PUBLIC APPLICATION (unauthenticated /apply page) ───────
// Extended version of CreateApplicationSchema — includes all fields
// from the multi-step apply form (§3.3)
exports.PublicApplicationSchema = zod_1.z.object({
    firstName: zod_1.z.string().min(2).max(100),
    otherNames: zod_1.z.string().optional(),
    surname: zod_1.z.string().min(2).max(100),
    dateOfBirth: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    sex: zod_1.z.enum(['male', 'female']),
    nationality: zod_1.z.string().min(1),
    district: zod_1.z.string().optional(),
    religion: zod_1.z.string().optional(),
    address: zod_1.z.string().min(5),
    phone: zod_1.z.string().min(7), // already formatted with country code
    email: zod_1.z.string().email().optional().or(zod_1.z.literal('')),
    classApplying: zod_1.z.enum(['Form 1', 'Form 2', 'Form 3', 'Form 4']),
    previousSchool: zod_1.z.string().optional(),
    reasonForTransfer: zod_1.z.string().optional(),
    academicYear: zod_1.z.string().min(4),
    guardianName: zod_1.z.string().min(2),
    guardianRelationship: zod_1.z.string().min(1),
    guardianPhone: zod_1.z.string().min(7),
    guardianEmail: zod_1.z.string().email().optional().or(zod_1.z.literal('')),
    guardianAddress: zod_1.z.string().optional(),
});
// ─── ANNOUNCEMENT ─────────────────────────────────────────
exports.AnnouncementSchema = zod_1.z.object({
    title: zod_1.z.string().min(3).max(200),
    body: zod_1.z.string().min(10),
    targetAll: zod_1.z.boolean().default(false),
    targetRoles: zod_1.z.array(zod_1.z.string()).optional(),
    targetClass: zod_1.z.string().optional(), // classId if targeting specific class
    status: zod_1.z.enum(['DRAFT', 'PENDING_APPROVAL', 'PUBLISHED']).default('DRAFT'),
});
//# sourceMappingURL=student.js.map