-- Migration: budget_category_expense_category_enum
-- [R-PHASE]: R14 — Analytics & Reports Domain
-- [PURPOSE]: Constrain budgets.category to the existing "ExpenseCategory"
--   enum. It was previously free text with no enforced relationship to
--   expenses.category (which has always been ExpenseCategory), so
--   analyticsService.getFinanceBudgetVsActual()'s Budget-to-Expense join
--   never matched for any real budget and silently fell back to the stale
--   cached budgets.spent column.
--
--   Existing rows are normalised before the type change: values are
--   upper-cased and space/hyphen-separated forms are collapsed to
--   underscores, then any value that still does not name a real
--   ExpenseCategory member is mapped to MISCELLANEOUS (the enum's own
--   catch-all) rather than failing the migration and leaving the column
--   un-constrained.

-- 1. Normalise casing / separators on existing free-text values.
UPDATE "budgets"
SET "category" = UPPER(REPLACE(REPLACE(TRIM("category"), ' ', '_'), '-', '_'));

-- 2. Map any remaining unrecognised value onto the enum's catch-all member.
UPDATE "budgets"
SET "category" = 'MISCELLANEOUS'
WHERE "category" NOT IN (
  'SALARIES',
  'UTILITIES',
  'MAINTENANCE',
  'PROCUREMENT',
  'LIBRARY',
  'TRANSPORT',
  'MISCELLANEOUS'
);

-- 3. Convert the column to the enum type.
ALTER TABLE "budgets"
  ALTER COLUMN "category" TYPE "ExpenseCategory"
  USING "category"::"ExpenseCategory";
