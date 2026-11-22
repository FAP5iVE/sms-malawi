/**
 * mathRender.test.ts
 * Formulas are untrusted input (a teacher types LaTeX; students and other staff
 * see it rendered). These tests run the REAL KaTeX with the REAL shared options
 * (lib/mathRender.ts) against hostile and malformed input.
 */
import { describe, it, expect } from 'vitest'
import { mathToHtml, katexOptions, MATH_MAX_LENGTH } from '@/lib/mathRender'

// What matters is MARKUP, not text: the typed source is kept (HTML-escaped) in a text
// annotation, so words like "javascript:" or "onerror=" legitimately appear as TEXT.
// (<svg>/<path> are NOT dangerous here: KaTeX draws square roots with them.)
const BAD_TAGS = new Set(['a', 'img', 'script', 'iframe', 'style', 'object', 'embed', 'form', 'input', 'link', 'base', 'meta', 'video', 'audio', 'foreignobject', 'use', 'image'])
const BAD_ATTRS = new Set(['href', 'xlink:href', 'src', 'srcdoc', 'formaction', 'action'])
function markup(html: string) {
  const tags = new Set<string>(), attrs = new Set<string>(), styles: string[] = []
  for (const m of html.matchAll(/<([a-zA-Z][\w-]*)((?:\s+[^<>]*?)?)\/?>/g)) {
    const tagName = m[1]
    const attrText = m[2] ?? ''
    if (!tagName) continue
    tags.add(tagName.toLowerCase())
    for (const a of attrText.matchAll(/([a-zA-Z_:][-\w:.]*)\s*=\s*"([^"]*)"/g)) {
      const attrName = a[1]?.toLowerCase()
      const attrValue = a[2] ?? ''
      if (!attrName) continue
      attrs.add(attrName)
      if (attrName === 'style') styles.push(attrValue)
    }
  }
  return { tags, attrs, styles }
}
const clean = (html: string) => {
  const { tags, attrs, styles } = markup(html)
  return ![...tags].some((t) => BAD_TAGS.has(t))
    && ![...attrs].some((a) => a.startsWith('on') || BAD_ATTRS.has(a))
    && !styles.some((s) => /url\(|expression\(|javascript:/i.test(s))
}

describe('normal rendering', () => {
  it('typesets a fraction and keeps the TeX source as an accessible MathML annotation', () => {
    const html = mathToHtml('\\frac{a}{b}')
    expect(html).toContain('class="katex"')
    expect(html).toContain('<math')
    expect(html).toContain('application/x-tex')
    expect(html).toContain('\\frac{a}{b}')
  })
  it('inline vs display mode', () => {
    expect(mathToHtml('x^2', 'inline')).not.toContain('katex-display')
    expect(mathToHtml('x^2', 'block')).toContain('katex-display')
  })
  it('the options are the hardened ones', () => {
    const o = katexOptions('inline')
    expect(o.trust).toBe(false)
    expect(o.throwOnError).toBe(false)
    expect(o.maxExpand).toBe(1000)
    expect(o.maxSize).toBeLessThan(100)
    expect(o.output).toBe('htmlAndMathml')
  })
  it('an empty formula previews as placeholder text and never throws', () => {
    expect(mathToHtml('')).toContain('preview')
  })
})

describe('hostile LaTeX never produces live links, images, scripts or handlers', () => {
  const payloads: Array<[string, string]> = [
    ['\\href with a javascript: URL',   '\\href{javascript:alert(1)}{click me}'],
    ['\\url',                           '\\url{http://evil.example/x}'],
    ['\\includegraphics',               '\\includegraphics{http://evil.example/x.png}'],
    ['\\htmlClass',                     '\\htmlClass{x}{y}'],
    ['\\htmlData',                      '\\htmlData{a=b}{y}'],
    ['\\htmlId',                        '\\htmlId{x}{y}'],
    ['\\htmlStyle',                     '\\htmlStyle{color:red;background:url(//evil)}{y}'],
    ['raw tag in math mode',            '<img src=x onerror=alert(1)>'],
    ['raw tag in \\text',               '\\text{<script>alert(1)</script>}'],
    ['attribute breakout attempt',      '"><svg onload=alert(1)>'],
    ['style breakout attempt',          '\\color{red;background:url(//evil)}{x}'],
  ]
  for (const [name, latex] of payloads) {
    it(`${name}`, () => {
      const html = mathToHtml(latex)
      expect(typeof html).toBe('string')
      expect(clean(html)).toBe(true)
    })
  }
  it('trusted-only commands are rendered as errors, not honoured', () => {
    const html = mathToHtml('\\href{http://ok.example}{x}')
    expect(markup(html).attrs.has('href')).toBe(false)
    expect(markup(html).tags.has('a')).toBe(false)
    expect(html).toContain('#cc0000') // KaTeX's error colour: shown as a visible error
  })
  it('the typed source is escaped wherever it is echoed (no raw "<" from input)', () => {
    const html = mathToHtml('<img src=x onerror=alert(1)>')
    expect(html).toContain('&lt;img')
    expect(markup(html).tags.has('img')).toBe(false)
  })
  it('legitimate drawing elements are still allowed (sqrt uses svg/path)', () => {
    const { tags } = markup(mathToHtml('\\sqrt{x}'))
    expect(tags.has('svg')).toBe(true)
    expect(clean(mathToHtml('\\sqrt{x}'))).toBe(true)
  })
})

describe('resource limits', () => {
  it('a macro bomb is stopped by maxExpand and returns quickly', () => {
    const t0 = Date.now()
    const html = mathToHtml('\\def\\a{\\a\\a}\\a')
    expect(Date.now() - t0).toBeLessThan(2000)
    expect(html).toContain('#cc0000')
  })
  it('an enormous explicit size is clamped (maxSize) instead of laid out', () => {
    const html = mathToHtml('\\rule{9999em}{9999em}')
    const { styles } = markup(html)
    expect(styles.some((s) => s.includes('9999em'))).toBe(false)
    expect(html).not.toContain('width="9999em"')
    expect(html).toContain('50em') // clamped to the cap
  })
  it('input beyond the cap is truncated, not rendered in full', () => {
    const html = mathToHtml('x'.repeat(MATH_MAX_LENGTH + 500))
    const xs = (html.match(/>x</g) ?? []).length
    expect(xs).toBeLessThan(MATH_MAX_LENGTH + 1)
  })
  it('invalid LaTeX renders as a visible error, never throws', () => {
    for (const bad of ['\\frac{', '\\notacommand', '}{', '\\begin{matrix}', '\\sqrt[']) {
      const html = mathToHtml(bad)
      expect(typeof html).toBe('string')
      expect(html.length).toBeGreaterThan(0)
      expect(clean(html)).toBe(true)
    }
  })
})
