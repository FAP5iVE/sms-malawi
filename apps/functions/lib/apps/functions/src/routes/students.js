"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.studentsRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const student_1 = require("@shared/schemas/student");
const studentService = __importStar(require("../services/studentService"));
exports.studentsRouter = (0, express_1.Router)();
// GET /students — list with filters
exports.studentsRouter.get('/', auth_1.verifyAuth, (0, auth_1.requireRole)([
    'admin',
    'high_rank',
    'finance',
    'library',
    'lower_rank',
    'academic',
    'hr',
    'exam_officer',
]), async (req, res) => {
    const { classId, status, page, limit } = req.query;
    const result = await studentService.listStudents({
        classId: classId,
        status: status,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
    });
    res.json(result);
});
// GET /students/:id — single student
exports.studentsRouter.get('/:id', auth_1.verifyAuth, (0, auth_1.requireRole)([
    'admin',
    'high_rank',
    'finance',
    'library',
    'lower_rank',
    'academic',
    'hr',
    'exam_officer',
]), async (req, res) => {
    const id = String(req.params.id);
    const student = await studentService.getStudent(id);
    res.json(student);
});
// POST /students — create
exports.studentsRouter.post('/', auth_1.verifyAuth, (0, auth_1.requireRole)(['admin', 'high_rank', 'lower_rank']), async (req, res) => {
    const parsed = student_1.CreateStudentSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ errors: parsed.error.flatten() });
    }
    const student = await studentService.createStudent(parsed.data, req.user.uid, req.user.role);
    res.status(201).json(student);
});
// PATCH /students/:id — update
exports.studentsRouter.patch('/:id', auth_1.verifyAuth, (0, auth_1.requireRole)(['admin', 'high_rank', 'lower_rank']), async (req, res) => {
    const parsed = student_1.UpdateStudentSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ errors: parsed.error.flatten() });
    }
    const id = String(req.params.id);
    const updated = await studentService.updateStudent(id, parsed.data, req.user.uid, req.user.role);
    res.json(updated);
});
// DELETE /students/:id — archive only (never true delete)
exports.studentsRouter.delete('/:id', auth_1.verifyAuth, (0, auth_1.requireRole)(['admin', 'high_rank']), async (req, res) => {
    const id = String(req.params.id);
    const result = await studentService.archiveStudent(id, req.user.uid, req.user.role);
    res.json({ archived: true, student: result });
});
//# sourceMappingURL=students.js.map