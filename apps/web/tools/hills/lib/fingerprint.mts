/**
 * apps/web/tools/hills/lib/fingerprint.mts
 *
 * [PURPOSE]: Chikangawa Hills theme, Phase 0. Turns a .ts/.tsx source file into
 *   an ordered list of "logic tokens": everything that is behaviour rather than
 *   looks. Two files with the same token multiset behave the same, however
 *   their markup, class names and visible text differ. Used by:
 *     - logic-diff.mts          compares a file against its baseline version
 *     - handler-inventory.mts   records/compares per-file handler inventories
 *
 * [WHAT COUNTS AS LOGIC]  (each becomes a token)
 *   - every statement outside JSX, with JSX and nested blocks collapsed to
 *     placeholders (nested blocks are walked, so each inner statement is its own
 *     token and reports point at the exact line);
 *   - every JSX expression container `{...}` (conditions, maps, children);
 *   - every JSX attribute except the presentational ones (className, style,
 *     SVG geometry, image sizing, ...). onSubmit/onClick/onChange, ref,
 *     disabled, value, key, spreads, etc. are all logic;
 *   - imports, except UI-only modules (components, icons, next/image, ...).
 *
 * [WHAT COUNTS AS A SELECTOR]  (kind "selector", reported separately)
 *   id, name, type, htmlFor, role, aria-*, autoComplete, required, placeholder,
 *   href, data-testid, and the visible text of button / label elements. These
 *   are what Playwright, password managers and screen readers key on, so the
 *   plan freezes them ("Stable selectors").
 *
 * [WHAT IS IGNORED]: comments, whitespace, JSX tag names, JSX text (except the
 *   button / label text above), className/style and other presentational
 *   attributes, the order of tokens (moving a block is not a logic change).
 */

import ts from 'typescript'

export type TokenKind = 'logic' | 'selector' | 'import'

export interface Token {
  kind: TokenKind
  text: string
  /** 1-based line in the file the token came from (for reports only). */
  line: number
}

/** Attributes that only affect looks. Never tokenised. */
const PRESENTATIONAL_ATTRS = new Set([
  'className', 'class', 'style', 'aria-hidden', 'focusable',
  // next/image + media sizing
  'src', 'alt', 'width', 'height', 'sizes', 'priority', 'loading', 'quality',
  'fill', 'blurDataURL', 'unoptimized', 'decoding', 'fetchPriority',
  // component look props
  'variant', 'size', 'asChild', 'side', 'align', 'sideOffset', 'alignOffset',
  // SVG geometry / paint
  'viewBox', 'xmlns', 'preserveAspectRatio', 'd', 'cx', 'cy', 'r', 'rx', 'ry',
  'x', 'y', 'x1', 'x2', 'y1', 'y2', 'points', 'transform', 'opacity',
  'stroke', 'strokeWidth', 'strokeLinecap', 'strokeLinejoin', 'strokeDasharray',
  'strokeOpacity', 'fillOpacity', 'fillRule', 'clipRule', 'stopColor',
  'stopOpacity', 'offset', 'gradientUnits', 'gradientTransform', 'floodColor',
  'floodOpacity', 'stdDeviation', 'dx', 'dy', 'mask', 'clipPath', 'filter',
  'patternUnits', 'maskUnits', 'filterUnits',
])

/** Attributes Playwright / password managers / screen readers rely on. */
const SELECTOR_ATTRS = new Set([
  'id', 'name', 'type', 'htmlFor', 'role', 'aria-label', 'aria-labelledby',
  'aria-describedby', 'autoComplete', 'required', 'placeholder', 'href',
  'action', 'method', 'data-testid',
])

/** Elements whose visible text is part of the accessible name. */
const SELECTOR_TEXT_TAGS = new Set(['button', 'label', 'formlabel', 'legend'])

/** Imports that only bring in visuals. Adding/removing them is never logic. */
const UI_IMPORT_RE =
  /^(@\/components\/|@\/stories\/|lucide-react$|react-icons|next\/image$|next\/link$|next\/font|clsx$|tailwind-merge$|framer-motion$|motion(\/|$)|class-variance-authority$|@\/lib\/utils$)/

const isJsxNode = (n: ts.Node): boolean =>
  ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)

const isJsDocNode = (n: ts.Node): boolean =>
  n.kind >= ts.SyntaxKind.FirstJSDocNode && n.kind <= ts.SyntaxKind.LastJSDocNode

function isStatementPosition(n: ts.Node): boolean {
  const p = n.parent
  if (!p) return false
  if (ts.isSourceFile(p) || ts.isBlock(p) || ts.isModuleBlock(p)) {
    return p.statements.includes(n as ts.Statement)
  }
  if (ts.isCaseClause(p) || ts.isDefaultClause(p)) {
    return p.statements.includes(n as ts.Statement)
  }
  return false
}

export interface FingerprintOptions {
  /** Extra attribute names to treat as presentational. */
  presentationalAttrs?: readonly string[]
}

export function fingerprint(
  source: string,
  fileName: string,
  options: FingerprintOptions = {},
): Token[] {
  const extraPresentational = new Set(options.presentationalAttrs ?? [])
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind)
  const tokens: Token[] = []

  const lineOf = (n: ts.Node): number =>
    sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1

  const emit = (k: TokenKind, text: string, n: ts.Node): void => {
    tokens.push({ kind: k, text: text.replace(/\s+/g, ' ').trim(), line: lineOf(n) })
  }

  /** Token-by-token text of a node, with JSX and nested blocks collapsed. */
  const norm = (node: ts.Node): string => {
    const out: string[] = []
    const rec = (n: ts.Node): void => {
      if (isJsDocNode(n)) return
      if (isJsxNode(n)) {
        out.push('<JSX/>')
        return
      }
      if (ts.isBlock(n)) {
        out.push('{}')
        return
      }
      if (n.getChildCount(sf) === 0) {
        out.push(n.getText(sf))
        return
      }
      for (const c of n.getChildren(sf)) rec(c)
    }
    rec(node)
    return out.join(' ')
  }

  /** Visible text of an element: JSX text plus string literals in {...}. */
  const textOf = (el: ts.JsxElement | ts.JsxFragment): string => {
    const parts: string[] = []
    const visitChild = (c: ts.JsxChild): void => {
      if (ts.isJsxText(c)) {
        const t = c.getText(sf).replace(/\s+/g, ' ').trim()
        if (t) parts.push(t)
      } else if (ts.isJsxExpression(c)) {
        if (!c.expression) return
        const lits: string[] = []
        const grab = (n: ts.Node): void => {
          if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) lits.push(n.text)
          else if (isJsxNode(n)) {
            if (ts.isJsxElement(n) || ts.isJsxFragment(n)) {
              const inner = textOf(n)
              if (inner) lits.push(inner)
            }
          } else ts.forEachChild(n, grab)
        }
        grab(c.expression)
        parts.push(lits.length > 0 ? lits.join('|') : `{${norm(c.expression)}}`)
      } else if (ts.isJsxElement(c) || ts.isJsxFragment(c)) {
        const inner = textOf(c)
        if (inner) parts.push(inner)
      }
    }
    el.children.forEach(visitChild)
    return parts.join(' ').replace(/\s+/g, ' ').trim()
  }

  const handleExpression = (c: ts.JsxExpression): void => {
    if (!c.expression) return // {/* comment */}
    emit('logic', `{ ${norm(c.expression)} }`, c)
    walk(c.expression)
  }

  const handleOpening = (el: ts.JsxOpeningElement | ts.JsxSelfClosingElement): void => {
    for (const attr of el.attributes.properties) {
      if (ts.isJsxSpreadAttribute(attr)) {
        emit('logic', `...{ ${norm(attr.expression)} }`, attr)
        walk(attr.expression)
        continue
      }
      const name = attr.name.getText(sf)
      if (PRESENTATIONAL_ATTRS.has(name) || extraPresentational.has(name)) continue
      const init = attr.initializer
      let value: string
      if (!init) value = 'true'
      else if (ts.isStringLiteral(init)) value = JSON.stringify(init.text)
      else if (ts.isJsxExpression(init)) value = init.expression ? `{ ${norm(init.expression)} }` : ''
      else value = '<JSX/>'
      emit(SELECTOR_ATTRS.has(name) ? 'selector' : 'logic', `${name}=${value}`, attr)
      if (init) {
        if (ts.isJsxExpression(init)) {
          if (init.expression) walk(init.expression)
        } else if (isJsxNode(init)) {
          handleJsx(init)
        }
      }
    }
  }

  const handleJsxChild = (c: ts.JsxChild): void => {
    if (ts.isJsxText(c)) return
    if (ts.isJsxExpression(c)) handleExpression(c)
    else handleJsx(c)
  }

  function handleJsx(n: ts.Node): void {
    if (ts.isJsxSelfClosingElement(n)) {
      handleOpening(n)
    } else if (ts.isJsxElement(n)) {
      handleOpening(n.openingElement)
      const tag = n.openingElement.tagName.getText(sf).toLowerCase()
      if (SELECTOR_TEXT_TAGS.has(tag)) emit('selector', `text(${tag})=${textOf(n)}`, n)
      n.children.forEach(handleJsxChild)
    } else if (ts.isJsxFragment(n)) {
      n.children.forEach(handleJsxChild)
    }
  }

  function walk(n: ts.Node): void {
    if (isJsDocNode(n)) return
    if (isJsxNode(n)) {
      handleJsx(n)
      return
    }
    if (ts.isImportDeclaration(n)) {
      const spec = ts.isStringLiteral(n.moduleSpecifier) ? n.moduleSpecifier.text : ''
      if (!UI_IMPORT_RE.test(spec)) emit('import', norm(n), n)
      return
    }
    if (isStatementPosition(n)) emit('logic', norm(n), n)
    ts.forEachChild(n, walk)
  }

  walk(sf)
  return tokens
}

const keyOf = (t: Token): string => `${t.kind}\u0001${t.text}`

export interface TokenDiff {
  removed: Token[]
  added: Token[]
}

/** Multiset difference: order-insensitive, so moving markup is not a change. */
export function diffTokens(before: readonly Token[], after: readonly Token[]): TokenDiff {
  const counts = new Map<string, number>()
  for (const t of before) counts.set(keyOf(t), (counts.get(keyOf(t)) ?? 0) + 1)
  const added: Token[] = []
  for (const t of after) {
    const k = keyOf(t)
    const c = counts.get(k) ?? 0
    if (c > 0) counts.set(k, c - 1)
    else added.push(t)
  }
  const left = new Map(counts)
  const removed: Token[] = []
  for (const t of before) {
    const k = keyOf(t)
    const c = left.get(k) ?? 0
    if (c > 0) {
      removed.push(t)
      left.set(k, c - 1)
    }
  }
  return { removed, added }
}

/** Order-insensitive digest of a token list (for the inventory baseline). */
export async function digestTokens(tokens: readonly Token[]): Promise<string> {
  const { createHash } = await import('node:crypto')
  const lines = tokens.map(keyOf).sort()
  return createHash('sha1').update(lines.join('\n')).digest('hex')
}
