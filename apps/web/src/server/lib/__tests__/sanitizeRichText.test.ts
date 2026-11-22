/**
 * sanitizeRichText.test.ts
 * The server-side allowlist for rich text. Assignment content is typed by teachers and
 * shown to students and other staff, so it must never carry script, event handlers,
 * dangerous URLs or foreign pictures - while formulas ("<span data-math>") and normal
 * editor output must survive. News/announcement bodies (math off) keep the narrower list.
 */
import { describe, it, expect } from 'vitest'
import { sanitizeRichText, MAX_MATH_LENGTH } from '../sanitizeRichText'

const IMG_PREFIX = 'https://cloud.example.org/v1/storage/buckets/school/files/assignment_image_'
const opts = { math: true, imageSrcPrefix: IMG_PREFIX }
const clean = (html: string, o: Parameters<typeof sanitizeRichText>[1] = opts) => sanitizeRichText(html, o)

// Real tags and attribute NAMES only: text inside a quoted attribute value (e.g. the
// escaped LaTeX source) must not count as an attribute.
function elements(html: string) {
  const out: Array<{ tag: string; attrs: string[] }> = []
  for (const m of html.matchAll(/<([a-zA-Z][\w-]*)((?:\s+[a-zA-Z_:][-\w:.]*(?:\s*=\s*"[^"]*")?)*)\s*\/?>/g)) {
    const names = [...(m[2] ?? '').replace(/"[^"]*"/g, '""').matchAll(/\s([a-zA-Z_:][-\w:.]*)/g)].map((a) => a[1]!.toLowerCase())
    out.push({ tag: m[1]!.toLowerCase(), attrs: names })
  }
  return out
}

describe('script and handler injection', () => {
  it('removes script, iframe, object, style and event handlers', () => {
    const out = clean('<p onclick="x()">hi</p><script>alert(1)</script><iframe src="https://e.example"></iframe><object data="x"></object><style>p{}</style><img src="' + IMG_PREFIX + 'a1b2c3d4e5/view" onerror="alert(1)">')
    expect(out).not.toMatch(/<script|<iframe|<object|<style|onclick|onerror/i)
    expect(out).toContain('hi')
  })
  it('refuses javascript:, data: and vbscript: URLs in links', () => {
    for (const href of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=', 'vbscript:x']) {
      expect(clean(`<a href="${href}">x</a>`)).not.toMatch(/javascript:|data:|vbscript:/i)
    }
    expect(clean('<a href="https://example.org">ok</a>')).toContain('href="https://example.org"')
  })
})

describe('pictures', () => {
  it('keeps pictures hosted in the school bucket prefix and drops everything else', () => {
    expect(clean(`<img src="${IMG_PREFIX}Ab12Cd34Ef56/view?project=p" alt="diagram">`)).toContain('<img')
    expect(clean('<img src="https://evil.example/track.png">')).not.toContain('<img')
    expect(clean('<img src="http://cloud.example.org/other/file.png">')).not.toContain('<img')
    expect(clean('<img src="data:image/png;base64,AAAA">')).not.toContain('<img')
    expect(clean('<img src="//evil.example/x.png">')).not.toContain('<img')
  })
  it('without an imageSrcPrefix the original behaviour is unchanged (News/announcements)', () => {
    expect(sanitizeRichText('<img src="https://anywhere.example/x.png">')).toContain('<img')
  })
})

describe('formulas', () => {
  it('keeps <span data-math> with its display mode when math is on', () => {
    const out = clean('<p>Solve <span data-math="\\frac{a}{b}" data-display="block">\\frac{a}{b}</span></p>')
    expect(out).toContain('data-math="\\frac{a}{b}"')
    expect(out).toContain('data-display="block"')
  })
  it('forces data-display to inline or block', () => {
    const out = clean('<span data-math="x^2" data-display="javascript:alert(1)">x^2</span>')
    expect(out).toContain('data-display="inline"')
    expect(out).not.toMatch(/javascript:/i)
  })
  it('a formula longer than the cap is NOT truncated: its attributes go, its readable source stays as text', () => {
    const long = 'x+'.repeat(MAX_MATH_LENGTH)
    const out = clean(`<span data-math="${long}">${long}</span>`)
    expect(out).not.toContain('data-math')
    expect(out).toContain('x+x+')
  })
  it('an empty data-math attribute is dropped', () => {
    expect(clean('<span data-math="  " data-display="block">1</span>')).not.toContain('data-math')
  })
  it('hostile LaTeX source is only ever an attribute VALUE or text, never markup', () => {
    const out = clean('<span data-math="&quot;&gt;&lt;img src=x onerror=alert(1)&gt;">&lt;img src=x onerror=alert(1)&gt;</span>')
    const els = elements(out)
    expect(els.some((e) => e.tag === 'img')).toBe(false)
    expect(els.some((e) => e.attrs.some((a) => a.startsWith('on')))).toBe(false)
    expect(els.filter((e) => e.tag === 'span').length).toBe(1) // still one formula span
  })
  it('other span attributes (class, id, style beyond colour) do not survive', () => {
    const out = clean('<span data-math="x" class="evil" id="a" data-other="1">x</span>')
    expect(out).not.toMatch(/class=|id=|data-other/)
  })
  it('with math OFF (News/announcements) formula attributes are stripped as before', () => {
    const out = sanitizeRichText('<span data-math="x^2" data-display="block">x^2</span>')
    expect(out).not.toContain('data-math')
    expect(out).not.toContain('data-display')
  })
})

describe('normal editor output survives', () => {
  it('keeps the headings, lists, emphasis and blockquote the editor can produce', () => {
    const html = '<h2>T</h2><ul><li><strong>a</strong></li></ul><ol><li><em>b</em></li></ol><blockquote>q</blockquote><p><u>u</u> <s>s</s> <mark>m</mark></p>'
    const out = clean(html)
    for (const tag of ['<h2>', '<ul>', '<ol>', '<li>', '<strong>', '<em>', '<blockquote>', '<mark>']) expect(out).toContain(tag)
  })
  it('is idempotent: sanitising twice changes nothing (it runs on write AND on read)', () => {
    const html = '<p>Hi <span data-math="x^2" data-display="inline">x^2</span> <a href="https://example.org">l</a></p>'
    const once = clean(html)
    expect(clean(once)).toBe(once)
  })
})
