/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/lib/guardianSlip.ts
 * [PHASE]: Guardian Portal — staff UI (T7a)
 * [PURPOSE]: Builds the printable invitation slip handed to a guardian who has no e-mail.
 *   Pure (string in, string out) so the one thing that matters here — that names typed by staff
 *   can never inject markup into the printed page — is unit-tested without a browser.
 *
 *   The claim code is shown exactly once, when staff issue it: the server stores only a hash.
 *   This slip is therefore the only copy there will ever be.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** "07 Nov 2026". Fixed locale and UTC so the slip reads the same on every machine. */
export function formatSlipDate(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

export interface SlipInput {
  guardianName: string
  studentName: string
  /** Shown exactly as the server returned it, e.g. "ABCDEF-GHJKMN-PQRSTU". */
  code: string
  expiresAt: string | Date
  /** Where the guardian goes to use the code, e.g. "https://school.example/login?claim=1". */
  claimUrl: string
}

export function buildSlipHtml(i: SlipInput): string {
  const e = escapeHtml
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Guardian account invitation</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; padding: 32px; }
  .slip { max-width: 520px; margin: 0 auto; border: 2px dashed #555; border-radius: 12px; padding: 28px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p { font-size: 14px; line-height: 1.5; margin: 8px 0; }
  .code { font-family: "Courier New", monospace; font-size: 26px; letter-spacing: 2px; font-weight: bold;
          text-align: center; padding: 16px; margin: 18px 0; background: #f2f2f2; border-radius: 8px; word-break: break-all; }
  .small { font-size: 12px; color: #444; }
  ol { font-size: 14px; line-height: 1.6; padding-left: 20px; }
</style></head>
<body><div class="slip">
  <h1>Guardian account invitation</h1>
  <p>For <strong>${e(i.guardianName)}</strong>, guardian of <strong>${e(i.studentName)}</strong>.</p>
  <div class="code">${e(i.code)}</div>
  <ol>
    <li>Go to <strong>${e(i.claimUrl)}</strong></li>
    <li>Enter this code and the e-mail address you want to sign in with.</li>
    <li>Choose a password.</li>
  </ol>
  <p class="small">This code works once and expires on ${e(formatSlipDate(i.expiresAt))}. Keep it private: anyone with this slip can claim access. If it is lost, ask the school for a new one.</p>
</div>
<script>window.addEventListener('load', function () { window.focus(); window.print(); });</script>
</body></html>`
}
