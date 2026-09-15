/**
 * apps/web/src/server/lib/sanitizeRichText.ts
 *
 * [CHANGE TYPE]: NEW FILE (2026-09-14) — allowlist extended same day
 *   alongside RichTextEditor.tsx's second feature batch.
 * [PURPOSE]: Server-side sanitization for the announcement `body` field
 *   now that it can carry HTML from RichTextEditor.tsx (bold/italic/
 *   underline/strike, headings, blockquote, lists, links, inline images
 *   with fixed alignment, a small fixed text-color palette, single-color
 *   highlight, alignment). This is the real security boundary —
 *   RichTextEditor only ever emits HTML from a fixed set of toolbar
 *   actions, but the /announcements POST/PATCH routes accept raw JSON
 *   over HTTP, so a client bypassing the UI entirely could otherwise post
 *   `<script>`/`onerror=`/`javascript:`/etc. straight into a body that
 *   public.ts later serves on the school's public website.
 *
 *   Allowlist is intentionally exactly what the toolbar can produce —
 *   nothing broader. In particular:
 *     - `style` values are matched against the *exact* strings the
 *       toolbar's fixed option sets can produce (e.g. one of 4 brand hex
 *       colors, one of 3 image-alignment style blocks) — not an open
 *       "any CSS value" allowance, even for an otherwise-safe property
 *       like `color`.
 *     - `img`/`a` src/href schemes are restricted to https/http(/mailto
 *       for links) — blocks `javascript:`/`data:` URIs.
 *   A plain-text body (every article written before RichTextEditor
 *   existed, or any non-News post type that never sees it) has no
 *   matching tags/styles and passes through unchanged.
 * [DEPENDS ON]: sanitize-html
 */

import sanitizeHtml from 'sanitize-html'

const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'em', 'u', 's', 'mark',
  'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4',
  'blockquote', 'a', 'img', 'span',
]

// Exact-string allowlists — must mirror RichTextEditor.tsx's fixed option
// sets (TEXT_COLORS, AlignableImage's three renderHTML branches) byte for
// byte. A new toolbar option needs a matching entry added here, or the
// sanitizer silently strips it back out on save.
const TEXT_COLOR_RE = [/^#1e3a5f$/i, /^#0e8a6a$/i, /^#d97706$/i, /^#dc4f3a$/i]
const IMG_MARGIN_TOP_RE = [/^4px$/, /^12px$/]
const IMG_MARGIN_SIDE_RE = [/^0$/, /^0px$/, /^16px$/, /^auto$/]
const IMG_MAX_WIDTH_RE = [/^45%$/, /^100%$/]

export function sanitizeRichText(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      // Tiptap's TextAlign extension writes `style="text-align: ..."` on
      // block elements — allow only that one property, only those four
      // values, on the block tags it actually targets.
      p: ['style'],
      h1: ['style'],
      h2: ['style'],
      h3: ['style'],
      h4: ['style'],
      a: ['href', 'rel', 'target'],
      img: ['src', 'alt', 'data-align', 'style'],
      // Tiptap's Color extension (via TextStyle) wraps colored text in
      // <span style="color: ...">. No other use of <span> is emitted.
      span: ['style'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: {
      // Images never need mailto: — keep it to just the two real schemes.
      img: ['http', 'https'],
    },
    allowedStyles: {
      '*': {
        'text-align': [/^left$/, /^center$/, /^right$/, /^justify$/],
      },
      img: {
        float: [/^left$/, /^right$/],
        display: [/^block$/],
        'margin-top': IMG_MARGIN_TOP_RE,
        'margin-right': IMG_MARGIN_SIDE_RE,
        'margin-bottom': [/^12px$/],
        'margin-left': IMG_MARGIN_SIDE_RE,
        'max-width': IMG_MAX_WIDTH_RE,
      },
      span: {
        color: TEXT_COLOR_RE,
      },
    },
    // Strip disallowed tags but keep their text content (e.g. a stray
    // <div> from a pasted snippet becomes plain text, not a dropped
    // paragraph) — matches how a plain <textarea> body always behaved.
    disallowedTagsMode: 'discard',
  }).trim()
}
