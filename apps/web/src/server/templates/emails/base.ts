import 'server-only'

// ─────────────────────────────────────────────────────────
//  DESIGN TOKENS (email-safe values)
// ─────────────────────────────────────────────────────────

const TOKEN = {
  // Colours
  PRIMARY:      '#1e3a5f',   // Navy — header background, primary buttons
  PRIMARY_DARK: '#162d4a',   // Darker navy — button hover (static)
  ACCENT_BLUE:  '#2e86ab',   // Blue — info highlights
  ACCENT_GREEN: '#2d6a4f',   // Green — success states
  ACCENT_ORANGE:'#e76f51',   // Orange — warnings
  ACCENT_RED:   '#c0392b',   // Red — critical alerts
  ACCENT_AMBER: '#d4a017',   // Amber — library/overdue warnings
  WHITE:        '#ffffff',
  BG_PAGE:      '#f4f7f9',   // Page background
  BG_CONTENT:   '#ffffff',   // Content card background
  BG_FOOTER:    '#eef1f4',   // Footer background
  TEXT_DARK:    '#1a1a2e',   // Primary text
  TEXT_BODY:    '#374151',   // Body text
  TEXT_MUTED:   '#6b7280',   // Muted / caption text
  BORDER:       '#d1d5db',   // Divider colour
  // Typography
  FONT_STACK:   'Arial, Helvetica, sans-serif',
  FONT_HEADING: 'Georgia, "Times New Roman", serif',
} as const

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
  /** Defaults to PRIMARY navy */
  color?: string
}

export interface EmailShellOptions {
  previewText:   string
  headerLabel?:  string
  headerColor?:  string
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

function buttonVml(label: string, url: string, color: string): string {
  // VML button for Outlook — regular href button for all other clients
  return `
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
  href="${url}" style="height:44px;v-text-anchor:middle;width:200px;" arcsize="8%" strokecolor="${color}" fillcolor="${color}">
  <w:anchorlock/>
  <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;">${label}</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-->
<a href="${url}"
   style="background-color:${color};border-radius:6px;color:#ffffff;display:inline-block;
          font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;
          line-height:44px;text-align:center;text-decoration:none;width:200px;
          -webkit-text-size-adjust:none;">
  ${label}
</a>
<!--<![endif]-->`.trim()
}

function divider(): string {
  return `<tr><td style="padding:0 32px;">
    <hr style="border:none;border-top:1px solid ${TOKEN.BORDER};margin:0;" />
  </td></tr>`
}

// ─────────────────────────────────────────────────────────
//  HTML EMAIL SHELL
// ─────────────────────────────────────────────────────────

/**
 * Builds the complete HTML email wrapping the provided body fragment.
 * The body should contain only <tr> rows to be inserted inside the
 * content table.
 */
export function buildEmailHtml(opts: EmailShellOptions): string {
  const headerColor = opts.headerColor ?? TOKEN.PRIMARY
  const ctaColor    = opts.cta?.color  ?? TOKEN.PRIMARY

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="format-detection" content="telephone=no,date=no,address=no,email=no" />
  <title>${opts.school.schoolName}</title>
  <!--[if mso]>
  <noscript>
    <xml><o:OfficeDocumentSettings>
      <o:PixelsPerInch>96</o:PixelsPerInch>
    </o:OfficeDocumentSettings></xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${TOKEN.BG_PAGE};font-family:${TOKEN.FONT_STACK};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

<!-- Preview text (hidden) -->
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
  ${opts.previewText}&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;
</div>

<!-- Outer wrapper -->
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background-color:${TOKEN.BG_PAGE};">
  <tr>
    <td align="center" style="padding:24px 16px;">

      <!-- Email card — max 600px -->
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">

        <!-- ── HEADER ─────────────────────────────────── -->
        <tr>
          <td style="background-color:${headerColor};border-radius:8px 8px 0 0;padding:28px 32px 24px;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
              <tr>
                <td>
                  <p style="margin:0;font-family:${TOKEN.FONT_HEADING};font-size:22px;font-weight:bold;color:#ffffff;line-height:1.3;">
                    ${opts.school.schoolName}
                  </p>
                  ${opts.headerLabel ? `<p style="margin:6px 0 0;font-family:${TOKEN.FONT_STACK};font-size:12px;color:rgba(255,255,255,0.75);text-transform:uppercase;letter-spacing:0.08em;">${opts.headerLabel}</p>` : ''}
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── CONTENT CARD ───────────────────────────── -->
        <tr>
          <td style="background-color:${TOKEN.BG_CONTENT};padding:0;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">

              ${opts.body}

              ${opts.cta ? `
              <!-- ── CTA ────────────────────────────── -->
              <tr>
                <td style="padding:8px 32px 32px;text-align:center;">
                  ${buttonVml(opts.cta.label, opts.cta.url, ctaColor)}
                </td>
              </tr>` : ''}

            </table>
          </td>
        </tr>

        <!-- ── FOOTER ─────────────────────────────────── -->
        <tr>
          <td style="background-color:${TOKEN.BG_FOOTER};border-radius:0 0 8px 8px;padding:20px 32px;">
            <p style="margin:0 0 4px;font-family:${TOKEN.FONT_STACK};font-size:12px;color:${TOKEN.TEXT_MUTED};line-height:1.6;">
              ${opts.school.schoolName} &bull; ${opts.school.schoolAddress}
            </p>
            <p style="margin:0 0 4px;font-family:${TOKEN.FONT_STACK};font-size:12px;color:${TOKEN.TEXT_MUTED};line-height:1.6;">
              <a href="mailto:${opts.school.schoolEmail}" style="color:${TOKEN.TEXT_MUTED};text-decoration:none;">${opts.school.schoolEmail}</a>
              &bull; ${opts.school.schoolPhone}
            </p>
            ${opts.footerExtra ? `<p style="margin:8px 0 0;font-family:${TOKEN.FONT_STACK};font-size:11px;color:${TOKEN.TEXT_MUTED};line-height:1.6;">${opts.footerExtra}</p>` : ''}
            <p style="margin:12px 0 0;font-family:${TOKEN.FONT_STACK};font-size:11px;color:${TOKEN.TEXT_MUTED};line-height:1.6;">
              This email was sent by the ${opts.school.schoolName} school management system.
              Please do not reply directly to this email.
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
 * The body should be raw text — no HTML tags.
 */
export function buildEmailText(
  body:   string,
  school: SchoolBranding
): string {
  const dividerLine = '─'.repeat(60)

  return [
    school.schoolName.toUpperCase(),
    dividerLine,
    '',
    body.trim(),
    '',
    dividerLine,
    `${school.schoolName}`,
    `${school.schoolAddress}`,
    `${school.schoolEmail}  |  ${school.schoolPhone}`,
    '',
    'This email was sent by the school management system.',
    'Please do not reply directly to this email.',
    `Login: ${school.loginUrl}`,
  ].join('\n')
}

// ─────────────────────────────────────────────────────────
//  DESIGN TOKENS — re-exported for use in templates
// ─────────────────────────────────────────────────────────

export { TOKEN, divider }