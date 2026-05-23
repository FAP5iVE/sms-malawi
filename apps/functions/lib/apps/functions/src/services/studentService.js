"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listStudents = listStudents;
exports.getStudent = getStudent;
exports.createStudent = createStudent;
exports.updateStudent = updateStudent;
exports.archiveStudent = archiveStudent;
const prisma_1 = require("../lib/prisma");
const malawi_1 = require("../../../../packages/shared/constants/malawi");
const algoliasearch_1 = require("algoliasearch"); // v5 named import
// Algolia v5: client.saveObjects() — no more initIndex()
const algolia = (0, algoliasearch_1.algoliasearch)(process.env.ALGOLIA_APP_ID ?? '', process.env.ALGOLIA_ADMIN_KEY ?? '');
async function syncToAlgolia(student) {
    if (!process.env.ALGOLIA_APP_ID)
        return; // skip if not configured
    await algolia.saveObjects({
        indexName: 'students',
        objects: [
            {
                objectID: student.id,
                firstName: student.firstName,
                lastName: student.lastName,
                registrationNo: student.registrationNo,
                classId: student.classId ?? '',
                status: student.status,
            },
        ],
    });
}
async function listStudents(filters) {
    const { classId, status, page = 1, limit = 50 } = filters;
    const where = {};
    if (classId)
        where.classId = classId;
    if (status)
        where.status = status;
    const [students, total] = await prisma_1.prisma.$transaction([
        prisma_1.prisma.student.findMany({
            where,
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { lastName: 'asc' },
            include: { class: { select: { name: true, form: true } } },
        }),
        prisma_1.prisma.student.count({ where }),
    ]);
    return { students, total, page, pages: Math.ceil(total / limit) };
}
async function getStudent(id) {
    return prisma_1.prisma.student.findUniqueOrThrow({
        where: { id },
        include: { class: true },
    });
}
async function createStudent(data, actorUid, actorRole) {
    const year = new Date().getFullYear();
    const count = await prisma_1.prisma.student.count();
    const regNo = (0, malawi_1.generateRegistrationNo)(year, count + 1);
    const student = await prisma_1.prisma.student.create({
        data: { ...data, registrationNo: regNo, dateOfBirth: new Date(data.dateOfBirth) },
    });
    await syncToAlgolia(student).catch((e) => console.error('Algolia sync failed:', e));
    await writeAuditLog('student.create', 'Student', student.id, actorUid, actorRole);
    return student;
}
async function updateStudent(id, data, actorUid, actorRole) {
    const updated = await prisma_1.prisma.student.update({
        where: { id },
        data: {
            ...data,
            ...(data.dateOfBirth && { dateOfBirth: new Date(data.dateOfBirth) }),
        },
    });
    await writeAuditLog('student.update', 'Student', id, actorUid, actorRole, data);
    return updated;
}
async function archiveStudent(id, actorUid, actorRole) {
    const archived = await prisma_1.prisma.student.update({ where: { id }, data: { status: 'ARCHIVED' } });
    await writeAuditLog('student.archive', 'Student', id, actorUid, actorRole);
    return archived;
}
async function writeAuditLog(action, entityType, entityId, actorUid, actorRole, metadata) {
    await prisma_1.prisma.auditLog
        .create({
        data: { action, entityType, entityId, actorUid, actorRole, metadata },
    })
        .catch(() => { }); // never block main operation for audit
}
//# sourceMappingURL=studentService.js.map