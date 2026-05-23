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
// Singleton reference — NOT instantiated at module load time
const globalForPrisma = globalThis;
function getPrisma() {
    if (!globalForPrisma.prisma) {
        const adapter = new adapter_neon_1.PrismaNeon({ connectionString: process.env.DATABASE_URL });
        globalForPrisma.prisma = new client_1.PrismaClient({ adapter });
    }
    return globalForPrisma.prisma;
}
exports.prisma = new Proxy({}, {
    get(_target, prop) {
        return getPrisma()[prop];
    },
});
//# sourceMappingURL=prisma.js.map