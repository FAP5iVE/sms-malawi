/**
 * apps/web/test/security/endpointInventory.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: Static (source-level) extractor that builds the authorization
 *   endpoint inventory for Issue 7. It reads the real source — it never
 *   imports the route modules — so it needs no database, Firebase or env, and
 *   it cannot be fooled by runtime mocking. Used by:
 *     - src/server/routes/__tests__/routeContract.test.ts   (CI guard)
 *     - scripts/security/generate-endpoint-inventory.ts     (docs generator)
 *
 *   What it extracts:
 *     1. Express mounts in lib/api-app.ts          (`app.use('/x', mw..., router)`)
 *     2. Every `<router>.<verb>(path, mw..., handler)` and
 *        `<router>.route(path).<verb>(mw..., handler)` call in
 *        server/routes/** (including nested routers mounted with
 *        `parent.use('/sub', child)`)
 *     3. Router-wide `<router>.use(mw...)` calls (applied to every route
 *        registered AFTER that line, matching Express ordering)
 *     4. Next.js Route Handlers (app/api/**\/route.ts exported verbs)
 *     5. Server Actions ('use server' files, every exported async function)
 *
 *   It is deliberately a tokenizer + balanced-paren scanner, not a full TS
 *   parse: comments/strings/template literals are masked so brackets inside
 *   them cannot desynchronise the scan.
 */
import fs from 'node:fs'
import path from 'node:path'

// ─── TYPES ────────────────────────────────────────────────────────────────

export interface ExpressEndpoint {
  kind: 'express'
  /** Source file relative to apps/web */
  file: string
  line: number
  /** Full path as seen by a client under /api, e.g. `/api/students/:id` */
  fullPath: string
  method: string
  /** Middleware names (call text, without args collapsed) in execution order */
  middleware: string[]
  /** True when a verifyAuth (or an equivalent verified-identity gate) runs before the handler */
  authenticated: boolean
  /** True when a role/permission gate (requireRole / requirePermission*) runs before the handler */
  hasGate: boolean
  /** Handler source (last argument) – used for in-handler permission heuristics */
  handlerText: string
}

export interface RouteHandlerEndpoint {
  kind: 'route-handler'
  file: string
  fullPath: string
  methods: string[]
  source: string
}

export interface ServerActionEndpoint {
  kind: 'server-action'
  file: string
  name: string
  source: string
}

export type Endpoint = ExpressEndpoint | RouteHandlerEndpoint | ServerActionEndpoint

// ─── LOW-LEVEL SCANNING ───────────────────────────────────────────────────

/**
 * Returns a copy of `src` with the *contents* of comments, string literals,
 * template literals and regex-ish literals replaced by spaces (newlines are
 * kept so offsets/lines still line up). Quote characters are preserved.
 */
export function maskSource(src: string): string {
  const out = src.split('')
  const n = src.length
  let i = 0
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' '
  }
  while (i < n) {
    const c = src[i]!
    const d = src[i + 1]
    if (c === '/' && d === '/') {
      const e = src.indexOf('\n', i)
      const end = e === -1 ? n : e
      blank(i, end)
      i = end
    } else if (c === '/' && d === '*') {
      const e = src.indexOf('*/', i + 2)
      const end = e === -1 ? n : e + 2
      blank(i, end)
      i = end
    } else if (c === "'" || c === '"') {
      let j = i + 1
      while (j < n && src[j] !== c) {
        if (src[j] === '\\') j++
        j++
      }
      blank(i + 1, j)
      i = j + 1
    } else if (c === '`') {
      // Template literal. Handles ${ ... } nesting by depth counting.
      let j = i + 1
      let depth = 0
      while (j < n) {
        const ch = src[j]!
        if (ch === '\\') {
          j += 2
          continue
        }
        if (depth === 0 && ch === '`') break
        if (ch === '$' && src[j + 1] === '{') {
          depth++
          j += 2
          continue
        }
        if (depth > 0 && ch === '}') depth--
        j++
      }
      blank(i + 1, j)
      i = j + 1
    } else {
      i++
    }
  }
  return out.join('')
}

/** Index of the `)` matching the `(` at `open` in masked source. */
function matchParen(masked: string, open: number): number {
  let depth = 0
  for (let i = open; i < masked.length; i++) {
    const c = masked[i]
    if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/** Splits the inside of a call's parens on top-level commas. Returns [start,end) offsets. */
function splitArgs(masked: string, open: number, close: number): Array<[number, number]> {
  const parts: Array<[number, number]> = []
  let depth = 0
  let start = open + 1
  for (let i = open + 1; i < close; i++) {
    const c = masked[i]
    if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') depth--
    else if (c === ',' && depth === 0) {
      parts.push([start, i])
      start = i + 1
    }
  }
  if (masked.slice(start, close).trim().length > 0) parts.push([start, close])
  return parts
}

function lineOf(src: string, offset: number): number {
  let line = 1
  for (let i = 0; i < offset; i++) if (src.charCodeAt(i) === 10) line++
  return line
}

const VERBS = ['get', 'post', 'put', 'patch', 'delete', 'all'] as const

// ─── MIDDLEWARE CLASSIFICATION ────────────────────────────────────────────

/** Identity gates: after one of these, req.user is a verified identity. */
const AUTH_MIDDLEWARE = /\b(verifyAuth|requireAuth|verifyAuthOptional)\b/
// NB: verifyAuthOptional would NOT count as authenticating; handled below.
const GATE_MIDDLEWARE =
  /\b(requireRole|requirePermission|requireAnyPermission|requireAllPermissions|requireSuperUser)\b/

export function middlewareAuthenticates(mw: string): boolean {
  if (/\bverifyAuthOptional\b/.test(mw)) return false
  return AUTH_MIDDLEWARE.test(mw)
}
export function middlewareGates(mw: string): boolean {
  return GATE_MIDDLEWARE.test(mw)
}

function compact(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

// ─── EXPRESS ──────────────────────────────────────────────────────────────

interface Mount {
  /** Variable name of the router, as imported into api-app.ts */
  routerVar: string
  prefix: string
  middleware: string[]
}

/** Parses `app.use('/prefix', mw..., router)` in api-app.ts. */
export function parseMounts(apiAppSrc: string): Mount[] {
  const masked = maskSource(apiAppSrc)
  const mounts: Mount[] = []
  const re = /\bapp\.use\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(masked))) {
    const open = m.index + m[0].length - 1
    const close = matchParen(masked, open)
    if (close === -1) continue
    const args = splitArgs(masked, open, close)
    if (args.length < 2) continue
    const first = apiAppSrc.slice(args[0]![0], args[0]![1]).trim()
    const pm = /^['"`](\/[^'"`]*)['"`]$/.exec(first)
    if (!pm) continue
    const rest = args.slice(1).map(([a, b]) => compact(apiAppSrc.slice(a, b)))
    const routerVar = rest[rest.length - 1]!
    if (!/^[A-Za-z_$][\w$]*Router$/.test(routerVar)) continue
    mounts.push({ routerVar, prefix: pm[1]!, middleware: rest.slice(0, -1) })
  }
  return mounts
}

interface RawRoute {
  routerVar: string
  method: string
  subPath: string
  line: number
  middleware: string[]
  /** Router-wide middleware active at this point in the file */
  inherited: string[]
  handlerText: string
}

interface RawUse {
  parentVar: string
  subPath: string
  childVar: string
  middleware: string[]
  inherited: string[]
}

interface ParsedFile {
  routes: RawRoute[]
  nested: RawUse[]
  routerVars: string[]
}

function stringLiteral(text: string): string | null {
  const t = text.trim()
  const m = /^(['"`])([\s\S]*)\1$/.exec(t)
  return m ? m[2]! : null
}

/**
 * Collects `const NAME = [a, b(...)]` and `const NAME = someCall(...)` aliases so
 * that `...gate` / `placement` style middleware references are expanded to the
 * real gates they stand for (otherwise they would look like "no gate").
 */
function collectAliases(src: string, masked: string): Map<string, string[]> {
  const aliases = new Map<string, string[]>()
  const re = /\bconst\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(\[|[A-Za-z_$][\w$]*\()/g
  let m: RegExpExecArray | null
  while ((m = re.exec(masked))) {
    const name = m[1]!
    const open = masked.indexOf(m[2]!.endsWith('(') ? '(' : '[', m.index + m[0].length - m[2]!.length)
    const close = matchParen(masked, open)
    if (close === -1) continue
    if (m[2] === '[') {
      const items = splitArgs(masked, open, close).map(([a, b]) => compact(src.slice(a, b)))
      aliases.set(name, items)
    } else {
      aliases.set(name, [compact(src.slice(m.index + m[0].length - m[2]!.length, close + 1))])
    }
  }
  return aliases
}

function expandAliases(chain: string[], aliases: Map<string, string[]>, depth = 0): string[] {
  const out: string[] = []
  for (const mw of chain) {
    const spread = /^\.\.\.([A-Za-z_$][\w$]*)$/.exec(mw)
    const bare = /^([A-Za-z_$][\w$]*)$/.exec(mw)
    const name = spread?.[1] ?? bare?.[1]
    const resolved = name ? aliases.get(name) : undefined
    if (resolved && depth < 3) out.push(...expandAliases(resolved, aliases, depth + 1))
    else out.push(mw)
  }
  return out
}

export function parseRouteFile(src: string): ParsedFile {
  const masked = maskSource(src)
  const routerVars = [
    ...masked.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:express\.)?Router\s*\(/g),
  ].map((m) => m[1]!)

  type Event =
    | { at: number; type: 'use'; routerVar: string; args: string[]; sub: string | null }
    | { at: number; type: 'verb'; routerVar: string; method: string; args: string[]; argRanges: Array<[number, number]>; sub: string | null; routeChain: boolean }

  const events: Event[] = []

  // 1) router.use(...)
  for (const rv of routerVars) {
    const reUse = new RegExp(`\\b${rv.replace(/\$/g, '\\$')}\\.use\\(`, 'g')
    let m: RegExpExecArray | null
    while ((m = reUse.exec(masked))) {
      const open = m.index + m[0].length - 1
      const close = matchParen(masked, open)
      if (close === -1) continue
      const ranges = splitArgs(masked, open, close)
      const args = ranges.map(([a, b]) => compact(src.slice(a, b)))
      const first = args[0] !== undefined ? stringLiteral(args[0]) : null
      events.push({ at: m.index, type: 'use', routerVar: rv, args, sub: first })
    }

    // 2) router.<verb>(...)
    const reVerb = new RegExp(`\\b${rv.replace(/\$/g, '\\$')}\\.(${VERBS.join('|')})\\(`, 'g')
    while ((m = reVerb.exec(masked))) {
      const open = m.index + m[0].length - 1
      const close = matchParen(masked, open)
      if (close === -1) continue
      const ranges = splitArgs(masked, open, close)
      const args = ranges.map(([a, b]) => compact(src.slice(a, b)))
      const first = args[0] !== undefined ? stringLiteral(args[0]) : null
      events.push({
        at: m.index,
        type: 'verb',
        routerVar: rv,
        method: m[1]!.toUpperCase(),
        args,
        argRanges: ranges,
        sub: first,
        routeChain: false,
      })
    }

    // 3) router.route('/x').get(...).patch(...)
    const reRoute = new RegExp(`\\b${rv.replace(/\$/g, '\\$')}\\s*\\.route\\(`, 'g')
    while ((m = reRoute.exec(masked))) {
      const open = m.index + m[0].length - 1
      const close = matchParen(masked, open)
      if (close === -1) continue
      const sub = stringLiteral(src.slice(open + 1, close))
      // Walk the chained .verb( ... ) calls
      let cursor = close + 1
      for (;;) {
        const rest = masked.slice(cursor)
        const cm = /^\s*\.(get|post|put|patch|delete|all)\(/.exec(rest)
        if (!cm) break
        const vOpen = cursor + cm[0].length - 1
        const vClose = matchParen(masked, vOpen)
        if (vClose === -1) break
        const ranges = splitArgs(masked, vOpen, vClose)
        const args = ranges.map(([a, b]) => compact(src.slice(a, b)))
        events.push({
          at: cursor + cm[0].indexOf('.'),
          type: 'verb',
          routerVar: rv,
          method: cm[1]!.toUpperCase(),
          args,
          argRanges: ranges,
          sub,
          routeChain: true,
        })
        cursor = vClose + 1
      }
    }
  }

  events.sort((a, b) => a.at - b.at)

  const aliases = collectAliases(src, masked)
  const active = new Map<string, string[]>() // routerVar -> router-wide middleware so far
  const routes: RawRoute[] = []
  const nested: RawUse[] = []

  for (const ev of events) {
    const inherited = [...(active.get(ev.routerVar) ?? [])]
    if (ev.type === 'use') {
      if (ev.sub !== null && ev.args.length >= 2) {
        const child = ev.args[ev.args.length - 1]!
        if (/^[A-Za-z_$][\w$]*$/.test(child)) {
          nested.push({
            parentVar: ev.routerVar,
            subPath: ev.sub,
            childVar: child,
            middleware: ev.args.slice(1, -1),
            inherited,
          })
          continue
        }
      }
      // router-wide middleware (path-scoped `use('/x', mw)` is treated as scoped below)
      if (ev.sub === null) {
        active.set(ev.routerVar, [...inherited, ...expandAliases(ev.args, aliases)])
      } else {
        // Path-scoped middleware: remember with its prefix so route matching can apply it
        active.set(ev.routerVar, [...inherited, `@scope:${ev.sub}:${ev.args.slice(1).join(' | ')}`])
      }
    } else {
      const handlerIdx = ev.args.length - 1
      const mwArgs = expandAliases(
        ev.routeChain ? ev.args.slice(0, handlerIdx) : ev.args.slice(1, handlerIdx),
        aliases,
      )
      const [hs, he] = ev.argRanges[handlerIdx] ?? [0, 0]
      const sub = ev.sub ?? ''
      // Resolve path-scoped middleware
      const eff: string[] = []
      for (const mw of inherited) {
        const sc = /^@scope:([^:]*):(.*)$/.exec(mw)
        if (!sc) eff.push(mw)
        else {
          const scope = sc[1]!
          if (sub === scope || sub.startsWith(scope.endsWith('/') ? scope : scope + '/') || scope === '/') {
            eff.push(...sc[2]!.split(' | ').filter(Boolean))
          }
        }
      }
      routes.push({
        routerVar: ev.routerVar,
        method: ev.method,
        subPath: sub,
        line: lineOf(src, ev.at),
        middleware: mwArgs,
        inherited: eff,
        handlerText: src.slice(hs, he),
      })
    }
  }

  return { routes, nested, routerVars }
}

function joinPath(...parts: string[]): string {
  const joined = parts.join('/').replace(/\/+/g, '/')
  const trimmed = joined.length > 1 ? joined.replace(/\/$/, '') : joined
  return trimmed.startsWith('/') ? trimmed : '/' + trimmed
}

function walk(dir: string, filter: (f: string) => boolean, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    const st = fs.statSync(full)
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === '__tests__') continue
      walk(full, filter, out)
    } else if (filter(full)) out.push(full)
  }
  return out
}

/**
 * Builds the Express endpoint list by resolving mounts in api-app.ts to the
 * router that each route file exports.
 */
export function collectExpressEndpoints(webRoot: string): ExpressEndpoint[] {
  const apiAppPath = path.join(webRoot, 'src/lib/api-app.ts')
  const apiAppSrc = fs.readFileSync(apiAppPath, 'utf8')
  const mounts = parseMounts(apiAppSrc)

  const routesDir = path.join(webRoot, 'src/server/routes')
  const files = walk(routesDir, (f) => f.endsWith('.ts'))

  // routerVar -> {file, parsed}
  const byRouter = new Map<string, { file: string; src: string; parsed: ParsedFile }>()
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8')
    const parsed = parseRouteFile(src)
    for (const rv of parsed.routerVars) {
      // exported routers are unique by name across the codebase (Router suffix)
      byRouter.set(rv, { file: path.relative(webRoot, f), src, parsed })
    }
  }

  const out: ExpressEndpoint[] = []

  const emit = (
    routerVar: string,
    prefix: string,
    upstream: string[],
    seen: Set<string>
  ): void => {
    const entry = byRouter.get(routerVar)
    if (!entry || seen.has(routerVar)) return
    seen.add(routerVar)
    for (const r of entry.parsed.routes) {
      if (r.routerVar !== routerVar) continue
      const chain = [...upstream, ...r.inherited, ...r.middleware]
      out.push({
        kind: 'express',
        file: entry.file,
        line: r.line,
        fullPath: joinPath('/api', prefix, r.subPath),
        method: r.method,
        middleware: chain,
        authenticated: chain.some(middlewareAuthenticates),
        hasGate: chain.some(middlewareGates),
        handlerText: r.handlerText,
      })
    }
    for (const n of entry.parsed.nested) {
      if (n.parentVar !== routerVar) continue
      emit(n.childVar, joinPath(prefix, n.subPath), [...upstream, ...n.inherited, ...n.middleware], new Set(seen))
    }
  }

  for (const m of mounts) emit(m.routerVar, m.prefix, m.middleware, new Set())
  return out
}

// ─── ROUTE HANDLERS (Next.js) ─────────────────────────────────────────────

export function collectRouteHandlers(webRoot: string): RouteHandlerEndpoint[] {
  const appDir = path.join(webRoot, 'src/app')
  const files = walk(appDir, (f) => /[\\/]route\.tsx?$/.test(f))
  return files.map((f) => {
    const src = fs.readFileSync(f, 'utf8')
    const masked = maskSource(src)
    const methods = [
      ...masked.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g),
      ...masked.matchAll(/export\s+const\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g),
    ].map((m) => m[1]!)
    const rel = path.relative(appDir, path.dirname(f)).split(path.sep).join('/')
    return {
      kind: 'route-handler' as const,
      file: path.relative(webRoot, f),
      fullPath: '/' + rel,
      methods,
      source: src,
    }
  })
}

// ─── SERVER ACTIONS ───────────────────────────────────────────────────────

export function collectServerActions(webRoot: string): ServerActionEndpoint[] {
  const srcDir = path.join(webRoot, 'src')
  const files = walk(srcDir, (f) => /\.(ts|tsx)$/.test(f) && !/\.d\.ts$/.test(f))
  const out: ServerActionEndpoint[] = []
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8')
    // File-level directive must be the first statement (comments may precede it)
    const head = maskSource(src)
    const stripped = src
      .split('\n')
      .map((l, i) => (head.split('\n')[i]!.trim() === '' ? '' : l))
      .join('\n')
      .trim()
    const fileLevel = /^(['"])use server\1/.test(stripped)
    const masked = maskSource(src)
    if (fileLevel) {
      const names = [
        ...masked.matchAll(/export\s+async\s+function\s+([A-Za-z_$][\w$]*)/g),
        ...masked.matchAll(/export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*async\b/g),
      ].map((m) => m[1]!)
      for (const name of names) out.push({ kind: 'server-action', file: path.relative(webRoot, f), name, source: src })
    } else if (/['"]use server['"]/.test(src)) {
      // Inline `'use server'` inside a function body (also a public endpoint)
      out.push({ kind: 'server-action', file: path.relative(webRoot, f), name: '(inline use-server)', source: src })
    }
  }
  return out
}

export function collectAll(webRoot: string): {
  express: ExpressEndpoint[]
  routeHandlers: RouteHandlerEndpoint[]
  serverActions: ServerActionEndpoint[]
} {
  return {
    express: collectExpressEndpoints(webRoot),
    routeHandlers: collectRouteHandlers(webRoot),
    serverActions: collectServerActions(webRoot),
  }
}

// ─── MOUNT COMPLETENESS ───────────────────────────────────────────────────

/**
 * Routers that declare at least one route but are never mounted (directly in
 * api-app.ts or nested under a mounted router). A router in this state serves
 * nothing — every request to it falls through to the 404 handler (this exact
 * bug hid promotion.ts for a long time) — and, worse, a later "fix" that
 * mounts it would expose routes nobody reviewed.
 */
export function collectUnmountedRouters(webRoot: string): string[] {
  const apiAppSrc = fs.readFileSync(path.join(webRoot, 'src/lib/api-app.ts'), 'utf8')
  const mounted = new Set(parseMounts(apiAppSrc).map((m) => m.routerVar))
  const files = walk(path.join(webRoot, 'src/server/routes'), (f) => f.endsWith('.ts'))
  const declared: Array<{ rv: string; hasRoutes: boolean }> = []
  for (const f of files) {
    const parsed = parseRouteFile(fs.readFileSync(f, 'utf8'))
    for (const n of parsed.nested) mounted.add(n.childVar)
    for (const rv of parsed.routerVars) {
      declared.push({ rv, hasRoutes: parsed.routes.some((r) => r.routerVar === rv) })
    }
  }
  return declared.filter((d) => d.hasRoutes && !mounted.has(d.rv)).map((d) => d.rv)
}

// ─── GATE EVALUATION (for the behavioural matrix) ─────────────────────────

export type GateSpec =
  | { kind: 'role'; roles: string[] }
  | { kind: 'perm'; mode: 'one' | 'any' | 'all'; permissions: string[] }

const quoted = (text: string): string[] => [...text.matchAll(/['"]([A-Za-z_.]+)['"]/g)].map((m) => m[1]!)

/**
 * Turns `requireRole([...])` / `requirePermission('x')` / `requireAnyPermission([...])`
 * into a spec. `constArrays` resolves spreads like `...FINANCE_ROLES` from the
 * same source file. Returns null when the text cannot be resolved statically
 * (e.g. a permission list held in an imported constant).
 */
export function parseGate(mw: string, constArrays: Map<string, string[]>): GateSpec | null {
  const role = /^requireRole\(\s*\[([\s\S]*)\]\s*\)$/.exec(mw)
  if (role) {
    const body = role[1]!
    const roles = quoted(body.replace(/\.\.\.[A-Za-z_$][\w$]*/g, ''))
    for (const sp of body.matchAll(/\.\.\.([A-Za-z_$][\w$]*)/g)) {
      const resolved = constArrays.get(sp[1]!)
      if (!resolved) return null
      roles.push(...resolved)
    }
    return { kind: 'role', roles }
  }
  const one = /^requirePermission\(\s*['"]([\w.]+)['"]\s*\)$/.exec(mw)
  if (one) return { kind: 'perm', mode: 'one', permissions: [one[1]!] }
  const multi = /^require(Any|All)Permissions?\(\s*\[([\s\S]*)\]\s*\)$/.exec(mw)
  if (multi) {
    const perms = quoted(multi[2]!)
    if (/\.\.\.|[A-Z_]{4,}/.test(multi[2]!.replace(/['"][\w.]+['"]/g, ''))) return null
    return { kind: 'perm', mode: multi[1] === 'Any' ? 'any' : 'all', permissions: perms }
  }
  return null
}

/** `const NAME = ['a','b'] as const` arrays in a source file. */
export function collectConstArrays(src: string): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const m of src.matchAll(/\bconst\s+([A-Z][A-Z0-9_]*)\s*=\s*\[([^\]]*)\]/g)) {
    if (!/\.\.\./.test(m[2]!)) out.set(m[1]!, quoted(m[2]!))
  }
  return out
}
