"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const client_1 = require("@prisma/client");
const adapter_neon_1 = require("@prisma/adapter-neon");
const serverless_1 = require("@neondatabase/serverless");
const ws_1 = __importDefault(require("ws"));
// Required for Node.js environments — Neon uses WebSockets
serverless_1.neonConfig.webSocketConstructor = ws_1.default;
// Prisma 6 + Neon: pass the connection string directly to PrismaNeon
const adapter = new adapter_neon_1.PrismaNeon({ connectionString: process.env.DATABASE_URL });
// Singleton pattern — prevents connection pool exhaustion in Cloud Functions
const globalForPrisma = globalThis;
exports.prisma = globalForPrisma.prisma ?? new client_1.PrismaClient({ adapter });
if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = exports.prisma;
}
//# sourceMappingURL=prisma.js.map