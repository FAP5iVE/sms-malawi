import type { Meta, StoryObj } from '@storybook/nextjs-vite'

// Storybook's preview does not load the app stylesheet by itself.
import '@/app/globals.css'

/**
 * Chikangawa Hills theme, Phase 1 review pack.
 *
 * Shows the four skies (dawn, day, dusk, night), the type scale in Hanken
 * Grotesk, the status colours, the glass card and the layout helpers. Each sky
 * panel sets `data-sky` locally, which is exactly what the page-wide
 * `<html data-sky>` does on the real site.
 */

const SKIES = ['dawn', 'day', 'dusk', 'night'] as const
type Sky = (typeof SKIES)[number]

const SKY_LABEL: Record<Sky, string> = {
  dawn: 'Dawn · 05:00 to 07:59',
  day: 'Day · 08:00 to 15:59 (also Light)',
  dusk: 'Dusk · 16:00 to 18:59',
  night: 'Night · 19:00 to 04:59 (also Dark)',
}

function SkyPanel({ sky }: { sky: Sky }) {
  return (
    <section
      className="hills hills-sky"
      data-sky={sky}
      aria-label={`${sky} sky`}
      style={{ minHeight: 0, borderRadius: 20, padding: '28px 28px 32px' }}
    >
      <p className="hills-small" style={{ margin: 0, fontWeight: 600, letterSpacing: '0.04em' }}>
        {SKY_LABEL[sky]}
      </p>

      <h2 className="hills-display" style={{ margin: '18px 0 0', fontSize: 'clamp(40px, 5vw, 72px)' }}>
        Rise to the{' '}
        <span style={{ fontWeight: 700, color: 'var(--hills-accent)' }}>hills.</span>
      </h2>
      <p className="hills-lede" style={{ margin: '14px 0 0', maxWidth: '34ch' }}>
        Sign in to follow results, fees and the school day at Chikangawa Hills.
      </p>

      <div className="hills-glass" style={{ marginTop: 22, padding: 20 }}>
        <p className="hills-title" style={{ margin: 0 }}>Welcome back</p>
        <p className="hills-body" style={{ margin: '6px 0 14px' }}>
          Fees due: MK 1,250,000 · Term 2 · Form 4A
        </p>
        <button
          type="button"
          style={{
            minHeight: 44,
            padding: '0 22px',
            borderRadius: 999,
            border: 0,
            fontWeight: 700,
            fontSize: 16,
            background: 'var(--hills-ink)',
            color: 'var(--hills-on)',
          }}
        >
          Sign in
        </button>
        <p style={{ margin: '14px 0 0', fontWeight: 600, color: 'var(--hills-danger)' }}>
          Incorrect password. Try again.
        </p>
        <p style={{ margin: '4px 0 0', fontWeight: 600, color: 'var(--hills-warn)' }}>
          Your session ends in 2 minutes.
        </p>
        <p style={{ margin: '4px 0 0', fontWeight: 600, color: 'var(--hills-ok)' }}>
          Password updated.
        </p>
      </div>
    </section>
  )
}

function Surfaces({ dark }: { dark: boolean }) {
  return (
    <div className={dark ? 'dark' : undefined}>
      <div
        className="hills"
        style={{
          background: 'var(--hills-page)',
          padding: 20,
          borderRadius: 16,
          border: '1px solid var(--hills-line)',
        }}
      >
        <p className="hills-small" style={{ margin: '0 0 10px', color: 'var(--hills-surface-fg)' }}>
          {dark ? 'Dark surfaces' : 'Light surfaces'} (the app&apos;s own card, page and border tokens)
        </p>
        <div
          style={{
            background: 'var(--hills-surface)',
            color: 'var(--hills-surface-fg)',
            border: '1px solid var(--hills-line)',
            borderRadius: 12,
            padding: 16,
          }}
        >
          <p className="hills-title" style={{ margin: 0 }}>Card on page</p>
          <p className="hills-body" style={{ margin: '6px 0 0' }}>
            Cards and inputs follow light and dark exactly as the signed-in app does.
          </p>
        </div>
      </div>
    </div>
  )
}

const meta: Meta = {
  title: 'Hills/Foundation',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Phase 1 tokens for the Chikangawa Hills theme: four skies, Hanken Grotesk type scale, glass, and layout helpers. Scoped to `.hills`, so nothing in the signed-in app changes.',
      },
    },
  },
}
export default meta
type Story = StoryObj

export const FourSkies: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 20, padding: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
      {SKIES.map((sky) => (
        <SkyPanel key={sky} sky={sky} />
      ))}
    </div>
  ),
}

export const LightAndDarkSurfaces: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 20, padding: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
      <Surfaces dark={false} />
      <Surfaces dark />
    </div>
  ),
}

export const ContainerAndSplit: Story = {
  render: () => (
    <div className="hills hills-sky" data-sky="day">
      <div className="hills-container" style={{ paddingBlock: 48 }}>
        <div className="hills-split">
          <div>
            <h2 className="hills-display" style={{ margin: 0 }}>Two columns from 900px</h2>
            <p className="hills-lede hills-measure" style={{ marginTop: 16 }}>
              The container is full width with 5vw side padding and never wider than 1500px.
              This paragraph uses the reading measure, about 760px.
            </p>
          </div>
          <div className="hills-glass" style={{ padding: 24 }}>
            <p className="hills-title" style={{ margin: 0 }}>Right column</p>
            <p className="hills-body" style={{ margin: '8px 0 0' }}>
              On phones the glass becomes opaque with no blur, which is also what happens when the
              visitor asks their system for reduced transparency.
            </p>
          </div>
        </div>
      </div>
    </div>
  ),
}
