/**
 * apps/web/tools/hills/lib/ratchets.mts
 *
 * [PURPOSE]: Chikangawa Hills theme, Phase 9. Pure detectors for the three source
 *   ratchets (RULEBOOK R2.6 and R4):
 *     1. pills            a `rounded-full` class together with horizontal padding
 *                         px-1.5 to px-3 in one class string (a status or role pill)
 *     2. legacy pairs     `bg-brand-teal` or `bg-brand-coral` together with `text-white`
 *                         in one class string (replaced by bg-btn-brand / bg-btn-danger)
 *     3. AI tells         words and marks in text the user reads (RULEBOOK section 4)
 *   They read the TypeScript syntax tree, so comments are never counted.
 */
import ts from 'typescript'

export interface Hit { rule: string; line: number; text: string }

// ── helpers ──────────────────────────────────────────────────────────────────
function parse(file: string, source: string): ts.SourceFile {
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
}

function lineOf(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
}

interface Lit { text: string; line: number; kind: 'string' | 'jsx' }

/** Every piece of literal text in the file: strings, template parts and JSX text. */
export function literals(file: string, source: string): Lit[] {
  const sf = parse(file, source)
  const out: Lit[] = []
  const visit = (n: ts.Node): void => {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) out.push({ text: n.text, line: lineOf(sf, n), kind: 'string' })
    else if (ts.isTemplateExpression(n)) {
      out.push({ text: n.head.text, line: lineOf(sf, n), kind: 'string' })
      for (const s of n.templateSpans) out.push({ text: s.literal.text, line: lineOf(sf, s), kind: 'string' })
    } else if (ts.isJsxText(n)) {
      const t = n.getText(sf).replace(/\s+/g, ' ').trim()
      if (t) out.push({ text: t, line: lineOf(sf, n), kind: 'jsx' })
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return out
}

const hasClass = (s: string, c: string): boolean => new RegExp(`(?<![\\w/:-])${c.replace(/[.]/g, '\\.')}(?![\\w/-])`).test(s)

// ── 1. pills ─────────────────────────────────────────────────────────────────
const PILL_PADDING = ['px-1.5', 'px-2', 'px-2.5', 'px-3']
export function findPills(file: string, source: string): Hit[] {
  return literals(file, source)
    .filter((l) => l.kind === 'string' && hasClass(l.text, 'rounded-full') && PILL_PADDING.some((p) => hasClass(l.text, p)))
    .map((l) => ({ rule: 'pill', line: l.line, text: l.text.slice(0, 100) }))
}

// ── 2. legacy button pairs ───────────────────────────────────────────────────
export function findLegacyPairs(file: string, source: string): Hit[] {
  return literals(file, source)
    .filter((l) => l.kind === 'string' && hasClass(l.text, 'text-white') && (hasClass(l.text, 'bg-brand-teal') || hasClass(l.text, 'bg-brand-coral')))
    .map((l) => ({ rule: 'legacy-pair', line: l.line, text: l.text.slice(0, 100) }))
}

// ── 3. AI tells (RULEBOOK section 4) ─────────────────────────────────────────
export const TELLS: ReadonlyArray<{ rule: string; re: RegExp; jsxOnly?: boolean }> = [
  { rule: 'em-dash', re: /—/ },
  { rule: 'abbreviation', re: /\b(?:e\.g\.|i\.e\.|etc\.)/i },
  { rule: 'at-a-glance', re: /\b(?:at a glance|all in one place|stay on top of)\b/i },
  { rule: 'internal-word', re: /\b(?:delve|seamless(?:ly)?|robust|comprehensive|streamline[sd]?|empower(?:s|ed)?|leverage[sd]?|insights|hub|portal)\b/i },
  { rule: 'manage-your', re: /^(?:Manage|View) your /i },
  { rule: 'coming-soon', re: /\bComing soon\b/i },
  { rule: 'exclamation', re: /[A-Za-z0-9)]!(?:\s|$)/ },
  { rule: 'oops', re: /\boops\b/i },
  { rule: 'click', re: /\bClick\b/ },
]

/** A string that is a class list, a path, a key or code is not text the user reads. */
export function looksLikeProse(text: string): boolean {
  if (!/[A-Za-z]{3}/.test(text)) return false
  if (/^[\w./:#?&=@%+-]+$/.test(text)) return false // one token: path, key, class, id
  const tokens = text.trim().split(/\s+/)
  if (tokens.length >= 2 && tokens.every((t) => /^[\w:/[\]().,*&>%!#=~'"-]+$/.test(t)) && tokens.filter((t) => /[-:[]/.test(t)).length / tokens.length >= 0.6) return false // class list
  return true
}

export function findTells(file: string, source: string): Hit[] {
  const hits: Hit[] = []
  for (const l of literals(file, source)) {
    if (!looksLikeProse(l.text)) continue
    for (const t of TELLS) {
      if (t.re.test(l.text)) hits.push({ rule: t.rule, line: l.line, text: l.text.slice(0, 100) })
    }
  }
  return hits
}
