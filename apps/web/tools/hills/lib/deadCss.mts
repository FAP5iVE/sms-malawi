/**
 * apps/web/tools/hills/lib/deadCss.mts
 *
 * [PURPOSE]: Chikangawa Hills theme, phase 16. Finds what src/app/globals.css defines but nothing uses,
 *   so dead rules cannot creep back after the clean-up.
 *     classes      a `.name` selector whose name appears nowhere in the code, public files,
 *                  Storybook, tools or tests (whole-word match)
 *     properties   a custom property that is never read with var(...) and, for Tailwind theme names
 *                  (--color-x, --font-x, ...), whose utility is never written
 *   Names built from a prefix in code (`hills-bg--${kind}`) are kept by DYNAMIC_PREFIXES, and hooks that
 *   third-party libraries put on their own markup are kept by THIRD_PARTY. Pure: the caller passes the text.
 */

/** Class names that a template literal builds, so the full name never appears in code. */
export const DYNAMIC_PREFIXES = ['app-modal-panel--', 'hills-bg--'] as const

/** Hooks on markup a library renders; the print sheet hides them. */
export const THIRD_PARTY = new Set(['recharts-wrapper', 'apexcharts-canvas'])

/** Custom properties that Tailwind or the browser reads by name, not through var(). */
const THEME_PREFIXES = ['color', 'font', 'radius', 'shadow', 'text', 'animate', 'ease', 'spacing', 'breakpoint', 'tracking', 'leading', 'blur', 'inset-shadow', 'drop-shadow'] as const

function blankComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const wholeWord = (name: string): RegExp => new RegExp(`(?<![\\w-])${escapeRe(name)}(?![\\w-])`)

export interface DeadCss { classes: string[]; properties: string[] }

export function findDeadCss(css: string, corpus: string): DeadCss {
  const clean = blankComments(css)
  const classes = new Set<string>()
  // Selectors only: skip declaration values and url(...) so `.5rem` or a file name is not a class.
  for (const m of clean.matchAll(/(?:^|[\s,>+~(){};])\.(-?[A-Za-z_][\w-]*)/g)) classes.add(m[1] as string)
  const deadClasses = [...classes].filter((c) => {
    if (THIRD_PARTY.has(c)) return false
    if (DYNAMIC_PREFIXES.some((p) => c.startsWith(p))) return false
    return !wholeWord(c).test(corpus)
  })

  const defined = new Set<string>()
  for (const m of clean.matchAll(/(?<![\w-])(--[\w-]+)\s*:/g)) defined.add(m[1] as string)
  const read = new Set<string>()
  for (const m of clean.matchAll(/var\(\s*(--[\w-]+)/g)) read.add(m[1] as string)
  const deadProps = [...defined].filter((p) => {
    if (read.has(p) || wholeWord(p).test(corpus)) return false
    // The bare name (--shadow, --radius, --spacing) is the default of its utility family; Tailwind reads it.
    if (THEME_PREFIXES.some((t) => p === `--${t}`)) return false
    const theme = THEME_PREFIXES.find((t) => p.startsWith(`--${t}-`))
    if (theme) {
      const name = p.slice(theme.length + 3)
      // Tailwind reads --color-brand-navy as bg-brand-navy, text-brand-navy, border-brand-navy, and so on.
      if (new RegExp(`(?<![\\w-])[\\w:\\[\\]/.-]*-${escapeRe(name)}(?![\\w-])`).test(corpus)) return false
      if (theme === 'font' && wholeWord(`font-${name}`).test(corpus)) return false
      // A theme name that other CSS reads through its own var() is covered by `read` above.
    }
    return true
  })
  return { classes: deadClasses.sort(), properties: deadProps.sort() }
}
