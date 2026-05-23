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
exports.announcementsRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const admin = __importStar(require("firebase-admin"));
exports.announcementsRouter = (0, express_1.Router)();
// PATCH /announcements/:id/approve — admin/high_rank approves a pending announcement
exports.announcementsRouter.patch('/:id/approve', auth_1.verifyAuth, (0, auth_1.requireRole)(['admin', 'high_rank']), async (req, res) => {
    const { id } = req.params;
    await admin.firestore().collection('announcements').doc(id).update({
        status: 'PUBLISHED',
        approvedByUid: req.user.uid,
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return res.json({ success: true });
});
// DELETE /announcements/:id — admin/high_rank can remove an announcement
exports.announcementsRouter.delete('/:id', auth_1.verifyAuth, (0, auth_1.requireRole)(['admin', 'high_rank']), async (req, res) => {
    const { id } = req.params;
    await admin.firestore().collection('announcements').doc(id).delete();
    return res.json({ success: true });
});
//# sourceMappingURL=announcements.js.map