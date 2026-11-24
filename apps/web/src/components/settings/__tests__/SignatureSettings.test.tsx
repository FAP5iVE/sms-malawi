/**
 * SignatureSettings.test.tsx
 * "My signature": hidden for roles that sign nothing, plain words for a file that cannot be used,
 * and the school switch only for an administrator or head.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const role = vi.hoisted(() => ({ current: 'academic' as string | null }))
const status = vi.hoisted(() => ({ data: { hasSignature: false, updatedAt: null as string | null, sizeBytes: null as number | null, useOnDocuments: true } as unknown }))
const save = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
const setSwitch = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))

vi.mock('@/store/authStore', () => ({ useAuthStore: (sel: (s: { role: string | null }) => unknown) => sel({ role: role.current }) }))
vi.mock('@/hooks/useSignature', () => ({
  useSignatureStatus: () => ({ data: status.data }),
  useSaveSignature: () => save,
  useRemoveSignature: () => ({ mutate: vi.fn(), isPending: false }),
  useSetUseSignatures: () => setSwitch,
}))

import { SignatureSettings } from '../SignatureSettings'

const file = (type: string, size = 1000) => new File([new Uint8Array(size)], 'sig', { type })

/** jsdom does not decode images, so the size the browser would read is supplied here. */
function stubImage(width: number, height: number) {
  vi.stubGlobal('Image', class {
    naturalWidth = width; naturalHeight = height; onload: (() => void) | null = null; onerror: (() => void) | null = null
    set src(_: string) { queueMicrotask(() => this.onload?.()) }
  })
  URL.createObjectURL = vi.fn(() => 'blob:x'); URL.revokeObjectURL = vi.fn()
}

describe('SignatureSettings', () => {
  beforeEach(() => {
    role.current = 'academic'
    status.data = { hasSignature: false, updatedAt: null, sizeBytes: null, useOnDocuments: true }
    save.mutate.mockReset(); setSwitch.mutate.mockReset()
  })

  it('renders nothing for a student or parent', () => {
    role.current = 'student'
    const { container } = render(<SignatureSettings />)
    expect(container.textContent).toBe('')
  })

  it('invites a first upload and says it is not a legal e-signature', () => {
    render(<SignatureSettings />)
    expect(screen.getByText(/not added a signature yet/i)).toBeTruthy()
    expect(screen.getByText(/not a legal electronic signature/i)).toBeTruthy()
    expect(screen.getByText('Upload signature')).toBeTruthy()
  })

  it('shows when a saved signature was added and offers to replace or remove it', () => {
    status.data = { hasSignature: true, updatedAt: '2026-11-23T08:00:00Z', sizeBytes: 5000, useOnDocuments: true }
    render(<SignatureSettings />)
    expect(screen.getByText(/Saved on 23 November 2026/)).toBeTruthy()
    expect(screen.getByText('Replace signature')).toBeTruthy()
    expect(screen.getByText('Remove signature')).toBeTruthy()
  })

  it('refuses a file that is not a PNG or JPG, in plain words', async () => {
    render(<SignatureSettings />)
    fireEvent.change(document.getElementById('signature-file')!, { target: { files: [file('application/pdf')] } })
    expect((await screen.findByRole('alert')).textContent).toBe('Use a PNG or JPG image.')
  })

  it('refuses a square picture and previews a good one, then sends it', async () => {
    stubImage(300, 300)
    const { unmount } = render(<SignatureSettings />)
    fireEvent.change(document.getElementById('signature-file')!, { target: { files: [file('image/png')] } })
    expect((await screen.findByRole('alert')).textContent).toMatch(/wider than it is tall/)
    unmount()

    stubImage(400, 150)
    render(<SignatureSettings />)
    const good = file('image/png')
    fireEvent.change(document.getElementById('signature-file')!, { target: { files: [good] } })
    await waitFor(() => expect(screen.getByAltText('Your signature, as it will print')).toBeTruthy())
    fireEvent.click(screen.getByText('Save signature'))
    expect(save.mutate.mock.calls[0]![0]).toBe(good)
  })

  it('shows the school switch to an administrator only', () => {
    expect(screen.queryByText('Print signatures on documents')).toBeNull()
    render(<SignatureSettings />)
    expect(screen.queryByText('Print signatures on documents')).toBeNull()
    role.current = 'admin'
    render(<SignatureSettings />)
    fireEvent.click(screen.getByLabelText(/Print signatures on documents/))
    expect(setSwitch.mutate).toHaveBeenCalledWith(false)
  })
})
