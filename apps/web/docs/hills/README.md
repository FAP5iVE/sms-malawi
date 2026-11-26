# Chikangawa Hills theme: guardrails and baseline

Phase 0 of the phased UI plan ("Chikangawa Hills Theme: Phased UI Implementation Plan").
Nothing in this phase changes what users see. It adds the tools that prove, in every
later phase, that **only looks changed** and that the before/after can be reviewed.

Branch: `hills/phase-0-baseline` (from `main`, the project as received).

## What was added

| Path | What it is |
| --- | --- |
| `public/fonts/hanken-grotesk-variable.woff2` | Hanken Grotesk variable font (wght 100 to 900, Latin, 34.7 KB), extracted from the login v2 mockup. SIL Open Font License 1.1. Wired into the app in Phase 1. |
| `tools/hills/lib/fingerprint.mts` | Reduces a `.ts/.tsx` file to its logic tokens (see "What counts as logic"). |
| `tools/hills/logic-diff.mts` | The gate: working tree vs a baseline ref. Exit 0 = only looks changed. |
| `tools/hills/logic-allowlist.json` | Frozen paths, ignored paths, and the declared exceptions (empty today). |
| `tools/hills/handler-inventory.mts` | Per-file inventory of handlers, API/auth calls, effects and router calls. |
| `docs/hills/handler-inventory.baseline.json` | The committed inventory of the untouched app: 397 files, 2,126 items. |
| `tools/hills/capture-baseline.mts` | Playwright gallery: every route x 390/768/1280/1920 x light/dark. |
| `tools/hills/__tests__/fingerprint.test.mts` | 14 self-tests for the fingerprint (node:test, no new dependency). |

New `package.json` scripts: `hills:test`, `hills:logic-diff`, `hills:inventory`,
`hills:inventory:check`, `hills:inventory:print`, `hills:baseline`. No dependency was added.

## The per-phase checklist

Run from `apps/web` before asking for a phase review:

```bash
pnpm hills:test                    # the checker itself still works
pnpm hills:logic-diff              # must print "RESULT: clean"
pnpm hills:inventory:check         # must print "matches the baseline" (or list declared drift)
pnpm hills:baseline --out ../../hills-baseline/phase-N   # after-shots for the review pack
```

### What counts as logic (and is therefore frozen)

- Every statement outside JSX, including everything inside handlers and effects.
- Every JSX expression `{...}` (conditions, `.map`, children) with the markup inside it collapsed.
- Every JSX attribute except the presentational ones (`className`, `style`, image sizing,
  SVG geometry, `variant`/`size`). `onSubmit`, `onClick`, `ref`, `disabled`, `value`, `key` and
  spreads are logic.
- Imports, except UI-only ones (`@/components/*`, `lucide-react`, `next/image`, `next/link`,
  `clsx`, `tailwind-merge`, `cva`, `@/lib/utils`).

### Stable selectors (reported separately)

`id`, `name`, `type`, `htmlFor`, `role`, `aria-*`, `autoComplete`, `required`, `placeholder`,
`href`, `data-testid`, and the visible text of `button` / `label` elements.

### Free to change

`className`, `style`, JSX text outside buttons and labels, markup wrappers, comments,
tag names, order of blocks, CSS, fonts, stories and tests.

### Frozen outright (any edit fails the gate)

`src/proxy.ts`, `components/providers/AuthProvider.tsx`, `src/app/api/**`, `src/server/**`,
`src/actions/**`, `src/store/**`, `src/lib/**` (except a new `src/lib/hills/**`), `prisma/**`,
`packages/**`, `firestore.rules`, `firestore.indexes.json`, `firebase.json`.

### Declaring an intended exception

A phase that must add logic (for example the Phase 3 typing-ripple hook) adds an entry to
`logic-allowlist.json` with the file, the side (`added`/`removed`), a regex for the token and a
**reason**. New files go in `newFiles`, deleted files in `deletedFiles`. Those entries are the
list the reviewer reads: `pnpm hills:logic-diff --verbose` prints them with their reasons.

How the plan's wording maps onto the tool: the plan says the gate should flag "any changed line
that is not a className, JSX text or a UI import" and also allows "layout wrappers". The tool
works on the syntax tree, not on lines, so wrapping content in new `<div>`s, moving blocks and
re-indenting do not flag, while any change to a handler, condition, hook, prop or selector does.

## Baseline findings on the untouched app

Recorded on a clean install (`pnpm install --frozen-lockfile`, Node 22, pnpm 10.28):

| Check | Result | Notes |
| --- | --- | --- |
| `eslint src` | 0 errors, 46 warnings | Pre-existing. Phases must not add to it. |
| `tsc --noEmit` | 1,021 errors | Environment-caused: the Prisma client could not be generated in the build sandbox (engine download blocked), so every `@prisma/client` import is untyped (TS7006, TS18046, TS2305 dominate). Re-run locally after `prisma generate` for a true baseline. |
| `vitest run --project unit` | 97 of 97 suites fail to load | Pre-existing and independent of the theme work: `test/setup.ts` imports `@testing-library/jest-dom/vitest`, which is **not** a dependency of `apps/web` (it is only a transitive dependency of Storybook, so pnpm does not expose it). Fix is one line, `pnpm add -D @testing-library/jest-dom --filter web`; not done here because the plan says no new dependencies. |

Both of the last two will need a one-time check on your machine; they do not affect the
logic-diff gate, which needs only git and Node.

## Route map (which shared pieces each page uses)

This is the surface Phases 1 to 8 touch. `ScribbleArt` is the home page's decorative SVG that
Phase 4 retires. "Hard-coded page widths" are the `max-w-3xl..7xl` classes Phase 6 replaces.

| File | Shared components imported | Hard-coded page widths | ScribbleArt uses |
| --- | --- | --- | --- |
| `(auth)/announcements/page.tsx` | ModuleSurface, ModuleTabs |  |  |
| `(auth)/applications/page.tsx` | ModuleSurface, ModuleTabs, DataTable |  |  |
| `(auth)/assets/page.tsx` | ModuleSurface, StatCard |  |  |
| `(auth)/attendance/page.tsx` | ModuleSurface |  |  |
| `(auth)/calendar/page.tsx` | ModuleSurface |  |  |
| `(auth)/classes/[id]/page.tsx` | ModuleSurface, ModuleTabs, DataTable |  |  |
| `(auth)/classes/page.tsx` | ModuleSurface |  |  |
| `(auth)/exams/page.tsx` | ModuleSurface, ModuleTabs |  |  |
| `(auth)/finances/page.tsx` | ModuleSurface, ModuleTabs |  |  |
| `(auth)/gallery-admin/page.tsx` | ModuleSurface |  |  |
| `(auth)/guardians/page.tsx` | ModuleSurface, ModuleTabs |  |  |
| `(auth)/hr/page.tsx` | ModuleSurface, ModuleTabs |  |  |
| `(auth)/layout.tsx` | PublicAmbientBackground, PageHeader |  |  |
| `(auth)/library/page.tsx` | ModuleSurface, ModuleTabs |  |  |
| `(auth)/monitoring/page.tsx` | ModuleSurface, ModuleTabs |  |  |
| `(auth)/placements/page.tsx` | ModuleSurface, ModuleTabs |  |  |
| `(auth)/reports/page.tsx` | ModuleSurface |  |  |
| `(auth)/settings/page.tsx` | ModuleSurface, ModuleTabs |  |  |
| `(auth)/students/page.tsx` | ModuleSurface, DataTable |  |  |
| `(auth)/timetable/page.tsx` | ModuleSurface |  |  |
| `(auth)/user-management/page.tsx` | ModuleSurface |  |  |
| `(parent)/layout.tsx` |  | max-w-4xl |  |
| `(parent)/parent/[linkId]/page.tsx` | ModuleSurface, ModuleTabs |  |  |
| `(parent)/parent/page.tsx` | ModuleSurface |  |  |
| `(public)/academic-advertisements/[id]/layout.tsx` | PublicPostSeoLayout |  |  |
| `(public)/academic-advertisements/[id]/page.tsx` | PublicAmbientBackground, PublicArchive |  |  |
| `(public)/academic-advertisements/page.tsx` | PublicAmbientBackground, PublicArchive |  |  |
| `(public)/academics/page.tsx` | PublicAmbientBackground | max-w-4xl |  |
| `(public)/admissions/page.tsx` | PublicAmbientBackground | max-w-4xl |  |
| `(public)/apply/page.tsx` | PublicAmbientBackground | max-w-3xl |  |
| `(public)/change-password/page.tsx` | AuthShell |  |  |
| `(public)/events/[id]/layout.tsx` | PublicPostSeoLayout |  |  |
| `(public)/events/[id]/page.tsx` | PublicAmbientBackground, PublicArchive |  |  |
| `(public)/events/page.tsx` | PublicAmbientBackground | max-w-4xl |  |
| `(public)/forgot-password/page.tsx` | AuthShell |  |  |
| `(public)/gallery/page.tsx` | PublicAmbientBackground | max-w-7xl |  |
| `(public)/layout.tsx` | PublicHeader |  |  |
| `(public)/leadership/page.tsx` | PublicAmbientBackground | max-w-6xl |  |
| `(public)/login/page.tsx` | AuthShell, GuardianClaimForm | max-w-4xl |  |
| `(public)/news/[id]/layout.tsx` | PublicPostSeoLayout |  |  |
| `(public)/news/[id]/page.tsx` | PublicAmbientBackground, PublicArchive |  |  |
| `(public)/news/page.tsx` | PublicAmbientBackground, PublicArchive |  |  |
| `(public)/notices/[id]/layout.tsx` | PublicPostSeoLayout |  |  |
| `(public)/notices/[id]/page.tsx` | PublicAmbientBackground, PublicArchive |  |  |
| `(public)/notices/page.tsx` | PublicAmbientBackground, PublicArchive |  |  |
| `(public)/page.tsx` |  | max-w-3xl, max-w-7xl | 10 |
| `(public)/placement-results/page.tsx` | PublicAmbientBackground | max-w-5xl |  |
| `(public)/privacy/page.tsx` | PublicAmbientBackground | max-w-3xl |  |
| `(public)/reset-password/page.tsx` | AuthShell |  |  |
| `(public)/student-life/page.tsx` | PublicAmbientBackground | max-w-4xl |  |
| `(public)/terms/page.tsx` | PublicAmbientBackground | max-w-3xl |  |
| `not-found.tsx` | PublicAmbientBackground, PublicHeader | max-w-6xl |  |

Also: `PublicPostSeoLayout` is server-side SEO only (metadata and JSON-LD around the four
`[id]` detail routes) and has no visual output. `PublicArchive` renders the list and detail
views for `/news`, `/notices`, `/events` and `/academic-advertisements`.

## Security note about the project zip

The zip contained live credentials (`.env`, `.env.local`, `service-account.json`: database URLs,
a Firebase private key, Resend, Twilio and Cloudflare R2 keys). They are git-ignored, were not
committed here, and were not used: the dev server for the baseline gallery was started with
every key overridden by a dummy value. If that zip travelled by email or chat, rotate those keys.

## Known limits of the Phase 0 baseline gallery

The gallery in the build sandbox was captured with a dummy database, so pages show their
empty or error states rather than real news, notices and gallery content, and signed-in
routes were not captured at all. Run `pnpm hills:baseline` on your machine (or against a
preview deploy with test accounts) for the real "before" set:

```bash
HILLS_ADMIN_EMAIL=... HILLS_ADMIN_PASSWORD=... \
HILLS_PARENT_EMAIL=... HILLS_PARENT_PASSWORD=... \
BASE_URL=http://localhost:3000 pnpm hills:baseline --out ../../hills-baseline/before \
  --param "/news/[id]=<a published post id>"
```

## Phase 1: tokens, font, theme toggle

What it adds (looks only; nothing changes on any current screen yet):

- `globals.css`, HILLS THEME section: four skies (dawn, day, dusk, night), type scale, glass,
  layout helpers. Everything is scoped to `.hills`, so signed-in screens are untouched.
- Sky rules: Light = day, Dark = night, Auto = Malawi clock (UTC+2): dawn 05-08, day 08-16,
  dusk 16-19, night 19-05. `<html data-sky>` is set by an inline script before first paint
  (`src/lib/hills/sky.ts`) and kept current by `HillsSkySync`.
- The theme toggles now say "Auto" instead of "System". The stored value is still `system`.
- Headings inside `.hills` inherit font and colour from the sky (the app's base rule would
  otherwise colour them with the app foreground).
- Hanken Grotesk loads only inside `.hills`.

Checks: `pnpm hills:test` (sky rules and the inline script agree for every hour and theme),
`pnpm hills:contrast` (76 WCAG pairs across the four skies), `pnpm hills:logic-diff
--base hills/phase-0-baseline` (clean, 38 declared tokens, 2 declared new files), and the
Storybook story `Hills/Foundation`.

Contrast: a few mockup values were darkened slightly to reach 4.5:1 (dawn status green, day
danger and status green, day accent for large text). Visually they are very close.

## Phase 2: the sky background

`PublicAmbientBackground` keeps its name, export and every call site, but now draws the Hills
sky instead of the colour orbs and tube line art. New optional prop `variant`:
`default | vivid | home | calm`. The old boolean `vivid` still works.

| Variant | Used by | What it does |
| --- | --- | --- |
| `default` | all public content pages, 404 | sky + contours; interim scrim (below); small sun/moon on screens 1100px and wider; static |
| `vivid` | login, forgot / change / reset password | full-strength sky, no scrim; sun and moon move along their arc in Auto |
| `home` | landing page (not switched on yet) | same as vivid |
| `calm` | signed-in app (`(auth)/layout.tsx`) | static horizon glow + faint contours; Light/Dark only, never the clock; no sun, stars or animation |

- Contours and stars are static files in `public/hills/`, painted through CSS masks in the sky's
  ink colour (so they recolour with the sky). `pnpm hills:assets` regenerates them
  (deterministic).
- Only client code: `HillsCelestial` (vivid and home) writes sun/moon CSS variables. Rules in
  `src/lib/hills/celestial.ts`, tested by `pnpm hills:test`.
- **Interim scrim:** existing pages colour their text for a plain page (muted text is 4.37:1 on
  the plain light page). Any sky under that text lowers the contrast, so `default` is fully
  opaque across the content column (about 1120px) and shows the sky only in the side margins of
  wide screens; on phones pages read exactly as before. Measured: median text contrast under the
  scrim equals the plain page exactly; only the thin contour lines differ. Phase 6 removes the
  scrim page by page as text is redesigned for the sky.
- Scroll performance: once painted, old and new backgrounds scroll identically (p95 frame
  16.8ms, raster 2-4ms, worst frame under 21ms, light and night). The new layers cost more on
  the very first paint in a software renderer (a few hundred ms of raster), which a GPU hides.

## Font step: Hanken Grotesk on public pages

`.hills-type` (globals.css) re-points the app's `--font-sans` and `--font-heading` variables to
Hanken Grotesk. It is on the public layout wrapper and the 404 page, so every public page and the
whole login family switch with no per-page edits. The signed-in app never has the class and keeps
DM Sans and Inter. Checked at 360, 390, 768 and 1280px on eight routes: no sideways overflow.

## Logo step: the school's own logo

The old assets were the orange "5 LABS" vendor mark (favicon, app icons, OG image) and a 1.1MB
embedded-raster crest named `5ivestacks-labs-logo-*.svg` (login). All are deleted and replaced with
the supplied Chikangawa Hills Academy pack.

| File in `public/` | Use |
| --- | --- |
| `logo-light.svg`, `logo-dark.svg` | full crest; navy artwork for light pages, light artwork for dark pages |
| `logo-adaptive.svg` | full crest that follows the visitor's OS theme (for places the site toggle cannot reach) |
| `emblem-light.svg`, `emblem-dark.svg` | round mark without lettering (headers, sidebar, footer) |
| `favicon.ico`, `favicon.png`, `favicon-adaptive.svg` | browser tab icons (the SVG adapts to the OS theme) |
| `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` | home-screen and PWA icons, from the pack's dark set because the manifest background is navy |
| `images/og-default.png` | share image, regenerated with the new crest |

`<SchoolMark kind="emblem|logo" tone="auto|onDark|onLight" />` draws the mark. `auto` renders both
versions and lets the site's `.dark` class pick one in CSS (no script, no flash). It replaces the
`/favicon.png` placeholder in the sidebar, mobile header and landing page, and the login crest now
points at `logo-light.svg` / `logo-dark.svg`.

Not changed (frozen path, flagged for a decision): `src/lib/schoolLogoData.ts`, the default logo
that is embe
dded in server-made documents (report cards, printouts). It still holds the old mark.

### Approved exception: default document logo
`src/lib/schoolLogoData.ts` is on the frozen list, but the user explicitly approved replacing the
old orange "5" mark inside it with the new crest (the file is an embedded PNG used by PDFs, report
cards, letterheads and Excel exports). It is the ONLY frozen file ever changed, only the embedded
image and its comment changed, and the gate records it as `!src/lib/schoolLogoData.ts` in the
frozen list. An admin-uploaded logo (SCHOOL_LOGO_URL) still wins over this default.
