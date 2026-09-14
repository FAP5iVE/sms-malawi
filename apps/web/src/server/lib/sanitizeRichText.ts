/**
 * apps/web/src/server/lib/sanitizeRichText.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: Server-side sanitization for the announcement `body` field
 *   now that it can carry HTML from RichTextEditor.tsx (bold/italic,
 *   alignment, bullet/numbered lists, highlight). This is the real
 *   security boundary — RichTextEditor only ever emits HTML from a fixed
 *   set of toolbar actions, but the /announcements POST/PATCH routes
 *   accept raw JSON over HTTP, so a client bypassing the UI entirely
 *   could otherwise post `<script>`/`onerror=`/etc. straight into a body
 *   that public.ts later serves on the school's public website.
 *
 *   Allowlist is intentionally exactly what the toolbar can produce —
 *   nothing broader. A plain-text body (every article written before
 *   this change, or any non-News/Event post type that never sees the
 *   rich text editor) has no matching tags and passes through unchanged.
 * [DEPENDS ON]: sanitize-html
 */

import sanitizeHtml from 'sanitize-html'

const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'em', 'mark',
  'ul', 'ol', 'li',
  'h1', 'h2', 'h3',
]

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
    },
    allowedStyles: {
      '*': {
        'text-align': [/^left$/, /^center$/, /^right$/, /^justify$/],
      },
    },
    // Strip disallowed tags but keep their text content (e.g. a stray
    // <div> from a pasted snippet becomes plain text, not a dropped
    // paragraph) — matches how a plain <textarea> body always behaved.
    disallowedTagsMode: 'discard',
  }).trim()
}
