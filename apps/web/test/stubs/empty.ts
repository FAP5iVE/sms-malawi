/**
 * apps/web/test/stubs/empty.ts — test-only alias target for `server-only`.
 *
 * The `server-only` package throws on import outside a Server Component build.
 * Several services under unit test import it transitively; the unit vitest
 * project aliases `server-only` to this empty module so those services load.
 */
export {}
