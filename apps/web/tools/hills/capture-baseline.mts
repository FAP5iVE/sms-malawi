/**
 * apps/web/tools/hills/capture-baseline.mts
 *
 * [PURPOSE]: Chikangawa Hills theme, Phase 0. Captures the "before" gallery that
 *   every later phase is compared against: each route, at 390 / 768 / 1280 / 1920
 *   px wide, in light and dark. Run it once on the untouched app, and again
 *   per phase with a different --out to get the review pack's before/after.
 *
 * Usage (from apps/web, with the app already running):
 *   BASE_URL=http://localhost:3000 pnpm hills:baseline --out ../../hills-baseline/before
 *   pnpm hills:baseline --only public            # public | auth | parent
 *   pnpm hills:baseline --widths 390,1280 --themes light
 *   pnpm hills:baseline --list                   # print the route list and exit
 *
 * Signed-in routes need credentials (a user per role you want to see):
 *   HILLS_ADMIN_EMAIL / HILLS_ADMIN_PASSWORD      for (auth) routes
 *   HILLS_PARENT_EMAIL / HILLS_PARENT_PASSWORD    for (parent) routes
 * Without them those groups are skipped and the manifest says so. Never commit
 * credentials; pass them in the environment.
 *
 * Browser: uses Playwright's own Chromium. If that build is not installed (a
 * sandbox, say), set HILLS_CHROMIUM_PATH to any Chromium/Chrome executable.
 *
 * Determinism: the browser clock is frozen (default 2026-03-02 12:00 Africa/
 * Blantyre, a school-day noon, so the Phase 3 time-of-day sky is reproducible),
 * motion is set to "reduce" so spinners and skeleton sweeps do not vary, the
 * theme is forced through the app's own localStorage key, the cookie notice is
 * pre-dismissed and the Next.js dev badge is hidden.
 *
 * Output: <out>/<group>/<route-slug>@<width>-<theme>.png, <out>/manifest.json
 * and <out>/index.html (a thumbnail gallery you can open in a browser).
 * Dynamic routes ([id]) are skipped unless you pass ids, e.g.
 *   --param "/news/[id]=<a published post id>"
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium, type Browser, type Page } from 'playwright'

import { walk } from './lib/paths.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const webRoot = path.resolve(here, '../..')
const THEME_KEY = 'sms-malawi-theme'
const COOKIE_KEY = 'sms_cookie_notice_dismissed'

type Group = 'public' | 'auth' | 'parent' | 'root'

interface RouteDef {
  group: Group
  route: string
  /** extra query strings to capture as separate shots, e.g. /login?claim=1 */
  variants?: string[]
}

function parseArgs(argv: string[]) {
  const a = {
    out: path.join(webRoot, 'hills-baseline/before'),
    baseUrl: process.env.BASE_URL ?? 'http://localhost:3000',
    only: undefined as Group | undefined,
    widths: [390, 768, 1280, 1920],
    themes: ['light', 'dark'] as ('light' | 'dark')[],
    clock: '2026-03-02T12:00:00+02:00',
    list: false,
    params: new Map<string, string>(),
    routes: undefined as string[] | undefined,
  }
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    if (k === '--out') a.out = path.resolve(argv[++i] as string)
    else if (k === '--base-url') a.baseUrl = argv[++i] as string
    else if (k === '--only') a.only = argv[++i] as Group
    else if (k === '--widths') a.widths = (argv[++i] as string).split(',').map(Number)
    else if (k === '--themes') a.themes = (argv[++i] as string).split(',') as ('light' | 'dark')[]
    else if (k === '--clock') a.clock = argv[++i] as string
    else if (k === '--routes') a.routes = (argv[++i] as string).split(',')
    else if (k === '--list') a.list = true
    else if (k === '--param') {
      const [pattern, value] = (argv[++i] as string).split('=')
      if (pattern && value) a.params.set(pattern, value)
    } else {
      console.error(`Unknown argument: ${k}`)
      process.exit(2)
    }
  }
  return a
}

/** Routes straight from the app folder, so new pages are never forgotten. */
function discoverRoutes(): RouteDef[] {
  const appDir = path.join(webRoot, 'src/app')
  const pages = walk(appDir, (rel) => /(^|\/)page\.tsx$/.test(rel))
  const defs: RouteDef[] = []
  for (const rel of pages) {
    const segs = rel.split('/').slice(0, -1)
    if (segs[0] === 'api') continue
    let group: Group = 'root'
    if (segs[0] === '(public)') group = 'public'
    else if (segs[0] === '(auth)') group = 'auth'
    else if (segs[0] === '(parent)') group = 'parent'
    const route = `/${segs.filter((s) => !/^\(.*\)$/.test(s)).join('/')}`
    defs.push({ group, route: route === '/' ? '/' : route })
  }
  // States that look different but share a route.
  for (const d of defs) {
    if (d.route === '/login') d.variants = ['?claim=1']
  }
  // A real 404 and a protected-route bounce are part of the public surface.
  defs.push({ group: 'public', route: '/this-page-does-not-exist' })
  return defs.sort((a, b) => a.group.localeCompare(b.group) || a.route.localeCompare(b.route))
}

const slug = (route: string): string =>
  route === '/' ? 'home' : route.replace(/^\//, '').replace(/[/?&=\[\]]+/g, '_')

async function signIn(page: Page, baseUrl: string, email: string, password: string): Promise<boolean> {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('#email', email)
  await page.fill('#password', password)
  await page.click('button[type="submit"]')
  try {
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20_000 })
    return true
  } catch {
    return false
  }
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => undefined)
  await page.evaluate(() => document.fonts?.ready).catch(() => undefined)
  await page.waitForTimeout(400)
}

interface Shot {
  group: Group
  route: string
  width: number
  theme: string
  file: string
  status: number | null
  finalUrl: string
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  let defs = discoverRoutes()
  if (args.only) defs = defs.filter((d) => d.group === args.only)
  if (args.routes) defs = defs.filter((d) => args.routes?.includes(d.route))

  const dynamic = defs.filter((d) => d.route.includes('['))
  const concrete: RouteDef[] = []
  for (const d of defs) {
    if (!d.route.includes('[')) concrete.push(d)
    else {
      const value = args.params.get(d.route)
      if (value) concrete.push({ ...d, route: d.route.replace(/\[[^\]]+\]/, value) })
    }
  }

  if (args.list) {
    for (const d of defs) console.log(`${d.group.padEnd(7)} ${d.route}${d.variants ? `  (+${d.variants.join(', ')})` : ''}`)
    console.log(`\n${defs.length} routes (${dynamic.length} dynamic need --param)`)
    return
  }

  const creds: Partial<Record<Group, { email: string; password: string }>> = {}
  if (process.env.HILLS_ADMIN_EMAIL && process.env.HILLS_ADMIN_PASSWORD) {
    creds.auth = { email: process.env.HILLS_ADMIN_EMAIL, password: process.env.HILLS_ADMIN_PASSWORD }
  }
  if (process.env.HILLS_PARENT_EMAIL && process.env.HILLS_PARENT_PASSWORD) {
    creds.parent = { email: process.env.HILLS_PARENT_EMAIL, password: process.env.HILLS_PARENT_PASSWORD }
  }

  mkdirSync(args.out, { recursive: true })
  const browser: Browser = await chromium.launch(
    process.env.HILLS_CHROMIUM_PATH ? { executablePath: process.env.HILLS_CHROMIUM_PATH } : {},
  )
  const shots: Shot[] = []
  const skipped: { group: Group; route: string; reason: string }[] = []
  for (const d of dynamic) {
    if (!concrete.some((c) => c.group === d.group && c.route.startsWith(d.route.split('[')[0] as string))) {
      skipped.push({ group: d.group, route: d.route, reason: 'dynamic route, pass --param "<route>=<id>"' })
    }
  }

  for (const theme of args.themes) {
    for (const width of args.widths) {
      for (const group of ['public', 'root', 'auth', 'parent'] as Group[]) {
        const routes = concrete.filter((d) => d.group === group)
        if (routes.length === 0) continue
        const needsAuth = group === 'auth' || group === 'parent'
        const cred = creds[group]
        if (needsAuth && !cred) {
          for (const r of routes) {
            if (!skipped.some((s) => s.route === r.route)) {
              skipped.push({ group, route: r.route, reason: `no HILLS_${group === 'auth' ? 'ADMIN' : 'PARENT'}_EMAIL/PASSWORD set` })
            }
          }
          continue
        }

        const context = await browser.newContext({
          viewport: { width, height: 900 },
          deviceScaleFactor: 1,
          colorScheme: theme,
          reducedMotion: 'reduce',
          timezoneId: 'Africa/Blantyre',
          locale: 'en-GB',
        })
        await context.addInitScript(
          ([themeKey, themeValue, cookieKey]) => {
            try {
              localStorage.setItem(themeKey as string, themeValue as string)
              // Dismiss the cookie notice so it never covers the page under test.
              localStorage.setItem(cookieKey as string, '1')
            } catch {
              /* storage blocked */
            }
            // Hide the Next.js dev-mode badge; it is not part of the app.
            document.addEventListener('DOMContentLoaded', () => {
              const style = document.createElement('style')
              style.textContent = 'nextjs-portal{display:none!important}'
              document.head.appendChild(style)
            })
          },
          [THEME_KEY, theme, COOKIE_KEY],
        )
        const page = await context.newPage()
        await page.clock.install({ time: new Date(args.clock) })

        if (needsAuth && cred && !(await signIn(page, args.baseUrl, cred.email, cred.password))) {
          for (const r of routes) skipped.push({ group, route: r.route, reason: 'sign-in failed' })
          await context.close()
          continue
        }

        for (const r of routes) {
          for (const variant of ['', ...(r.variants ?? [])]) {
            const urlPath = `${r.route}${variant}`
            try {
              const res = await page.goto(`${args.baseUrl}${urlPath}`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
              await settle(page)
              const dir = path.join(args.out, group)
              mkdirSync(dir, { recursive: true })
              const file = `${group}/${slug(urlPath)}@${width}-${theme}.png`
              await page.screenshot({ path: path.join(args.out, file), fullPage: true })
              shots.push({ group, route: urlPath, width, theme, file, status: res?.status() ?? null, finalUrl: page.url().replace(args.baseUrl, '') })
              console.log(`ok  ${theme.padEnd(5)} ${String(width).padStart(4)}  ${urlPath}  [${res?.status()}]`)
            } catch (err) {
              skipped.push({ group, route: urlPath, reason: `${width}/${theme}: ${(err as Error).message.split('\n')[0]}` })
              console.log(`ERR ${theme.padEnd(5)} ${String(width).padStart(4)}  ${urlPath}  ${(err as Error).message.split('\n')[0]}`)
            }
          }
        }
        await context.close()
      }
    }
  }
  await browser.close()

  const manifest = { capturedAt: args.clock, baseUrl: args.baseUrl, widths: args.widths, themes: args.themes, shots, skipped }
  writeFileSync(path.join(args.out, 'manifest.json'), JSON.stringify(manifest, null, 2))
  writeFileSync(path.join(args.out, 'index.html'), gallery(manifest.shots, skipped))
  console.log(`\n${shots.length} screenshots, ${skipped.length} skipped. Open ${path.join(args.out, 'index.html')}`)
}

function gallery(shots: Shot[], skipped: { group: Group; route: string; reason: string }[]): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const byRoute = new Map<string, Shot[]>()
  for (const s of shots) byRoute.set(`${s.group} ${s.route}`, [...(byRoute.get(`${s.group} ${s.route}`) ?? []), s])
  const rows = [...byRoute]
    .map(
      ([key, list]) =>
        `<section><h2>${esc(key)}</h2><div class="row">${list
          .map((s) => `<figure><a href="${s.file}"><img loading="lazy" src="${s.file}" alt="${esc(key)} ${s.width} ${s.theme}"></a><figcaption>${s.width}px · ${s.theme}${s.finalUrl !== s.route ? ` · redirected to ${esc(s.finalUrl)}` : ''}</figcaption></figure>`)
          .join('')}</div></section>`,
    )
    .join('\n')
  const skip = skipped.length
    ? `<h2>Skipped (${skipped.length})</h2><ul>${skipped.map((s) => `<li>${esc(s.group)} ${esc(s.route)}: ${esc(s.reason)}</li>`).join('')}</ul>`
    : ''
  return `<!doctype html><meta charset="utf-8"><title>Hills baseline gallery</title><style>body{font:14px system-ui;margin:24px;background:#f6f4ef;color:#222}h2{font-size:15px;margin:24px 0 8px}.row{display:flex;gap:12px;overflow-x:auto;align-items:flex-start}figure{margin:0;flex:none}img{height:260px;width:auto;border:1px solid #ccc;background:#fff}figcaption{font-size:12px;color:#666;margin-top:4px}</style><h1>Hills baseline gallery</h1>${rows}${skip}`
}

await main()
