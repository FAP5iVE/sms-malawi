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
exports.payrollRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const payrollService = __importStar(require("../services/payrollService"));
const storage_1 = require("../lib/storage");
const prisma_1 = require("../lib/prisma");
exports.payrollRouter = (0, express_1.Router)();
// GET /payroll?year=2026 — payroll run history
exports.payrollRouter.get('/', auth_1.verifyAuth, (0, auth_1.requireRole)(['admin', 'finance', 'hr']), async (req, res) => {
    const year = Number(req.query.year ?? new Date().getFullYear());
    res.json(await payrollService.getPayrollHistory(year));
});
// POST /payroll/run — trigger payroll for month/year
// In production this should queue a Cloud Task instead of running inline
exports.payrollRouter.post('/run', auth_1.verifyAuth, (0, auth_1.requireRole)(['admin', 'finance']), async (req, res) => {
    const { month, year } = req.body;
    if (!month || !year || month < 1 || month > 12) {
        return res.status(400).json({ error: 'Valid month (1-12) and year required' });
    }
    // For development: run inline. For production: enqueue Cloud Task
    const runId = await payrollService.processMonthlyPayroll(month, year, req.user.uid);
    res.status(201).json({ runId, status: 'COMPLETED' });
});
// GET /payroll/my-payslips — staff view their own payslips
exports.payrollRouter.get('/my-payslips', auth_1.verifyAuth, async (req, res) => {
    const payslips = await payrollService.getStaffPayslips(req.user.uid);
    res.json(payslips);
});
// GET /payroll/payslips/:id/download — get signed URL
exports.payrollRouter.get('/payslips/:id/download', auth_1.verifyAuth, async (req, res) => {
    const payslip = await prisma_1.prisma.payslip.findUniqueOrThrow({
        where: { id: String(req.params.id) },
    });
    // Staff can only download their own payslip (admin can download any)
    if (req.user.role !== 'admin' && payslip.staffUid !== req.user.uid) {
        return res.status(403).json({ error: 'Access denied' });
    }
    if (!payslip.payslipKey)
        return res.status(404).json({ error: 'Payslip PDF not ready' });
    const url = await (0, storage_1.getDownloadUrl)('sms-payslips', payslip.payslipKey);
    res.json({ url });
});
//# sourceMappingURL=payroll.js.map