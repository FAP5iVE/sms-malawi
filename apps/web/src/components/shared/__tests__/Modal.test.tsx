/**
 * Modal.test.tsx
 * [CHANGE TYPE]: NEW FILE
 * Guards the "pop-up swallowed by the header / bottom nav" fix: the dialog must
 * render through a portal under <body>, NOT inside whatever stacking context the
 * page wraps its content in (ModuleSurface's `relative z-10`).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Modal, MODAL_BTN_PRIMARY } from '../Modal'

describe('Modal', () => {
  it('escapes a stacking-context ancestor by rendering under <body>', () => {
    const { container } = render(
      <div data-testid="trap" style={{ position: 'relative', zIndex: 10 }}>
        <Modal title="Edit Class" onClose={() => {}}>
          body
        </Modal>
      </div>,
    )
    const dialog = screen.getByRole('dialog')
    expect(container.contains(dialog)).toBe(false)               // not inside the trapped wrapper
    expect(screen.getByTestId('trap').contains(dialog)).toBe(false)
    expect(document.body.contains(dialog)).toBe(true)
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('heading', { name: 'Edit Class' })).toBeInTheDocument()
  })

  it('renders a pinned footer and wires onSubmit to the footer submit button', () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault())
    render(
      <Modal
        title="Add"
        onClose={() => {}}
        onSubmit={onSubmit}
        footer={<button type="submit" className={MODAL_BTN_PRIMARY}>Save</button>}
      >
        <input aria-label="name" />
      </Modal>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape, the X button and the backdrop', () => {
    const onClose = vi.fn()
    const { baseElement } = render(<Modal title="T" onClose={onClose}>x</Modal>)
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
    fireEvent.click(baseElement.querySelector('.app-modal-backdrop') as Element)
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('ignores Escape, X and backdrop while busy', () => {
    const onClose = vi.fn()
    const { baseElement } = render(<Modal title="T" onClose={onClose} busy>x</Modal>)
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(baseElement.querySelector('.app-modal-backdrop') as Element)
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeDisabled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('only the top-most of two stacked modals reacts to Escape', () => {
    const outer = vi.fn()
    const inner = vi.fn()
    render(
      <>
        <Modal title="Outer" onClose={outer}>a</Modal>
        <Modal title="Inner" onClose={inner}>b</Modal>
      </>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(inner).toHaveBeenCalledTimes(1)
    expect(outer).not.toHaveBeenCalled()
  })

  it('locks body scroll while open and restores it on close', () => {
    document.body.style.overflow = ''
    const { unmount } = render(<Modal title="T" onClose={() => {}}>x</Modal>)
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).toBe('')
  })
})
