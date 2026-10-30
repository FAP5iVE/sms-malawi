/**
 * [FILE]: apps/web/src/lib/mathRender.ts
 * [PURPOSE]: The ONE place formulas are typeset. Used by the editor (live preview,
 *   in-editor rendering) and by <RichContent/> (read-only rendering), and tested
 *   directly. Input is untrusted LaTeX (a teacher types it, the server stores the
 *   source only), so every render goes through the same hardened KaTeX options:
 *
 *     trust:false         \href, \url, \includegraphics, \htmlClass/\htmlData/\htmlId/
 *                         \htmlStyle are refused (rendered as an error, never as markup)
 *     maxExpand           caps macro expansion, so \def\a{\a\a}\a cannot hang the tab
 *     maxSize             caps explicit sizes, so \rule{999em}{999em} cannot blow up layout
 *     strict:'ignore'     unknown commands become visible errors without console noise
 *     throwOnError:false  invalid LaTeX is shown as red source text, never thrown
 *     output:'htmlAndMathml'  visual layer + a MathML layer (with the TeX source as an
 *                         annotation) that screen readers use
 *
 *   KaTeX is used instead of the browser's native MathML because MathML Core only
 *   shipped in Chrome 109 (2023): older Android browsers/WebViews would flatten
 *   "x^2" to the text "x2", silently changing the maths.
 */
import katex from 'katex'

export const MATH_MAX_LENGTH = 500
export type MathDisplay = 'inline' | 'block'

export function katexOptions(display: MathDisplay) {
  return {
    throwOnError: false,
    displayMode: display === 'block',
    trust: false,
    strict: 'ignore',
    maxExpand: 1000,
    maxSize: 50,
    output: 'htmlAndMathml',
  } as const
}

/** Typeset `latex` into `el`. On any failure the element keeps the plain source. */
export function renderMath(el: HTMLElement, latex: string, display: MathDisplay = 'inline'): void {
  try {
    katex.render(latex.slice(0, MATH_MAX_LENGTH), el, katexOptions(display))
  } catch {
    el.textContent = latex
  }
}

/** KaTeX's own generated markup for `latex` (never the typed text itself). '' on failure. */
export function mathToHtml(latex: string, display: MathDisplay = 'inline'): string {
  try {
    return katex.renderToString(latex.slice(0, MATH_MAX_LENGTH) || '\\text{preview}', katexOptions(display))
  } catch {
    return ''
  }
}
