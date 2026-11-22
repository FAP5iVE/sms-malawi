import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import '@/app/globals.css'
import { PublicAmbientBackground, type AmbientVariant } from '@/components/shared/PublicAmbientBackground'

/**
 * Chikangawa Hills theme, Phase 2 review pack.
 *
 * The shared page background in each variant, behind content styled the way the
 * public pages are today (navy heading in light, white in dark). The sky comes
 * from `<html data-sky>` and the light/dark class, exactly as on the real site,
 * so use the toolbar-free switches below or set them in the browser:
 *   document.documentElement.dataset.sky = 'dusk'
 *   document.documentElement.classList.toggle('dark')
 */

function Page({ variant, tall = false }: { variant: AmbientVariant; tall?: boolean }) {
  return (
    <div className="relative min-h-screen bg-page">
      <PublicAmbientBackground variant={variant} />
      <div className="relative z-10 mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <h1 className="mb-3 font-heading text-3xl font-extrabold tracking-tight text-brand-navy dark:text-white sm:text-4xl">
          Academics
        </h1>
        <p className="mb-6 max-w-prose text-muted-foreground">
          Sample page content, coloured the way public pages are today. Body text and cards
          must stay readable on every sky.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: tall ? 60 : 4 }, (_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm">
              <p className="font-semibold">Form {i + 1} curriculum</p>
              <p className="mt-1 text-sm text-muted-foreground">
                English, Mathematics, Chichewa, Biology, Physics, Geography.
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const meta: Meta<typeof Page> = {
  title: 'Hills/Background',
  component: Page,
  parameters: { layout: 'fullscreen' },
  args: { variant: 'default' },
  argTypes: { variant: { control: 'inline-radio', options: ['default', 'vivid', 'home', 'calm'] } },
}
export default meta
type Story = StoryObj<typeof Page>

export const Default: Story = { args: { variant: 'default' } }
export const Vivid: Story = { args: { variant: 'vivid' } }
export const Home: Story = { args: { variant: 'home' } }
export const Calm: Story = { args: { variant: 'calm' } }
export const LongPageScroll: Story = { args: { variant: 'default', tall: true } }
