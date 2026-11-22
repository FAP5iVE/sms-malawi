/**
 * apps/web/tools/hills/stub-prisma.mjs
 *
 * [PURPOSE]: Lets the document tests load the PDF builders without a generated Prisma client.
 *   The builders are pure (no query runs), but their modules import lib/prisma at load time, and a
 *   machine that has not run `prisma generate` (or cannot download the engine) would fail on the
 *   import. This swaps `@prisma/client` for an empty stand-in for these tests only.
 */
import Module from 'node:module'

const handler = {
  get: (_t, k) => (k === 'then' ? undefined : new Proxy(function () {}, handler)),
  apply: () => new Proxy(function () {}, handler),
}
class PrismaClient {
  constructor() { return new Proxy({}, handler) }
}
const stub = { PrismaClient, Prisma: new Proxy({}, handler), default: { PrismaClient } }

const load = Module._load
Module._load = function patched(request, ...rest) {
  if (request === '@prisma/client') return stub
  return load.call(this, request, ...rest)
}
