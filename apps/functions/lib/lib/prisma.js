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
// Required for Node.js (Cloud Functions are not browser/edge)
serverless_1.neonConfig.webSocketConstructor = ws_1.default;
const pool = new serverless_1.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new adapter_neon_1.PrismaNeon(pool);
// Singleton — reuse connection across Cloud Function invocations
const globalForPrisma = globalThis;
exports.prisma = globalForPrisma.prisma ?? new client_1.PrismaClient({ adapter });
if (process.env.NODE_ENV !== 'production')
    globalForPrisma.prisma = exports.prisma;
