import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'

// Storybook's preview does not load the app stylesheet by itself.
import '@/app/globals.css'

import { AttentionBadge } from '@/components/shared/AttentionBadge'
import { ListPager } from '@/components/shared/ListPager'
import { ModuleTabs } from '@/components/shared/ModuleTabs'
import { Modal, MODAL_BTN_PRIMARY, MODAL_BTN_SECONDARY, type ModalSize } from '@/components/shared/Modal'
import { StatusText, type StatusTone } from '@/components/shared/StatusText'
import { Button } from '@/components/ui/button'
import { usePagedRows } from '@/lib/hills/usePagedRows'

/**
 * Chikangawa Hills theme, Phase 8b-0 review pack: the parts every later signed-in
 * page is built from. Every piece has a Light and a Dark story.
 *
 *   Tones     old brand colours as text (fail) beside the new text tones (pass)
 *   Status    StatusText: coloured word and shape, never a pill
 *   Badges    AttentionBadge: count, 99+, dot, on the dark sidebar
 *   Buttons   old teal / coral buttons vs brand / danger, loading
 *   Pager     client side paging: rows per page, previous / next, show more
 *   Dialogs   the three new sizes s / m / l (400, 560, 720)
 *
 * The app puts `.dark` on <html> and its colour utilities resolve at :root, so a
 * nested `.dark` wrapper would still show LIGHT values. Each story therefore sets
 * the class on <html>, exactly as the app does.
 */

const meta = {
  title: 'Hills/Phase 8b-0 foundations',
  parameters: { layout: 'fullscreen' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function Page({ dark, children }: { dark: boolean; children: ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    return () => document.documentElement.classList.remove('dark')
  }, [dark])
  return (
    <div style={{ background: 'hsl(var(--background))', color: 'hsl(var(--foreground))', padding: 20, minHeight: 320 }}>
      <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, opacity: 0.7 }}>{dark ? 'DARK' : 'LIGHT'}</p>
      {children}
    </div>
  )
}

/** The three real surfaces text sits on in the signed-in app. */
function Surfaces({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="rounded-[14px] border border-base bg-surface p-4">
        <p className="mb-2 text-xs text-muted">on the card</p>
        {children}
      </div>
      <div className="rounded-[14px] border border-base bg-surface p-4">
        <div className="app-tint rounded-xl p-3">
          <p className="mb-2 text-xs text-muted">on a tint tile</p>
          {children}
        </div>
      </div>
      <div className="rounded-[14px] bg-muted p-4">
        <p className="mb-2 text-xs text-muted">on a grey row</p>
        {children}
      </div>
    </div>
  )
}

// ── Tones ────────────────────────────────────────────────────────────────────
function Tones({ dark }: { dark: boolean }) {
  return (
    <Page dark={dark}>
      <Surfaces>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm font-semibold">
          <span className="text-brand-teal">Old teal link</span>
          <span className="text-tone-teal">New teal link</span>
          <span className="text-brand-coral">Old coral text</span>
          <span className="text-tone-coral">New coral text</span>
          <span className="text-brand-amber">Old amber text</span>
          <span className="text-tone-amber">New amber text</span>
          <span className="text-muted">Muted text (now darker)</span>
          <span className="text-status-warning">Status warning (now darker)</span>
        </div>
      </Surfaces>
    </Page>
  )
}

// ── StatusText ───────────────────────────────────────────────────────────────
const WORDS: [StatusTone, string][] = [
  ['success', 'Cleared'],
  ['warning', 'Pending'],
  ['danger', 'Outstanding'],
  ['info', 'Emergency contact'],
  ['neutral', 'Primary'],
]
function Status({ dark }: { dark: boolean }) {
  return (
    <Page dark={dark}>
      <Surfaces>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {WORDS.map(([tone, word]) => (
            <StatusText key={tone} tone={tone}>
              {word}
            </StatusText>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
          {WORDS.map(([tone, word]) => (
            <StatusText key={tone} tone={tone} size="md">
              {word}
            </StatusText>
          ))}
        </div>
      </Surfaces>
    </Page>
  )
}

// ── AttentionBadge ───────────────────────────────────────────────────────────
function Badges({ dark }: { dark: boolean }) {
  return (
    <Page dark={dark}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-6 rounded-[14px] border border-base bg-surface p-4 text-sm">
          <span>
            Approvals <AttentionBadge count={5} noun="waiting for your review" className="ml-1.5 align-middle" />
          </span>
          <span>
            Notices <AttentionBadge count={120} noun="unread" className="ml-1.5 align-middle" />
          </span>
          <span>
            Fees <AttentionBadge dot noun="need attention" className="ml-1.5 align-middle" />
          </span>
          <span>
            Zero <AttentionBadge count={0} noun="x" className="ml-1.5 align-middle" />
            <span className="text-muted"> (draws nothing)</span>
          </span>
        </div>
        <div
          className="flex flex-wrap items-center gap-6 rounded-[14px] p-4 text-sm"
          style={{ background: 'hsl(var(--sidebar-background))', color: '#fff' }}
        >
          <span>
            Approvals <AttentionBadge onDark count={5} noun="waiting for your review" className="ml-1.5 align-middle" />
          </span>
          <span>
            Notices <AttentionBadge onDark count={120} noun="unread" className="ml-1.5 align-middle" />
          </span>
          <span>
            Fees <AttentionBadge onDark dot noun="need attention" className="ml-1.5 align-middle" />
          </span>
          <span className="opacity-70">(on the sidebar)</span>
        </div>
      </div>
    </Page>
  )
}

// ── Buttons ──────────────────────────────────────────────────────────────────
function Buttons({ dark }: { dark: boolean }) {
  return (
    <Page dark={dark}>
      <Surfaces>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="inline-flex min-h-9 items-center rounded-lg bg-brand-teal px-4 text-sm font-semibold text-white">
            Legacy teal
          </button>
          <button type="button" className="inline-flex min-h-9 items-center rounded-lg bg-brand-coral px-4 text-sm font-semibold text-white">
            Legacy coral
          </button>
          <Button variant="brand">Add student</Button>
          <Button variant="danger">Delete class</Button>
          <Button variant="brand" loading>
            Saving…
          </Button>
          <Button variant="destructive">Quiet destructive</Button>
          <Button variant="outline">Cancel</Button>
        </div>
        <p className="mt-3 text-xs text-muted">
          The two legacy buttons use the old classes unchanged; the safety net in globals.css fixes their colours.
        </p>
      </Surfaces>
    </Page>
  )
}

// ── Tabs with the shared badge ───────────────────────────────────────────────
function TabsDemo({ dark }: { dark: boolean }) {
  const [active, setActive] = useState('leave')
  const tabs = [
    { id: 'staff', label: 'Staff' },
    { id: 'leave', label: 'Leave requests', badge: 3, badgeNoun: 'leave requests waiting' },
    { id: 'alerts', label: 'Contract alerts', badge: 120, badgeNoun: 'contracts expiring soon' },
    { id: 'payroll', label: 'Payroll', badge: 0 },
  ]
  return (
    <Page dark={dark}>
      <div className="space-y-6">
        <ModuleTabs tabs={tabs} active={active} onChange={setActive} />
        <div className="rounded-[14px] border border-base bg-surface p-4">
          <ModuleTabs tabs={tabs} active={active} onChange={setActive} variant="pill" id="tabs-pill" />
        </div>
      </div>
    </Page>
  )
}

// ── Pager ────────────────────────────────────────────────────────────────────
const ROWS = Array.from({ length: 130 }, (_, i) => ({ id: i + 1, name: `Student ${i + 1}` }))

function PagerDemo() {
  const paging = usePagedRows(ROWS)
  return (
    <div className="rounded-[14px] border border-base bg-surface p-4">
      <ul className="divide-y divide-[hsl(var(--border))] text-sm">
        {paging.visible.map((r) => (
          <li key={r.id} className="py-1.5">
            {r.name}
          </li>
        ))}
      </ul>
      <ListPager paging={paging} />
    </div>
  )
}
function Pager({ dark }: { dark: boolean }) {
  return (
    <Page dark={dark}>
      <PagerDemo />
    </Page>
  )
}

// ── Dialogs ──────────────────────────────────────────────────────────────────
function Dialog({ size, form, dark }: { size: ModalSize; form: boolean; dark: boolean }) {
  const [open, setOpen] = useState(true)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    return () => document.documentElement.classList.remove('dark')
  }, [dark])
  if (!open) return <button onClick={() => setOpen(true)}>Open</button>
  return (
    <Modal
      title={form ? 'Add student' : 'Delete this class?'}
      description={form ? 'Fill in the details. You can change them later.' : undefined}
      size={size}
      onClose={() => setOpen(false)}
      onSubmit={form ? (e) => e.preventDefault() : undefined}
      footer={
        <>
          <button type="button" className={MODAL_BTN_SECONDARY} onClick={() => setOpen(false)}>
            {form ? 'Cancel' : 'Keep class'}
          </button>
          <button type={form ? 'submit' : 'button'} className={MODAL_BTN_PRIMARY}>
            {form ? 'Add student' : 'Delete class'}
          </button>
        </>
      }
    >
      {form ? (
        <div className="space-y-3 text-sm">
          {['First name', 'Surname', 'Form'].map((l) => (
            <label key={l} className="block">
              <span className="text-muted">{l}</span>
              <input className="mt-1 block min-h-11 w-full rounded-lg border border-base bg-surface px-3" />
            </label>
          ))}
        </div>
      ) : (
        <p className="text-sm">This removes the class and its timetable. Students stay on the school list.</p>
      )}
    </Modal>
  )
}

export const TonesLight: Story = { render: () => <Tones dark={false} /> }
export const TonesDark: Story = { render: () => <Tones dark /> }
export const StatusLight: Story = { render: () => <Status dark={false} /> }
export const StatusDark: Story = { render: () => <Status dark /> }
export const BadgesLight: Story = { render: () => <Badges dark={false} /> }
export const BadgesDark: Story = { render: () => <Badges dark /> }
export const ButtonsLight: Story = { render: () => <Buttons dark={false} /> }
export const ButtonsDark: Story = { render: () => <Buttons dark /> }
export const TabsLight: Story = { render: () => <TabsDemo dark={false} /> }
export const TabsDark: Story = { render: () => <TabsDemo dark /> }
export const PagerLight: Story = { render: () => <Pager dark={false} /> }
export const PagerDark: Story = { render: () => <Pager dark /> }

export const DialogSmallConfirmLight: Story = { render: () => <Dialog size="s" form={false} dark={false} /> }
export const DialogSmallConfirmDark: Story = { render: () => <Dialog size="s" form={false} dark /> }
export const DialogMediumFormLight: Story = { render: () => <Dialog size="m" form dark={false} /> }
export const DialogMediumFormDark: Story = { render: () => <Dialog size="m" form dark /> }
export const DialogLargeFormLight: Story = { render: () => <Dialog size="l" form dark={false} /> }
