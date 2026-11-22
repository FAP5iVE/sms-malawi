import 'server-only'

/*
 * [CHANGE TYPE]: PRESENTATION ONLY (Chikangawa Hills phase 8f, RULEBOOK section 11)
 * [PURPOSE]: The shared email shell. Same function names, same inputs, same outputs
 *   (subject, html, text). Only the look changed:
 *   - solid navy band with the hosted crest (56px, 2x source) and the school name as live text
 *   - 600px single column, 16px body, line height 1.5, buttons at least 44px high and 200px wide,
 *     full width on phones
 *   - colour-scheme meta tags and a small dark-mode style block; the navy band stays navy
 *   - status colour lives in a banner and in text tones that pass 4.5:1, never in white text on
 *     a coloured band, and every banner and status word also carries a word or mark
 *   - sentence case, no uppercase tracking labels, no emoji, no em dashes
 *   Helpers below (para, note, banner, details, tone) keep the 10 templates short.
 */

// ─────────────────────────────────────────────────────────
//  DESIGN TOKENS (email-safe values)
// ─────────────────────────────────────────────────────────

const TOKEN = {
  // Colours. The ACCENT_* values are text tones: each passes 4.5:1 on white and on its own tint.
  PRIMARY:      '#1e3a5f',   // Navy: header band, buttons
  PRIMARY_DARK: '#162d4a',
  ACCENT_BLUE:  '#1e5f8a',
  ACCENT_GREEN: '#166534',
  ACCENT_ORANGE:'#9a3412',
  ACCENT_RED:   '#9b1c1c',
  ACCENT_AMBER: '#92400e',
  WHITE:        '#ffffff',
  BG_PAGE:      '#f4f7f9',
  BG_CONTENT:   '#ffffff',
  BG_FOOTER:    '#eef1f4',
  BG_ROW:       '#f9fafb',
  TEXT_DARK:    '#1a1a2e',
  TEXT_BODY:    '#374151',
  TEXT_MUTED:   '#4b5563',   // Was #6b7280 (4.8:1); now 7:1 so small text reads in sunlight
  BAND_TEXT:    '#c7d7ea',   // Label on the navy band
  BORDER:       '#d1d5db',
  // Typography
  FONT_STACK:   'Arial, Helvetica, sans-serif',
  // Single quotes on purpose: this value is placed inside style="..." attributes, where a double
  // quote ends the attribute early and drops the rest of the style (white-on-navy school name
  // rendered black). Fixed 2026-11-14.
  FONT_HEADING: "Georgia, 'Times New Roman', serif",
} as const

export type Tone = 'red' | 'green' | 'amber' | 'blue' | 'neutral'

/** Text colour, tint and edge colour for each status tone, plus the mark shown before the title. */
const TONES: Record<Tone, { text: string; tint: string; edge: string; cls: string; mark: string }> = {
  red:     { text: TOKEN.ACCENT_RED,   tint: '#fef2f2', edge: '#b91c1c', cls: 'em-red',   mark: '&#10005;' },
  green:   { text: TOKEN.ACCENT_GREEN, tint: '#f0fdf4', edge: '#15803d', cls: 'em-green', mark: '&#10003;' },
  amber:   { text: TOKEN.ACCENT_AMBER, tint: '#fffbeb', edge: '#b45309', cls: 'em-amber', mark: '!' },
  blue:    { text: TOKEN.ACCENT_BLUE,  tint: '#eff6ff', edge: '#2e86ab', cls: 'em-blue',  mark: 'i' },
  neutral: { text: TOKEN.TEXT_BODY,    tint: '#f3f4f6', edge: '#6b7280', cls: 'em-t',     mark: '&#8226;' },
}

// ─────────────────────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────────────────────

export interface SchoolBranding {
  schoolName:   string
  schoolAddress: string
  schoolEmail:  string
  schoolPhone:  string
  loginUrl:     string
}

export interface CtaButton {
  label: string
  url:   string
}

export interface EmailShellOptions {
  previewText:   string
  /** Short sentence-case label under the school name, for example "Fee reminder". */
  headerLabel?:  string
  body:          string
  cta?:          CtaButton
  footerExtra?:  string
  school:        SchoolBranding
}

export interface EmailMessage {
  subject: string
  html:    string
  text:    string
}

// ─────────────────────────────────────────────────────────
//  SHARED PRIMITIVES
// ─────────────────────────────────────────────────────────

const PAD = 'em-pad'

function buttonVml(label: string, url: string): string {
  // VML button for Outlook, regular href button for all other clients
  return `
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
  href="${url}" style="height:44px;v-text-anchor:middle;width:240px;" arcsize="8%" strokecolor="${TOKEN.PRIMARY}" fillcolor="${TOKEN.PRIMARY}">
  <w:anchorlock/>
  <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${label}</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-->
<a href="${url}" class="em-btn"
   style="background-color:${TOKEN.PRIMARY};border-radius:6px;color:#ffffff;display:inline-block;
          font-family:${TOKEN.FONT_STACK};font-size:16px;font-weight:bold;
          line-height:44px;min-width:200px;padding:0 28px;box-sizing:border-box;text-align:center;text-decoration:none;
          -webkit-text-size-adjust:none;">
  ${label}
</a>
<!--<![endif]-->`.trim()
}

export function divider(): string {
  return `<tr><td class="${PAD}" style="padding:0 32px;">
    <hr class="em-line" style="border:none;border-top:1px solid ${TOKEN.BORDER};margin:0;" />
  </td></tr>`
}

/** One or more paragraphs in body size (16px, line height 1.5). */
export function para(...parts: string[]): string {
  const inner = parts
    .map((p, i) => `<p style="margin:${i === 0 ? '0' : '12px'} 0 0;">${p}</p>`)
    .join('')
  return `
    <tr>
      <td class="${PAD} em-t" style="padding:20px 32px 0;font-family:${TOKEN.FONT_STACK};font-size:16px;color:${TOKEN.TEXT_BODY};line-height:1.5;">
        ${inner}
      </td>
    </tr>`
}

/** Smaller supporting text (14px, muted). */
export function note(html: string): string {
  return `
    <tr>
      <td class="${PAD} em-m" style="padding:16px 32px 0;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_MUTED};line-height:1.5;">
        ${html}
      </td>
    </tr>`
}

/** Coloured word inside a sentence. The word still says what it means. */
export function tone(t: Tone, html: string): string {
  const c = TONES[t]
  return `<strong class="${c.cls}" style="color:${c.text};">${html}</strong>`
}

/**
 * Status banner: tint, left edge, a mark and a title in words. Colour is never the only signal.
 */
export function banner(opts: { tone: Tone; title: string; detail?: string }): string {
  const c = TONES[opts.tone]
  return `
    <tr>
      <td class="${PAD}" style="padding:24px 32px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
          <tr>
            <td class="em-tint" bgcolor="${c.tint}" style="background-color:${c.tint};border-left:4px solid ${c.edge};border-radius:4px;padding:16px 18px;">
              <p class="${c.cls}" style="margin:0;font-family:${TOKEN.FONT_STACK};font-size:18px;font-weight:bold;color:${c.text};line-height:1.4;"><span aria-hidden="true">${c.mark}&nbsp;</span>${opts.title}</p>
              ${opts.detail ? `<p class="em-t" style="margin:6px 0 0;font-family:${TOKEN.FONT_STACK};font-size:16px;color:${TOKEN.TEXT_BODY};line-height:1.5;">${opts.detail}</p>` : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>`
}

export interface DetailRow {
  label:  string
  value:  string
  /** Colours the value text. The value must still be a word or number that stands alone. */
  tone?:  Tone
  /** Larger, bold value for the key figure. */
  big?:   boolean
}

/**
 * Label and value rows in a bordered box. On phones the label sits above its value.
 */
export function details(opts: { title?: string; rows: DetailRow[] }): string {
  const rows = opts.rows.map((r, i) => {
    const last = i === opts.rows.length - 1
    const bg = i % 2 === 1 ? ` class="em-tint" bgcolor="${TOKEN.BG_ROW}" style="background-color:${TOKEN.BG_ROW};"` : ''
    const edge = last ? '' : `border-bottom:1px solid ${TOKEN.BORDER};`
    const c = r.tone ? TONES[r.tone] : null
    const valueCls = c ? c.cls : 'em-t'
    const valueColor = c ? c.text : TOKEN.TEXT_DARK
    return `
          <tr${bg}>
            <td class="em-stack em-lab em-m em-line" style="padding:12px 16px;width:38%;vertical-align:top;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_MUTED};line-height:1.5;${edge}">${r.label}</td>
            <td class="em-stack em-val ${valueCls} em-line" style="padding:12px 16px;vertical-align:top;font-family:${TOKEN.FONT_STACK};font-size:${r.big ? '20' : '16'}px;font-weight:${r.big || r.tone ? 'bold' : '600'};color:${valueColor};line-height:1.4;${edge}">${r.value}</td>
          </tr>`
  }).join('')

  return `
    <tr>
      <td class="${PAD}" style="padding:20px 32px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" class="em-line" style="width:100%;border:1px solid ${TOKEN.BORDER};border-radius:6px;">
          ${opts.title ? `<tr class="em-tint" bgcolor="${TOKEN.BG_ROW}" style="background-color:${TOKEN.BG_ROW};">
            <td colspan="2" class="em-m em-line" style="padding:12px 16px;font-family:${TOKEN.FONT_STACK};font-size:14px;font-weight:bold;color:${TOKEN.TEXT_MUTED};border-bottom:1px solid ${TOKEN.BORDER};">${opts.title}</td>
          </tr>` : ''}${rows}
        </table>
      </td>
    </tr>`
}

/** Keeps a subject to about 60 characters, cutting at a word. */
export function fitSubject(subject: string, max = 60): string {
  if (subject.length <= max) return subject
  const cut = subject.slice(0, max - 1)
  const at = cut.lastIndexOf(' ')
  return `${(at > 30 ? cut.slice(0, at) : cut).replace(/[\s,.:;]+$/, '')}…`
}

/** The app's origin, for the hosted crest. Works when loginUrl carries a path. */
function appOrigin(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return 'https://sms-malawi.vercel.app'
  }
}

const STYLE_BLOCK = `
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  a { color: ${TOKEN.PRIMARY}; }
  @media only screen and (max-width: 480px) {
    .em-pad { padding-left: 20px !important; padding-right: 20px !important; }
    .em-btn { display: block !important; width: 100% !important; }
    .em-stack { display: block !important; width: 100% !important; box-sizing: border-box; }
    .em-lab { border-bottom: 0 !important; padding-bottom: 0 !important; }
    .em-val { padding-top: 2px !important; }
    .em-outer { padding: 12px 8px !important; }
  }
  @media (prefers-color-scheme: dark) {
    .em-page { background-color: #0f1720 !important; }
    .em-card { background-color: #17212c !important; }
    .em-foot { background-color: #101821 !important; }
    .em-tint { background-color: #223041 !important; }
    .em-line { border-color: #3b4756 !important; }
    .em-t { color: #e5e7eb !important; }
    .em-m { color: #b4bfcd !important; }
    .em-red { color: #fca5a5 !important; }
    .em-green { color: #86efac !important; }
    .em-amber { color: #fcd34d !important; }
    .em-blue { color: #93c5fd !important; }
    .em-btn { background-color: #2f5f94 !important; color: #ffffff !important; }
    a { color: #93c5fd; }
  }
`

// ─────────────────────────────────────────────────────────
//  HTML EMAIL SHELL
// ─────────────────────────────────────────────────────────

/**
 * Builds the complete HTML email wrapping the provided body fragment.
 * The body should contain only <tr> rows to be inserted inside the
 * content table.
 */
export function buildEmailHtml(opts: EmailShellOptions): string {
  const crestUrl = `${appOrigin(opts.school.loginUrl)}/email-crest.png`

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <meta name="format-detection" content="telephone=no,date=no,address=no,email=no" />
  <title>${opts.school.schoolName}</title>
  <style>${STYLE_BLOCK}</style>
  <!--[if mso]>
  <noscript>
    <xml><o:OfficeDocumentSettings>
      <o:PixelsPerInch>96</o:PixelsPerInch>
    </o:OfficeDocumentSettings></xml>
  </noscript>
  <![endif]-->
</head>
<body class="em-page" style="margin:0;padding:0;background-color:${TOKEN.BG_PAGE};font-family:${TOKEN.FONT_STACK};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

<!-- Preview text (hidden) -->
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
  ${opts.previewText}&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;
</div>

<!-- Outer wrapper -->
<table role="presentation" cellpadding="0" cellspacing="0" class="em-page" bgcolor="${TOKEN.BG_PAGE}" style="width:100%;background-color:${TOKEN.BG_PAGE};">
  <tr>
    <td align="center" class="em-outer" style="padding:24px 16px;">

      <!-- Email card, max 600px -->
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">

        <!-- Header band: solid navy in every colour scheme -->
        <tr>
          <td class="${PAD}" bgcolor="${TOKEN.PRIMARY}" style="background-color:${TOKEN.PRIMARY};border-radius:8px 8px 0 0;padding:20px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
              <tr>
                <td width="56" style="width:56px;padding:0 14px 0 0;vertical-align:middle;">
                  <img src="${crestUrl}" width="56" height="56" alt="Chikangawa Hills Academy" style="display:block;width:56px;height:56px;border:0;outline:none;text-decoration:none;color:#ffffff;font-family:${TOKEN.FONT_STACK};font-size:12px;" />
                </td>
                <td style="vertical-align:middle;">
                  <p style="margin:0;font-family:${TOKEN.FONT_HEADING};font-size:20px;font-weight:bold;color:#ffffff;line-height:1.3;">
                    ${opts.school.schoolName}
                  </p>
                  ${opts.headerLabel ? `<p style="margin:2px 0 0;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.BAND_TEXT};line-height:1.4;">${opts.headerLabel}</p>` : ''}
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Content card -->
        <tr>
          <td class="em-card" bgcolor="${TOKEN.BG_CONTENT}" style="background-color:${TOKEN.BG_CONTENT};padding:0;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">

              ${opts.body}

              ${opts.cta ? `
              <!-- CTA -->
              <tr>
                <td class="${PAD}" align="center" style="padding:28px 32px 32px;text-align:center;">
                  ${buttonVml(opts.cta.label, opts.cta.url)}
                </td>
              </tr>` : `
              <tr><td style="padding:0 0 28px;"></td></tr>`}

            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td class="${PAD} em-foot" bgcolor="${TOKEN.BG_FOOTER}" style="background-color:${TOKEN.BG_FOOTER};border-radius:0 0 8px 8px;padding:20px 32px;">
            <p class="em-m" style="margin:0 0 4px;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_MUTED};line-height:1.5;">
              ${opts.school.schoolName}, ${opts.school.schoolAddress}
            </p>
            <p class="em-m" style="margin:0 0 4px;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_MUTED};line-height:1.5;">
              <a href="mailto:${opts.school.schoolEmail}" class="em-m" style="color:${TOKEN.TEXT_MUTED};text-decoration:underline;">${opts.school.schoolEmail}</a>
              ${opts.school.schoolPhone ? `&bull; ${opts.school.schoolPhone}` : ''}
            </p>
            ${opts.footerExtra ? `<p class="em-m" style="margin:8px 0 0;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_MUTED};line-height:1.5;">${opts.footerExtra}</p>` : ''}
            <p class="em-m" style="margin:12px 0 0;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_MUTED};line-height:1.5;">
              Nobody reads replies to this address. To reach the school, use the email or phone number above.
            </p>
          </td>
        </tr>

      </table>
      <!-- end email card -->

    </td>
  </tr>
</table>

</body>
</html>`
}

// ─────────────────────────────────────────────────────────
//  PLAIN TEXT SHELL
// ─────────────────────────────────────────────────────────

/**
 * Builds a plain-text email with consistent school header/footer.
 * The body should be raw text, no HTML tags.
 */
export function buildEmailText(
  body:   string,
  school: SchoolBranding
): string {
  const dividerLine = '-'.repeat(48)

  return [
    school.schoolName,
    dividerLine,
    '',
    body.trim(),
    '',
    dividerLine,
    `${school.schoolName}`,
    `${school.schoolAddress}`,
    `${school.schoolEmail}  |  ${school.schoolPhone}`,
    '',
    'Nobody reads replies to this address. To reach the school, use the email or phone number above.',
    `Sign in: ${school.loginUrl}`,
  ].join('\n')
}

// ─────────────────────────────────────────────────────────
//  DESIGN TOKENS: re-exported for use in templates
// ─────────────────────────────────────────────────────────

export { TOKEN, TONES }
