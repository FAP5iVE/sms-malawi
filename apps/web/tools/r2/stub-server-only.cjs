// Lets scripts import server-only modules (e.g. src/lib/storage.ts) outside a Next.js build,
// where the `server-only` package would otherwise throw on import.
const Module = require('node:module')
const load = Module._load
Module._load = function (request, ...rest) {
  if (request === 'server-only') return {}
  return load.call(this, request, ...rest)
}
