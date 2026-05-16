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
exports.classesRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const student_1 = require("@shared/schemas/student");
const classService = __importStar(require("../services/classService"));
exports.classesRouter = (0, express_1.Router)();
// GET /classes
exports.classesRouter.get('/', auth_1.verifyAuth, (0, auth_1.requireRole)([
    'admin',
    'high_rank',
    'finance',
    'library',
    'lower_rank',
    'academic',
    'hr',
    'exam_officer',
    'student',
]), async (req, res) => {
    const { academicYear } = req.query;
    const classes = await classService.listClasses(academicYear);
    res.json(classes);
});
// GET /classes/:id
exports.classesRouter.get('/:id', auth_1.verifyAuth, (0, auth_1.requireRole)([
    'admin',
    'high_rank',
    'finance',
    'library',
    'lower_rank',
    'academic',
    'hr',
    'exam_officer',
    'student',
]), async (req, res) => {
    const id = String(req.params.id);
    const cls = await classService.getClass(id);
    res.json(cls);
});
// POST /classes
exports.classesRouter.post('/', auth_1.verifyAuth, (0, auth_1.requireRole)(['admin', 'high_rank']), async (req, res) => {
    const parsed = student_1.CreateClassSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ errors: parsed.error.flatten() });
    const cls = await classService.createClass(parsed.data);
    res.status(201).json(cls);
});
// GET /classes/:id/timetable
exports.classesRouter.get('/:id/timetable', auth_1.verifyAuth, (0, auth_1.requireRole)(['admin', 'high_rank', 'lower_rank', 'academic', 'exam_officer', 'student']), async (req, res) => {
    const id = String(req.params.id);
    const { term = '1', academicYear = '2025/2026' } = req.query;
    const slots = await classService.getTimetableForClass(id, Number(term), academicYear);
    res.json(slots);
});
// POST /classes/:id/timetable — admin/high_rank only, lower_rank goes via approval
exports.classesRouter.post('/:id/timetable', auth_1.verifyAuth, (0, auth_1.requireRole)(['admin', 'high_rank', 'exam_officer']), async (req, res) => {
    const id = String(req.params.id);
    const parsed = student_1.CreateTimetableSlotSchema.safeParse({
        ...req.body,
        classId: id,
    });
    if (!parsed.success)
        return res.status(400).json({ errors: parsed.error.flatten() });
    const slot = await classService.createTimetableSlot(parsed.data);
    res.status(201).json(slot);
});
//# sourceMappingURL=classes.js.map