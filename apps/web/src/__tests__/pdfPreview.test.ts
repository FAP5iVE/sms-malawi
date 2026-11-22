// @vitest-environment node
/**
 * Guards the URL rules in lib/pdfPreview.ts.
 *
 * Why this exists: openPdfPreview() is the single way the app opens a stored
 * PDF in the browser, and it attaches the caller's ID token to the URL. It
 * must therefore (a) only ever open our own /api/files/<id> proxy path, and
 * (b) never be usable on Library digital resources, which are deliberately
 * view-only and rendered by DigitalResourceViewer.tsx instead.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: null }) }))

import { buildPdfPreviewUrl, PdfPreviewError } from '../lib/pdfPreview'

const ORIGIN = 'https://sms-malawi.vercel.app'
const build = (url: string) => buildPdfPreviewUrl(url, 'TOKEN', ORIGIN)

describe('buildPdfPreviewUrl', () => {
  it('returns an absolute same-origin URL with the token attached', () => {
    expect(build('/api/files/report_card_abc')).toBe(
      `${ORIGIN}/api/files/report_card_abc?token=TOKEN`,
    )
  })

  it.each(['payslip_a1', 'receipt_a1', 'expense_receipt_a1', 'report_card_a1', 'transcript_a1'])(
    'allows %s',
    (id) => {
      expect(build(`/api/files/${id}`)).toContain('token=TOKEN')
    },
  )

  it('keeps other query params and never duplicates the token', () => {
    const url = new URL(buildPdfPreviewUrl('/api/files/payslip_a?x=1&token=OLD', 'NEW', ORIGIN))
    expect(url.searchParams.get('x')).toBe('1')
    expect(url.searchParams.getAll('token')).toEqual(['NEW'])
  })

  it.each([
    'https://evil.example/api/files/payslip_a',
    '//evil.example/api/files/payslip_a',
    '/api/finances/payments/1/receipt',
    '/api/files/../secret',
    '/api/files/a%2Fb',
    '/api/files/',
    'javascript:alert(1)',
  ])('rejects %s', (url) => {
    expect(() => build(url)).toThrow(PdfPreviewError)
  })

  it.each([
    'digital_resource_abc',
    'ebook_abc',
    'past_paper_abc',
    'DIGITAL_RESOURCE_abc',
    '%64igital_resource_abc',
  ])('never opens the Library-protected resource %s', (id) => {
    expect(() => build(`/api/files/${id}`)).toThrow(/view-only/)
  })
})
