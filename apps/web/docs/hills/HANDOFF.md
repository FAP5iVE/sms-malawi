# Chikangawa Hills theme: handoff and working memory

Last updated: 2026-11-12 (after Phase 4, Home). Read this first when resuming.

## 1. The job
Apply the "Chikangawa Hills" look (four skies: dawn/day/dusk/night, Hanken Grotesk, glass cards,
topographic contours, sun and moon) to the SMS Malawi web app, following the 9-phase plan the user
wrote in a Claude Doc ("Chikangawa Hills Theme: Phased UI Implementation Plan"), with a review gate
after every phase. Mockup: `chikangawa-login-v2.html`.

**Hard rule: looks only.** No logic changes. Allowed: classNames, CSS tokens, JSX text, layout
wrappers, UI imports. Frozen (never touch): API routes, server code, Prisma, `proxy.ts`,
AuthProvider, Firestore rules, `src/lib/**` (except `src/lib/hills/**`). No new dependencies. Keep
stable selectors: `id`, `name`, `type`, `role`, `autoComplete`, label and button text, link targets.

## 2. Where things are
Repo: `/home/claude/sms-malawi-src/sms-malawi` (monorepo; the app is `apps/web`). Branches, each a
cumulative step on the previous: `main` (baseline as received) < `hills/phase-0-baseline` <
`hills/phase-1-tokens` < `hills/phase-2-sky` < `hills/phase-2c-font-logos` < `hills/phase-3-login` < `hills/phase-4-home`
(current head). NOTE: the history bundle was not in the zip received for Phase 3, so in the sandbox repo
`main` and `hills/phase-2c-font-logos` are one reconstructed baseline commit (the delivered 2c state);
`pnpm hills:logic-diff --base main` therefore only proves Phase 3 here. Run it on the real repo.

| Step | State | Delivered |
| --- | --- | --- |
| Phase 0 baseline and guardrails | done | review pack 0 |
| Phase 1 tokens, font, theme toggle ("Auto") | done | review pack 1 |
| Phase 2 sky background (`PublicAmbientBackground` variants) | done | review pack 2 |
| Font step: Hanken on all public pages and login family (`.hills-type`) | done | combined package |
| Logo step: school's own logos, `SchoolMark`, icons, OG image | done | combined package |
| Phase 3 Login and claim account (`hills/phase-3-login`, incl. follow-up commit) | done, reviewed | review pack 3 |
| Phase 4 Home (`hills/phase-4-home`) | done, AT REVIEW GATE | review pack 4 |
| **5 /apply** | **NEXT** | |
| 6 Other public pages, 7 Password and claim pages, 8 Logged-in app, 9 Cleanup | pending | |

The user asked for Phases 0 to the logo step to be reviewed as ONE package. Phases 3 and 4 were each reviewed on their own. Next review gate is
after Phase 5 unless the user says otherwise.

## 3. Decisions the user has made (do not re-ask)
- Readability beats looks. On `default` pages the sky shows only in the side margins of wide
  screens; the interim scrim stays fully opaque across the content column (existing text contrast
  must equal the plain page). Phase 6 opens pages up as text is redesigned for the sky.
- Auto theme follows the Malawi clock (UTC+2, no DST): dawn 05-08, day 08-16, dusk 16-19, night
  19-05. Light = day, Dark = night. Third option is labelled "Auto" (stored value `system`). No sky
  switches anywhere. Sun and moon move only on login and home.
- Hanken Grotesk on public pages and login only; DM Sans and Inter stay in the logged-in app.
- Logos: the supplied pack replaces ALL old logo, svg and ico assets in `public/`.
  `src/lib/schoolLogoData.ts` (default logo in server-made documents) was a frozen file; the user
  approved replacing it, so it now holds the new crest (the single approved exception, recorded in
  the allowlist as `!src/lib/schoolLogoData.ts`).
- Locked plan decisions (see the plan doc): typing effect = ripple only; skeleton not spinner while
  signing in; login card has no role picker, language toggle, top-right apply link or preview card.

## 4. How each task was done (the method; repeat it)
1. **Phase 0 guardrails.** `tools/hills/` (not `scripts/`, which the root .gitignore ignores):
   - `lib/fingerprint.mts`: TypeScript-AST tokeniser of logic, selector and import tokens. Class
     names, styles and JSX text are ignored. Multiset diff of old vs new.
   - `logic-diff.mts` + `logic-allowlist.json`: compares a branch to a base, fails on any frozen
     file touched or any undeclared logic/selector token or new file. Intended changes are declared
     with `{file, side, kind, pattern(regex), reason}` or `newFiles`.
   - `handler-inventory.mts` (+ `docs/hills/handler-inventory.baseline.json`): lists every event
     handler and call; `hills:inventory:check` fails on drift, regenerate after declared changes.
   - `capture-baseline.mts`: Playwright screenshots of public routes at 390 and 1280, light and dark.
2. **Each phase**: branch off the previous one, implement, then (a) declare changes in the
   allowlist until `pnpm hills:logic-diff --base <prev-branch>` says clean (and `--base main` stays
   clean), (b) `pnpm hills:test`, `pnpm hills:contrast`, `pnpm hills:inventory:check`, eslint on the
   changed files, tsc filtered to the changed files, (c) real-app before/after screenshots, (d) a
   Storybook story per new visual piece (`src/stories/Hills*.stories.tsx`), (e) commit with the
   attribution trailers, (f) a review pack zip delivered with SendUserFile, (g) STOP at the gate.
3. **Sky tokens** live in the HILLS THEME section of `globals.css`, scoped to `.hills`. `<html
   data-sky>` is set before paint by an inline script (`src/lib/hills/sky.ts`) and kept current by
   `HillsSkySync`. `@property` makes colours animatable. Zero-specificity `:where()` page-wide rule
   so a local `.hills[data-sky]` wins. Glass is opaque at 767px and below and under reduced
   transparency. Contrast is proven by `tools/hills/check-contrast.mts` (76 pairs, 4.5:1 text,
   3:1 large accent); a few mockup colours were darkened slightly to pass.
4. **Background (Phase 2)**: contour lines and stars are static SVGs in `public/hills/` made by
   `pnpm hills:assets` and drawn through CSS `mask-image` in the ink colour; only client code is
   `HillsCelestial` (vivid/home sun and moon). Variants: default, vivid, home, calm. Verified
   readability by hiding page content and sampling the real pixels behind text, scroll cost by a
   Chromium trace (identical to the old background once painted).
5. **Font step**: one wrapper class `.hills-type` re-points `--font-sans` and `--font-heading`.
6. **Logo step**: deleted the old assets, installed the pack per its README, one `SchoolMark`
   component (CSS light/dark swap, no flash), regenerated `og-default.png` with Playwright from an
   HTML template, kept all file names that other code references (`favicon.ico`, `icon-192/512.png`,
   `apple-touch-icon.png`).

7. **Phase 3 (login family).** All five screens (login, claim, forgot, reset, change password) render
   through `AuthShell`, so changing it moved all of them. Pieces:
   - `AuthShell.tsx`: `.hills-container` + `.hills-split` (`.hills-auth__grid`, areas statement / card /
     notice; one column under 900px). Headline: four phrases stacked in one grid cell, CSS picks one
     from per-sky tokens (`--hills-w-dawn/day/dusk/night`), so no clock code and it crossfades when
     `data-sky` changes. Headline is `aria-hidden` decoration; the page's own `<h1>` is in the card.
   - Crest: both colourways drawn (`SchoolMark` onLight/onDark); `--hills-lightink` picks by SKY
     (the artwork is transparent and sits on the sky, so the theme class would be wrong in Auto).
   - Card surface follows the THEME (`--hills-surface`, 92% over the sky), never the sky, so old-style
     children (forgot/reset/change/claim, until Phase 7) stay readable on a dusk sky with a light theme.
     Colours inside the card are `--c-*` (light = day palette, dark = night palette); contrast proven
     for 4 skies x 2 themes x 3 spots (192 extra pairs in `check-contrast.mts`, 268 total).
   - Busy: login passes `skeletonOnBusy`; CSS shows `HillsSigningScene` (dashboard-shaped skeleton) while
     `.hills-auth[data-scene]:has(button[type=submit]:disabled)`, i.e. exactly `isBusy`, so an error
     brings the headline back with no extra state. Button label stays, sweep reuses `skeleton-sweep`.
   - Ripple: `useTypingRipple` (delegated `input` listener on `<main>`), rules in `lib/hills/ripple.ts`
     (110 ms gap, none under reduced motion or when the motion store is off), unit-tested.
   - Phones: sun and moon arc is squeezed into a band above the headline
     (`top: calc(66px + var(--sun-y) * .2)` under 900px) so the disc never sits behind text.
   - Measured, not eyeballed: hid the text and sampled real pixels behind every text box
     (2nd percentile, because stars and contour lines are single pixels): lowest 3.06:1 for the large
     accent word on the day sky (needs 3), everything else 4.8:1 or better.

8. **Phase 4 (Home, `(public)/page.tsx`).**
   - `<PublicAmbientBackground variant="home" />` is the first child of the page wrapper; the wrapper no
     longer has `bg-page`. `.hills-bg--home` has a larger disc (`--hills-cel`).
   - The sky is a FIXED, positioned layer: a section paints over it only if it is positioned (`relative`)
     and later in the DOM, or has `z-10`. News was the one section without `relative`; it got it. When
     adding a section to this page, give it `relative`.
   - Only Academic Advertisements and Stay Connected are transparent, and their content sits on
     `bg-surface` cards (two cards each). Hero photo, bg-brand-deep / teal bands and bg-surface bands are
     solid. Checked in 4 skies x light/dark x 1280/390: no text node lacks an opaque or image background
     (script `home.mjs` in the review pack), and no horizontal scroll.
   - Removed: ScribbleDefs, ScribbleArt and 7 uses. 13 page-width blocks now `.hills-container`.
   - Theme button keeps its cycle behaviour and aria-label; it only gained a `title` (Auto/Light/Dark).
     Home keeps its own nav; it is not `PublicHeader`.
   - Weight (dev render, same mocked data): DOM nodes 907 to 881, HTML 192.1 to 187.5 KB light
     (173.5 to 168.9 KB dark). Not a production transfer measurement.
   - Allowlist: 12 entries for page.tsx (removed doodle functions/ids, the new tooltip). One is the
     generic `return ( <JSX/> )` removal; re-read it if page.tsx ever loses a real return.
   - Handler inventory baseline regenerated: only page.tsx's digest and token count changed (362 to 352);
     the 2128 handler items are identical.

## 5. Environment gotchas (this sandbox)
- Prisma engine download is blocked: no Prisma client, no database, so signed-in pages cannot be
  rendered or screenshotted. Do not retry or work around. tsc errors from missing Prisma types are
  environmental; filter tsc output to the changed files.
- Vitest suites fail before and after (`@testing-library/jest-dom` is not a dependency). Pre-existing.
- Background processes are killed between calls: run `next dev` and the capture in ONE wrapper
  script (see the `run-capture*.sh` pattern), and use `HILLS_CHROMIUM_PATH` for the browser.
- `next dev` writes `AGENTS.md` and `CLAUDE.md` into `apps/web`: delete them, never commit them.
- `globals.css` is CRLF. Edit with Python using `newline=''` or the whole file shows as changed.
- Next 16 has breaking changes versus older knowledge: read `node_modules/next/dist/docs` before
  using an API.
- Commit trailers: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and the
  `Claude-Session:` URL of the CURRENT session (it changes between sessions; Phase 3 used
  `https://claude.ai/code/session_01MVwwVD34eP3fyoyqZFXXR4`).
- Turbopack refuses a symlinked `node_modules` in a git worktree ("points out of the filesystem root").
  For a before-capture, `git stash`, run the capture in the same dir, `git stash pop`.
- Mock the home page data with `page.route('**/public/**')` (shapes in `hooks/usePublic.ts`); the
  sandbox has no backend.
- Playwright `waitForSelector('[role=alert]')` also matches Next's route announcer (it pierces shadow
  DOM). Use `page.waitForFunction(() => document.querySelector('[role=alert]'))`.
- Fake the Malawi clock with `context.clock.setFixedTime(...)`; 06:30/12:00/17:00/23:30 Malawi are
  04:30/10:00/15:00/21:30 UTC.

## 6. Open items and risks
- Decide whether to replace the old mark inside `schoolLogoData.ts` (frozen path).
- Signed-in `calm` variant is only verified in Storybook; the user should check one real dashboard.
- Phase 3 decisions (user asked for the best option on each, 2026-11-11):
  1. Phones: sun and moon now scroll away with the page (scroll-linked `translate`, 1:1 for the first
     700px, `@supports (animation-timeline: scroll())`), so the disc never sits behind the headline.
     Browsers without scroll-driven animation (Firefox today) keep the fixed disc.
  2. Placeholder uses its own token `--c-ph` (62% ink, about 4.7:1 or better, checked for every sky,
     theme and spot) so it reads clearly lighter than typed text (82% ink stays for other secondary text).
  3. Header bar stays the Phase 2 `PublicHeader` until Phase 6 (not pulled forward).
  4. The decorative headline stays `aria-hidden`; the card's `<h1>` ("Sign in") is the page heading.
  5. The Suspense fallback shows the sky WITHOUT the sun or moon (CSS on `[aria-busy]`), so the disc
     fades in once, not twice. Only visible in production builds on a slow first load.
  Still untested: Firebase success and "no role assigned" paths (Firebase is unreachable from the sandbox).
- Phase 3 left the interim pages on their old field styling inside the new card (Phase 7 redoes them).
- Phase 9 (cleanup) is optional and last.
