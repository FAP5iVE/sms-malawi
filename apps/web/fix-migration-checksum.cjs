/**
 * Fixes "The migration `X` was modified after it was applied" WITHOUT resetting the DB.
 *
 * Prisma stores sha256(migration.sql) in _prisma_migrations.checksum when it applies a migration.
 * If you edit the file afterwards, the hashes no longer match and `migrate dev` demands a reset.
 *
 * This script:
 *   1. Hashes every each migration.sql under prisma/migrations and compares to _prisma_migrations.
 *   2. Checks the DB really contains what the edited migration creates (tables/columns/indexes/FKs).
 *   3. Only with --apply: updates the stored checksum of the mismatched migration(s). Nothing else is touched.
 *
 * Run from apps/web (where .env lives):
 *   node fix-migration-checksum.cjs            # dry run, read-only
 *   node fix-migration-checksum.cjs --apply    # write the new checksum
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

const APPLY = process.argv.includes('--apply');
const MIGRATIONS_DIR = path.join(__dirname, 'prisma', 'migrations');
const TARGET = '20261030202801_assignment_workflow';

// What TARGET's migration.sql creates, used to confirm the DB already has it.
const EXPECT = {
  tables: ['assignment_attachments', 'assignment_views'],
  columns: {
    assignment_submissions: ['feedback', 'fileName', 'markedAt', 'markedByUid', 'marks', 'note', 'recordedByUid', 'updatedAt'],
    assignments: ['marksEnabled', 'maxMarks', 'requirements', 'updatedAt'],
  },
  indexes: [
    'assignment_attachments_fileKey_key',
    'assignment_attachments_assignmentId_idx',
    'assignment_views_assignmentId_idx',
    'assignment_views_assignmentId_studentId_key',
    'assignment_submissions_fileKey_key',
    'assignment_submissions_studentId_idx',
    'assignments_classId_dueDate_idx',
  ],
  fks: ['assignment_attachments_assignmentId_fkey', 'assignment_views_assignmentId_fkey'],
};

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

(async () => {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at`
    );
    const applied = new Map(rows.filter((r) => r.finished_at && !r.rolled_back_at).map((r) => [r.migration_name, r.checksum]));

    let matches = 0;
    const mismatches = [];
    const dirs = fs.readdirSync(MIGRATIONS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
    console.log('\nMigration checksum comparison:');
    for (const name of dirs) {
      const file = path.join(MIGRATIONS_DIR, name, 'migration.sql');
      if (!fs.existsSync(file)) continue;
      const local = sha256(fs.readFileSync(file));
      if (!applied.has(name)) { console.log(`  PENDING   ${name}`); continue; }
      if (applied.get(name) === local) { matches++; console.log(`  ok        ${name}`); }
      else { mismatches.push({ name, local }); console.log(`  MISMATCH  ${name}`); }
    }

    for (const [name] of applied) if (!dirs.includes(name)) console.log(`  (in DB but no local folder) ${name}`);

    if (matches === 0) {
      console.log('\nNo migration matched at all, so my hashing method may not fit your setup (e.g. line endings). Stopping; nothing changed.');
      process.exit(1);
    }
    if (mismatches.length === 0) { console.log('\nAll applied migrations match. Nothing to fix.'); return; }

    const unexpected = mismatches.filter((m) => m.name !== TARGET);
    if (unexpected.length) {
      console.log('\nOther migrations are modified too, not just the expected one:');
      unexpected.forEach((m) => console.log('  - ' + m.name));
      console.log('Send me this output before applying anything. Nothing changed.');
      process.exit(1);
    }

    // Does the DB already contain what the edited migration describes?
    console.log(`\nChecking the database already contains what ${TARGET} creates...`);
    const missing = [];
    const tbl = await prisma.$queryRawUnsafe(`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`);
    const tblSet = new Set(tbl.map((r) => r.table_name));
    EXPECT.tables.forEach((t) => !tblSet.has(t) && missing.push('table ' + t));
    for (const [t, cols] of Object.entries(EXPECT.columns)) {
      const c = await prisma.$queryRawUnsafe(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`, t);
      const cs = new Set(c.map((r) => r.column_name));
      cols.forEach((col) => !cs.has(col) && missing.push(`column ${t}.${col}`));
    }
    const idx = await prisma.$queryRawUnsafe(`SELECT indexname FROM pg_indexes WHERE schemaname='public'`);
    const idxSet = new Set(idx.map((r) => r.indexname));
    EXPECT.indexes.forEach((i) => !idxSet.has(i) && missing.push('index ' + i));
    const fk = await prisma.$queryRawUnsafe(`SELECT conname FROM pg_constraint WHERE contype='f'`);
    const fkSet = new Set(fk.map((r) => r.conname));
    EXPECT.fks.forEach((f) => !fkSet.has(f) && missing.push('foreign key ' + f));

    if (missing.length) {
      console.log('The DB is MISSING objects from the edited migration:');
      missing.forEach((m) => console.log('  - ' + m));
      console.log('\nUpdating the checksum would hide a real difference. Nothing changed. Send me this output.');
      process.exit(1);
    }
    console.log('  All tables, columns, indexes and foreign keys are present.');

    if (!APPLY) {
      console.log(`\nDRY RUN: would update checksum of ${TARGET}. Re-run with --apply to do it.`);
      return;
    }
    const m = mismatches[0];
    const n = await prisma.$executeRawUnsafe(`UPDATE _prisma_migrations SET checksum=$1 WHERE migration_name=$2`, m.local, m.name);
    console.log(`\nUpdated ${n} row. Now run: npx prisma migrate dev`);
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => { console.error(e); process.exit(1); });
