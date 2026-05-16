"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyAuth = verifyAuth;
exports.requireRole = requireRole;
const auth_1 = require("firebase-admin/auth");
// ─── VERIFY AUTH ─────────────────────────────────────────
async function verifyAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }
    const token = authHeader.slice(7);
    try {
        const decoded = await (0, auth_1.getAuth)().verifyIdToken(token);
        const role = decoded['role'];
        if (!role) {
            return res.status(403).json({ error: 'No role assigned to user' });
        }
        req.user = { uid: decoded.uid, role, email: decoded.email ?? '' };
        next();
    }
    catch {
        res.status(401).json({ error: 'Invalid or expired token' });
    }
}
// ─── REQUIRE ROLE ────────────────────────────────────────
function requireRole(allowed) {
    return (req, res, next) => {
        if (!req.user || !allowed.includes(req.user.role)) {
            return res.status(403).json({ error: 'Access denied for your role' });
        }
        next();
    };
}
