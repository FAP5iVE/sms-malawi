# Chikangawa Hills theme: handoff and working memory

Last updated: 2026-11-15 (after Phase 8b-0 foundations, AT REVIEW GATE; before 8d). Read this first when resuming. Then read `docs/hills/RULEBOOK.md`.

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
`hills/phase-1-tokens` < `hills/phase-2-sky` < `hills/phase-2c-font-logos` < `hills/phase-3-login` < `hills/phase-4-home` <
`hills/phase-4b-home-polish` < `hills/phase-5-apply` < ... < `hills/phase-8a-shell-pilot` < `hills/phase-8-plan` < `hills/phase-8b0-foundations` (current head). NOTE: the history bundle was not in the zip received for Phase 3, so in the sandbox repo
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
| Phase 4b Home polish (`hills/phase-4b-home-polish`) | done, AT REVIEW GATE | review pack 4b |
| Phase 5 /apply (`hills/phase-5-apply`) | done, reviewed (user moved on to 6) | review pack 5 |
| Phase 6a Text pages (`hills/phase-6-public-pages`) | done, reviewed | review pack 6a |
| Phase 6b Lists, details, gallery, placement results, 404, `PublicArchive` (same branch) | done (user said "start the next", so treated as reviewed) | review pack 6b |
| Phase 7 Password and claim pages (`hills/phase-7-password-claim`) | done, AT REVIEW GATE | review pack 7 |
| Phase 7b Reset link opens the in-app page (`hills/phase-7b-reset-link`, off phase 7) - USER-APPROVED LOGIC EXCEPTION | done, AT REVIEW GATE | review pack 7b |
| Phase 8a Logged-in shell + pilot: Exams, Students, Finances (`hills/phase-8a-shell-pilot`, off 7b) | done, AT REVIEW GATE | review pack 8a |
| Plan extension 8b to 9 (`hills/phase-8-plan`, docs and tools only) | done, OWNER APPROVED 15 Nov 06:05 | `RULEBOOK.md`, `research/` |
| 8b-0 foundations (text tones, StatusText, AttentionBadge, motion tokens, dialog sizes, paging, Button) (`hills/phase-8b0-foundations`, off `hills/phase-8-plan`) | done, AT REVIEW GATE | review pack 8b-0 |
| **8d** header + sidebar + phone bottom bar | **NEXT** (after the 8b-0 gate) | |
| **8b-1, 8b-2, 8b-3** page rollout in three batches | after 8d | |
| **8c** dashboards, greeting, parent portal; **8e** calendar; **8f** emails; **8g** report cards + exports | after 8b; 8f and 8g exception APPROVED (presentation only) | |
| **9** cleanup, ratchets (pills = 0, AI-tell count only down, contrast 100%) | last | |

The user asked for Phases 0 to the logo step to be reviewed as ONE package. Phases 3 and 4 were each reviewed on their own. Phase 6 is split in two review drops (6a, then 6b). Next review gate is
after 6a.

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

9. **Phase 4b (home polish, same `(public)/page.tsx`).** The user asked for: a decision on two open items,
   "AI clues" removed, animation, and the studio name in the footer. Kit used: `agent-kit-school-nextjs.zip`
   (for this app only; NOT in the repo; only its AI-tells scan may be reused in Phases 5 and 6).
   - Decisions (user asked for the best option): sky stays in two sections and the hero stays solid (it is
     the one real photo; text over a see-through hero fails the readability rule); the home page keeps its own
     nav (search, anchors, mega menu).
   - AI tells fixed by eye (the kit scan is only a net): generic copy and "excellence" wording, eyebrow labels,
     equal card grids, the icon trio, purple, the gradient placeholder. Existing facts were NOT extended; the
     claim "Applications for the new intake are open." was already there and is unverified (ask the school).
   - Animation (all in `globals.css` HILLS MOTION; `src/components/motion/*`, rules in `lib/hills/motion.ts`,
     unit-tested): `Reveal` (server HTML is visible; only below-fold elements are hidden after hydration; none under
     reduced motion or when the motion store is off; 70 ms stagger, max 6 items, CSS animation with `backwards`
     fill so hover transforms still work), hero settle, `ScrollProgress` (CSS-only bar via
     `animation-timeline: scroll()`; absent in Firefox, no loss). Skipped on purpose: the kit's global
     `template.tsx` route fade (affects every route) and count-up numbers (the figures are text the user owns).
   - Footer: large `StudioWordmark` plus `StudioCredit` in orange `#ff8a3d` (`--hills-studio`; about 6:1 on the
     always-dark footer, so one orange works in both themes). Name, link and style live in ONE file,
     `src/lib/hills/studio.ts` (`name: '5iveStack Labs'`, `url: undefined`). Setting `url` turns the credit into a
     link. The URL was not given: ask the user.
   - Regression found and fixed: Phase 4 moved the header to `.hills-container` (5vw side padding) and the 1243px
     header overflowed at 1280px (Menu button clipped). Fix: `.hills-container--nav` (padding shrinks to fit,
     equals 5vw from about 1400px), used on the header and both flyouts. Measured at 390, 768, 1024, 1100, 1280,
     1366, 1440, 1920: nothing clipped. LESSON: when swapping a container class on a header, measure the last
     control's right edge at 1024 to 1440.
   - Also fixed: 21px horizontal overflow at 320px from Phase 4 cards (`grid-cols-1` on the ads and contact grids).
   - Checked: no text on bare sky (4 skies x light/dark x 1280/390), no horizontal scroll, reveal with JS off
     (0 hidden), reduced motion (0 hidden), normal (14 hidden below the fold, 0 after scrolling), contrast gate
     (292 pairs pass), 38 tests, logic gate clean vs `hills/phase-4-home`, inventory baseline regenerated.
   - Not tested: Firefox and Safari, real data (mocked), a production build.
   - Weight (dev render, same mocked data): DOM nodes 881 to 841, HTML 187.5 to 183.2 KB light (168.9 to 164.5 KB dark); not a production transfer measurement.

10. **Phase 5 (`(public)/apply/page.tsx`, 1,141 lines).** Looks only; the logic fingerprint is clean with 10 declared tokens.
   - NOTE: the plan says five steps; the code has SIX (Personal, Contact, Academic, Guardian, Welfare, Review). Built for six.
   - Layout: `.hills-container` > `.hills-split` with `--hills-split-cols: clamp(240px, 26vw, 340px) minmax(0, 760px)`,
     centred. From 900px the left column (title, required-field note, step list; sticky at `top: 96px` when the
     viewport is 640px+ tall) sits on the sky; the right column is the form on ONE opaque surface
     (`.hills-apply__surface`, follows the Light/Dark THEME like the sign-in card, same `--c-*` tokens). Below 900px:
     one column and the step list becomes a strip of numbered circles (labels visually hidden but in the DOM, so every
     step button has a name; before, they had none on phones). The same `<ol>` serves both layouts.
   - `hills-open` on the page root hides the interim scrim (`.hills-open .hills-bg__scrim { display: none }`), so
     the left-column text is on bare sky. Phase 6 should reuse this for the other pages instead of a prop.
   - Fields: underlined `.hills-ctl` (CSS scoped to the surface). The two-column field grid is a CONTAINER query
     (`@container (min-width: 560px)` on the surface), so it follows the surface width, not the viewport.
     `inputCls`/`inputError`/`inputBase`/`phoneCodeSelectCls` keep their names; only the strings changed.
     `.hills-go--inline` (Next) and `.hills-go--solid` (Submit, accent fill) reuse the sign-in button.
   - Success screen: same two columns (tick, title, thank-you on the sky; "What happens next?" on the surface).
   - Measured on real pixels (hide the text, sample behind each line; `measure.mjs` + `measure.py` in the pack):
     4 skies x 360/390/768/1280/1920, 68 groups, 216 text lines, worst 4.58:1. The first run FAILED two things the
     token model had passed (93% ink-2 note on the day sky, 4.2:1; danger-red asterisk, 4.15:1); both now use full ink.
     LESSON: the sky gradient model in `check-contrast.mts` is about 0.2 to 0.35 optimistic on the day sky (contour
     lines, glow). For text on bare sky use full `--hills-ink`, and always measure real pixels.
   - Contrast gate extended (268 to 342 pairs): the apply surface per theme (text, hints, placeholder, focus/error
     tints, error, review headings, badges, warning, both buttons incl. sweep) and, per sky, step circles.
   - Walkthrough (`walk.mjs`): every step with valid data, validation errors, Previous, click a completed step, click a
     future step (does nothing), server 409 error, submit, success; 5 widths x light/dark; no overflow at
     360/390/768/1280/1920. Form behaviour identical before and after.
   - Seen but NOT changed (logic or out of scope): the Sex error reads "Invalid enum value. Expected 'MALE' | 'FEMALE',
     received ''" (zod default message, `packages/shared`, frozen); labels are not tied to inputs (no `htmlFor`/`id`);
     section titles are `<h3>` under the `<h1>` with no `<h2>`; the server error box has no `role="alert"`; the
     header is still the Phase 2 `PublicHeader` (Phase 6).
   - Not done: Storybook story (the layout is page-specific markup, not a reusable component; the real-page captures
     of every step, theme and width replace it); scroll-performance trace; Firefox and Safari (container queries and
     `:has` are not used; container queries need Safari 16+, Firefox 110+).
   - Allowlist: 10 entries (8 class-string constants, `aria-current`, the removed connector condition). Handler inventory
     regenerated: only the page's digest changed (390 tokens, same handlers).

11. **Phase 6a (privacy, terms, admissions, academics, student life, leadership + `PublicHeader`).** Looks only; logic fingerprint clean
    against `hills/phase-5-apply` (67 declared) and against `main`.
   - NEW `components/shared/PublicPageLayout.tsx` (client; declared in `newFiles`). Props: `title`, `intro`, `wide`, `surface`
     (default true), `contents` (default true), `children`. It renders `<PublicAmbientBackground />` itself and the root has
     `hills hills-open hills-page`, so pages must NOT import the background or keep their own `max-w-*`/`<h1>`/`<main>`.
     Grid: `.hills-split` with `--hills-split-cols: clamp(240px,26vw,340px) minmax(0,860px)` (`--wide`: `minmax(0,1fr)`), centred.
   - "On this page" list: built on the client from every `<h2>` inside a `<section>` of the content; a section with no id gets one
     from its heading (de-duplicated slug), so the footer anchors that already exist (`#curriculum`, `#facilities`, `#how-to-apply`,
     `#fees`, ...) are untouched. Fewer than two headings = no list. Scroll-spy via IntersectionObserver. Desktop: left, sticky,
     scrolls inside itself for long lists (privacy has 14). Below 900px: a row of 44px pills that scrolls sideways inside itself.
     CAVEAT: ids it creates exist only after hydration; an external link to such a section works only if the section already had an id.
   - Content surface `.hills-page__surface` = opaque `--card` (follows the Light/Dark theme, like sign-in/apply). `h2/h3/th` follow
     the surface (privacy/terms headings were `text-brand-navy` with no dark variant = near-invisible on a dark surface before);
     `p/ul/ol` max 760px (measured 760 at 1920). Links use `.hills-page__link` (accent `--c-acc`, underlined, 7.97 / 8.77:1).
   - `admissions`: the teal "Ready to apply?" band is now `.hills-page__cta` (inverted: card colour on foreground) because white on
     brand-teal is weak and unreadable in dark; contact cards are `.hills-page__contacts` (auto-fit, min 230px) since the narrower
     surface cut the email. `leadership`: `wide` + `surface={false}`; cards in `.hills-page__cards` (auto-fill, min 230px) replace the
     `sm/lg/xl` breakpoints; the empty state has its own opaque panel (`.hills-page__empty`); member title uses `.hills-page__accent`.
   - `PublicHeader` inner row now `.hills-container` (was `max-w-6xl px-4 sm:px-6`).
   - Contrast gate 342 to 366 pairs (page surface per theme: body, muted, link, CTA band, pills, brand icons as graphics).
     Real pixels (`measure6.mjs` + `measure.py`): 4 skies x 5 widths x 6 pages, 320 groups, 912 lines, 0 fail, worst 4.58:1 (day, intro).
   - Checked: no sideways overflow at 360/390/768/1280/1920 on all six pages, light and dark; one `<h1>` and one `<main>` per page.
   - Width search (`max-w-3xl..7xl`) over `(public)` + shared public components: none left in the six 6a pages. LEFT for 6b:
     `placement-results` (5xl), `events` (4xl), `gallery` (7xl), `PublicArchive` (5xl list, 3xl detail). Also `(public)/page.tsx:595`
     `max-w-3xl fade-up` (home hero text block from Phase 4): needs a decision (swap to `.hills-measure`?).
   - Seen, NOT changed: privacy/terms still contain "[School's full legal name]" placeholders and terms print `new Date().getFullYear()`
     as "Last updated"; section numbers are typed into the privacy headings, so the contents list shows "1. Who we are" etc.
   - Not done: Storybook story (page frame, covered by real-page captures); Firefox/Safari; production build.

12. **Phase 6b (lists, details, gallery, placements, 404) + three requests from the user.** Looks only except item (c); logic fingerprint clean
    against `hills/phase-6-public-pages`, `hills/phase-5-apply` and `main`; contrast gate 376 pairs.
   - `PublicPageLayout` gained `above` (back link / eyebrow), `below` (sibling links, quick links, button), `compact` (smaller title for
     post headlines) and an exported `PublicSiblingNav current="/news"` ("More from the school": News, Announcements, Academic
     Advertisements, Events, Gallery, University Placements). The contents scan now re-runs on markup changes (MutationObserver), so content that
     loads later (placement universities) is included; before this, `/placement-results` had no list.
   - `PublicArchive.tsx` (changed once, covers /news, /notices, /academic-advertisements, /events lists and details): lists = title and subtitle +
     sibling links on the sky, cards on one surface; details = back link, headline (`compact`) and an opaque date/byline chip on the sky,
     image and body on the surface. `PublicPostSeoLayout` is JSON-LD and metadata only (no visual markup), so it needed no change.
     The eight route files and `events/page.tsx`, `gallery`, `placement-results` no longer import `PublicAmbientBackground` (the layout draws it).
   - `not-found.tsx`: eyebrow "Error 404", title, sentence, `.hills-page__btn` and quick links on the sky; the two illustrations on the surface.
   - Fixes found on the way: events date-badge month text `text-brand-teal-light` measured 4.15:1 in light, now `text-white/90`; post-body blockquote
     colour (`[&_blockquote]:text-muted`) was near-invisible in both themes, now `.hills-prose blockquote` (ink 82%); post-body links use the accent;
     form controls on the surface get a visible focus ring; detail date/byline measured 3.5 to 4.2:1 on the dawn and dusk sky on a phone
     (a four-line headline pushes it low), so it is now an opaque chip (`.hills-page--compact .hills-page__intro`).
   - Home hero text block `max-w-3xl` became `.hills-measure`. The width search over `(public)`, shared Public* components and `not-found` now
     finds only comments.
   - USER REQUESTS (2026-11-13): (a) "default theme always Auto": it already is (`defaultTheme="system"`, nothing is stored until the person chooses; the
     menu marks Auto on a fresh visit, verified). A visitor who chose Light or Dark earlier keeps that choice until they pick Auto; no code change.
     (b) Left columns stay pinned on privacy, terms and apply: the old rule only pinned when the window was at least 640px tall. Now
     `position: sticky; top: 96px; max-height: calc(100svh - 112px); overflow-y: auto` from 900px wide at any height, so a column taller than the window
     scrolls inside itself (`.hills-page__side`, `.hills-apply__side--sticky`). At the very end of a page the column leaves with the content
     (inherent to sticky). (c) /apply: after Next/Previous the pinned column scrolls itself so the current step is in view. This is a small effect on
     `step` in `apply/page.tsx` (reads the DOM, sets `scrollTop` of the column only; the page does not move). It is the one behaviour addition in the theme
     work and is declared in the allowlist with the reason "requested by the user". The contents list does the same for the current heading.
   - Real pixels (`measure6b.mjs`): lists + 404 = 4 skies x 5 widths x 5 pages, 288 groups, 632 lines, 0 fail, worst 4.70:1; detail = 4 skies x 390/1280,
     16 groups, 0 fail (after the chip). Overflow clean at 360/390/768/1280/1920 on every 6b list page and the 404, light and dark.
   - Environment: the detail pages (`/news/p1` etc.) take about 47s per request in this sandbox (server-side metadata lookup hits Firestore, blocked). The
     capture script allows 2 minutes; capture only two detail routes per set.
   - Not done: no Storybook story (frame covered by real-page captures); no empty-state screenshots for the gallery and placements (mock returned data); Firefox/Safari.

13. **Phase 7 (forgot, reset, change password and the parent claim form).** Branch `hills/phase-7-password-claim` off 6b. Looks only; logic
    fingerprint clean against 6b (20 declared), Phase 5 (160) and `main` (170); contrast gate 386 pairs.
   - These four screens already sat in the sign-in card (`AuthShell`) but kept their pre-Hills field styling. They now use login's own pieces
     (`.hills-field`, `.hills-input`, `.hills-label`, `.hills-pw`/`.hills-eye`, `.hills-go`, `.hills-alert`, `.hills-link`, `.hills-alt`,
     `.hills-auth__title/lede`). New in globals.css (section "HILLS AUTH FAMILY"): `.hills-back` (back link), `.hills-hint`,
     `.hills-field-err` (+ red underline via `aria-invalid`), `.hills-mono` (invitation code), read-only field, `.hills-status` (+ `__icon--ok/danger`;
     centred-left status screens: link sent, link expired, password updated, account ready), `.hills-checking` (verify / loading), `a.hills-go`,
     `.hills-go--link`, and the card token `--c-ok` (light #0c3f31, dark #8fe3bf).
   - Files: `forgot-password/page.tsx`, `reset-password/page.tsx` (its Suspense fallback is now the sign-in `AuthShellSkeleton`; its hidden text still
     says "Loading the sign-in page"), `change-password/page.tsx` (PasswordField and both flows; the first-login flow could not be rendered here),
     `GuardianClaimForm.tsx` (the claim form behind `/login?claim=1`). There is no separate claim route.
   - Visible changes besides the look: the key / mail / lock icon tiles and the coloured status circles are gone (a ring icon instead), the inline
     spinner on submit buttons is gone (the busy sweep on `.hills-go:disabled` shows it, as on login), and on change-password the error now shows above
     the form (as on login). All declared in the allowlist with reasons. Ids, types, autocomplete, labels, button text, hint wording, link
     targets and every auth/API call are unchanged.
   - Real pixels (`measure7.mjs`, `analyze7.py`): 14 states x 4 skies x light/dark x 390/1280 = 224 captures, 1952 text boxes, 0 fail, worst 4.93:1.
     Text colours that CSS gives as `color(srgb ...)` need the 0..1 scale converted; hide fixed bubbles (the 5iveStack badge) and scroll to top before
     capturing or they pollute the sample. No sideways scroll at 360/390/768/1280/1920 on any state.
   - States captured with mocks (Firebase REST `accounts:*` routes and `**/guardian-claim` via `page.route`): form, error, sent, expired, missing code,
     updated, short password (reset), wrong current password (change), empty submit, server error and done (claim). Not rendered: change-password
     "first login" (needs a signed-in user with the claim), and the real Firebase round trip.

14. **Phase 7b: one-time, user-approved logic exception (2026-11-14): the reset email must open the app's own page.** Branch
    `hills/phase-7b-reset-link` off Phase 7. NOT a looks-only change; kept off the Phase 7 branch on purpose. The user said in writing: "a one time
    exception ... to change the logic". It does NOT lift the rules for later phases.
   - Cause: Firebase's own reset email (client `sendPasswordResetEmail`, and the raw output of Admin `generatePasswordResetLink`) always links to
     Firebase's hosted action page (`*.firebaseapp.com/__/auth/action`). `url` / `handleCodeInApp` do not change that. The in-app `/reset-password`
     page never received the code.
   - Fix (no Firebase console setting needed): `passwordResetService.ts` asks the Admin SDK for the link, keeps only the `oobCode`, and emails
     `${NEXT_PUBLIC_APP_URL}/reset-password?oobCode=...` through Resend with a new school-branded template (`templates/emails/password-reset.ts`).
     New public route `POST /public/password-reset` (rate policy `public-password-reset`: per address 3/h, per IP, global budget; declared in
     `test/security/accessPolicy.ts`; `docs/security/endpoint-inventory.md` regenerated). Same answer for known, unknown and disabled addresses;
     `delivered:false` only when a real account exists and sending failed. Callers: `/forgot-password`, Settings > Profile (both through
     `lib/passwordResetRequest.ts`, which falls back to Firebase's own email only on `delivered:false`), and the admin "send reset" in
     `userManagementService.sendPasswordReset`.
   - Needs in production: `NEXT_PUBLIC_APP_URL` = the real site origin, `RESEND_API_KEY`, and a Resend-verified `EMAIL_FROM_ADDRESS`. If email is not
     configured the fallback sends Firebase's plain email, so reset never breaks.
   - Also fixed (found while rendering the email): `TOKEN.FONT_HEADING` in `templates/emails/base.ts` had double quotes inside `style="..."`, which cut the
     header's white colour off (school name rendered black on navy in EVERY email). Now single quotes; test added.
   - Small: `AuthShellSkeleton` takes an optional `label` (hidden text); reset-password passes "Loading your reset link…".
   - Gate: `logic-allowlist.json` has a new `approvedFrozen` list (file, reason, approvedOn). It lifts the frozen stop for those 9 files only; every
     token still has to be declared, and the report prints an "APPROVED exceptions" block. Any other frozen file still fails.
   - Tests: `passwordResetService.test.ts` (12) + policy test; route-contract and security-doc tests pass. The repo's own vitest config needs
     `@testing-library/jest-dom`, which is not installed in this sandbox; run with a config without that setup file (see scratchpad
     `vitest.sandbox.config.mts`). 8 other tests fail here with and without this change (settings.actions x7, assignmentService x1) plus riskService
     failing to load; they are environment, not this change.
   - Not done / cannot be tested here: a real email through Resend and a real Firebase code (no keys, no network). The route runs only through unit
     tests (service) and mocked browser tests (page); the Express route itself was not exercised against Firebase.

15. **Phase 8a: logged-in shell and pilot (Exams, Students, Finances).** Branch `hills/phase-8a-shell-pilot` off 7b. Looks only; logic gate clean
    against 7b AND `main` (16 new declared tokens, all `useFlatSurface()` reads, the `bordered` default and the `onSky` prop).
    - `(auth)/layout.tsx`: gutters 16 / 24 / 32px (`px-4 md:px-6 lg:px-8`, `md:pt-6`); `main-scroll-pad` bottom clearance untouched.
    - `ModuleSurface` rewritten: ONE border, 14px radius, one padding (20px, 24px from 1024), no line-art, nothing clipped. Phones (<768px) edge to
      edge (`margin-inline:-1rem`, no side border, no corners). It provides `<FlatSurface>`. CSS is `.app-surface`, `.app-tint`, `.app-sky-idle`
      at the end of `globals.css` (unlayered on purpose, like `.main-scroll-pad`). Tint token `--app-tint` (light 210 25% 98.5%, dark 224 30% 14%).
    - Flat by default on a surface: `StatCard` (tint tile; a card with `href` keeps its border and hover), `ListCard`, `DataTable` (own card only when
      NOT on a surface; an explicit `bordered` prop still wins; header row on the tint; non-tappable mobile rows are tint tiles, tappable ones keep
      their border), `ChartCard`/`ReportCard`/`ReportFilters` already did. `ModuleTabs` has an optional `onSky` prop (idle label = 78% body ink via
      `.app-sky-idle`, active label = brand-navy; the teal underline stays) so tabs sitting on the sky keep 4.5:1.
    - Pilot pages: title + tabs moved ABOVE the surface (Exams; Finances both tab levels); Students/Finances stat tiles moved INSIDE it as tint tiles;
      Finances tiles stack icon over value (numbers no longer break mid-figure) and go 4-up from 1280px.
    - Measured on real pixels (`measure8.mjs` + `analyze8.py`, text hidden): all text on the sky and in the new tint passes 4.5:1. What still fails is
      OLD brand colour use on white, not changed here: white on brand-teal buttons in dark mode (1.91:1, "Add Student", "Schedule Exam"), emerald status
      text 4.38, teal links 4.38, coral 4.19, amber "Medium Risk" 3.19. These are shared tokens; a fix needs the user's decision.
    - Other ModuleSurface pages (attendance, library, hr, announcements, reports, classes, calendar, settings) render without errors or sideways overflow
      under the new surface; their own inner bordered tiles are left for 8b.
    - Clock check: 09:00 vs 16:00 Malawi screenshots of all five pilot views are pixel-identical (no sky switching in the app).
    - Harness (new, in the pack `tools-capture/`): `session.mjs` (fake Firebase user in IndexedDB + unsigned JWT claims + mocked token endpoints),
      `fixtures.mjs` (sample API data), `cap8.mjs` (screenshots; env BASE OUT PAGES WIDTHS THEMES CLOCK; CLOCK must be an ISO date), `measure8.mjs`,
      `analyze8.py`, `run8.sh`/`runmulti.sh`/`runclock.sh`/`runm.sh`, `combo.py`, `vitest.dom.config.mts`.
    - Tests: `FlatSurface.test.tsx` now 8 tests (surface, StatCard, ListCard, DataTable, ModuleTabs). Contrast: 404 pairs (18 new `app8` pairs).
    - Open for the user: does the pilot look right (tint tiles, tabs on the sky)? If yes, 8b rolls it out in three batches.

16. **Plan extension for the signed-in overhaul (15 Nov 2026).** Branch `hills/phase-8-plan` off 8a. No UI code changed. The owner approved the pilot and asked
    for research first, then an extended plan. Read `docs/hills/RULEBOOK.md` before any 8b+ work: it is the single rule list (numbered R1 to R12)
    with the source status of each rule ([read] / [ours] / [unverified]). Research logs are in `docs/hills/research/A` to `G`.
    - Order of work: 8b-0 foundations, 8d shell (header, sidebar, phone bar), 8b-1/2/3 page rollout, 8c dashboards + parent portal, 8e calendar,
      8f emails, 8g report cards + exports, 9 cleanup. Each ends at a review gate with a pack.
    - Batch suggestion: 8b-1 attendance, timetable, guardians, classes, placements, applications; 8b-2 library, HR, announcements, approvals,
      settings, monitoring, reports; 8b-3 the rest of Exams/Students/Finances inner tabs and any page not yet reached. Finance tabs regrouped to one row.
    - New tooling: `apps/web/tools/hills/ai-tells/` (`tells.json`, 23 detectors; `scan_tells.py`, run from `apps/web/src`). Baseline 235 hits in 89 files.
      Rule: the count may only go down; a person still reads every page.
    - Frozen server paths for 8f and 8g (emails, PDFs, exports) need an explicit `approvedFrozen` entry for presentation only, like 7b. Do not start them
      without the owner's written OK.
    - Research gaps (do not present as standards): A4 PDF margins and page numbering, payslip and report-card document norms, Excel/CSV norms, Malawi
      receipt rules, three dialog widths (400/560/720), reduced-motion source, Monday week start.
    - Old colour failures are now in scope (owner said CHANGE AND FIX): add text tones in 8b-0, prove with `pnpm hills:contrast`.

    - **Owner decisions, 15 Nov 2026 06:05 (all recorded in RULEBOOK section 12):** emails and exports frozen-path exception YES (presentation only; add each
      file to `approvedFrozen` with a reason); attention badges where the page does not already load the count = no badge, no new query (Claude's call, owner
      delegated); server side paging NO (client side only); header/sidebar/bottom bar redesign YES; colour text tones YES; greeting and role line wording YES;
      export-ready notice and undo-instead-of-confirm not planned. The plan gate is passed: start 8b-0.

17. **Phase 8b-0: foundations for the signed-in overhaul.** Branch `hills/phase-8b0-foundations` off `hills/phase-8-plan`. Looks only; logic gate clean against
    `hills/phase-8-plan` and `main` (226 declared tokens with reasons, 6 new files); contrast gate 494 pairs (90 new `tone8` pairs); 57 node tests (19 new);
    inventory regenerated (only the three new components added; no existing handler changed). No page was converted yet: these are the parts the batches use.
    - **Text tones (R3).** New tokens in the section "HILLS APP FOUNDATIONS" at the end of `globals.css`, with Tailwind names `text-tone-teal|coral|amber`
      (light darker, dark = the old brand values), button pairs `bg-btn-brand text-btn-brand-fg` and `bg-btn-danger text-btn-danger-fg` (hover variants too).
      Light values: teal `163 79% 26%` (5.55 on white), coral `8 68% 44%`, amber `32 93% 32%`. Dark: white label on light teal measured 1.91, so the label is
      navy `224 44% 7%`. TWO existing light tokens were also failing and were darkened: `--muted-foreground` 47% to 42% lightness (4.40 on the page and 3.99 on a muted
      row before; 5.27 / 4.78 now) and `--status-warning` 37% to 33% (4.27 on a muted row before). Both are small global changes; tell the owner.
    - **Safety net for legacy buttons.** 63 places write `bg-brand-teal text-white` (a few `bg-brand-coral text-white`). Four unlayered rules fix exactly that class pair
      with the new pairs, EXCEPT inside `.hills-type` (public pages and the sign-in family, approved as they are). Verified in a real browser on both sides of the guard.
      Phase 9 deletes the block when a grep finds no pair left. Open for the owner: 3 buttons on the public home page (`(public)/page.tsx` lines 449, 455, 608: nav Apply and
      hero Apply) keep white on teal: 4.38:1 in light, 1.91:1 in dark.
    - **`StatusText`** (`components/shared/StatusText.tsx`): coloured word plus an 8px shape (circle success, ring info, triangle warning, diamond danger, bar neutral). No pill.
      Uses the `text-status-*` tokens. Text 25 characters or fewer is a convention, not enforced.
    - **`AttentionBadge`** (`components/shared/AttentionBadge.tsx`) + pure rules and the source map in `lib/hills/attention.ts`: count (`99+`) or dot, hidden for 0, NaN,
      negative, decimal, null; sentence for screen readers ("5 waiting for your review"); `onDark` pair for the sidebar (dark in both themes). `ATTENTION_SOURCES` lists
      every count the app already loads (approvals awaiting me, notifications unread, HR leave and contracts, placements, announcements, monitoring, student assignments)
      and three that would need a NEW query (fees unpaid, library overdue, attendance not marked): those may NOT draw (`mayShowBadge`). `INFORMATIONAL_TAB_COUNTS` lists tab
      numbers that are totals, not attention (library fines/catalog/borrowings, announcements published/drafts, class assignments for staff, class list, approvals
      "Approved (12)" labels): each batch removes those numbers. `ModuleTabs` now draws its count through `AttentionBadge` (optional `badgeNoun` on a tab). Sidebar,
      bottom bar and header adopt it in 8d.
    - **Paging parts (R7, client side only).** `lib/hills/paging.ts` (pure; sizes 10/25/50, default 25, phones 20 + "Show 20 more", cards 5), `usePagedRows` (reads rows a
      page already has; stored size via `useSyncExternalStore`, phone via `matchMedia`, `resetKey` returns to page 1), `ListPager` (desktop range + rows per page + Previous/Next;
      phone full-width "Show 20 more"). Not used by any page yet; adopt per list in the batches and tag keep / page / show-more in each page's notes.
    - **Motion (R9).** `--ease-*` and `--dur-*` tokens, `lib/hills/motion.ts` constants (test checks CSS and TS agree), `.app-hover` (120ms tint), `.app-wait` (hidden for the first
      second), `.app-btn-busy`, reduced-motion rules. EVERY dialog (legacy too) now enters in 250ms with the enter easing (was 220ms, another curve). Not built: the 0.5 s minimum
      visible time of a spinner (needs state); constants exist.
    - **Dialogs (R8).** `Modal` gains sizes `s` 400, `m` 560, `l` 720 as OPT-IN (legacy `sm..2xl` untouched). A Hills size with `onSubmit` fills the phone screen with a sticky
      footer and safe-area padding; without input it stays a bottom sheet. Pages are converted in their batch (45 files). NOT done (needs logic, owner decision pending):
      "backdrop click closes unless there are unsaved changes" (R8.4) and destructive confirms should use the danger button (`MODAL_BTN_DANGER` exists, batches use it).
    - **`Button`** (`ui/button.tsx`, used in only 2 files): variants `brand` and `danger`, 44px high on phones (`max-md:h-11`), quiet `destructive` text now `text-tone-coral`
      (was 4.19 on its tint), opt-in `loading` (aria-busy, no clicks, sweep; caller changes the label).
    - **Story** `src/stories/HillsAppFoundations.stories.tsx`: Tones, Status, Badges, Buttons, Tabs, Pager (each Light and Dark) and Dialog s/m/l. LESSON: the app puts `.dark` on
      `<html>` and Tailwind colour utilities (`bg-muted`, `text-status-*`) resolve at `:root`; a nested `.dark` wrapper in a story shows LIGHT values. Stories set the class on
      `<html>`. My first side-by-side panels were wrong because of this and were rebuilt.
    - **Seen, not changed (for the batches):** dark-mode ACTIVE PILL tab shows a white label on light blue (looks about 2.7:1; not measured); dialog titles in dark use the light
      blue `brand-navy` token; dark input borders are very faint; the existing Storybook stories (DataTable etc.) render unstyled because the preview loads no stylesheet
      (pre-existing).
    - **NOT tested here:** no signed-in page was rendered. The 8a harness (`session.mjs`, `fixtures.mjs`, `cap8.mjs`, `measure8.mjs`, `analyze8.py`) is in the 8a review pack, not in the
      repo or the zip. The pilot pages (Exams, Students, Finances) were therefore NOT re-captured after the global token changes. Do this first in 8d or with the owner's pack.
    - **Missing from the zip received for this phase:** `apps/web/tools/hills/ai-tells/` (23 detectors, baseline 235 hits in 89 files), `docs/hills/research/A..G`, the git history,
      and node_modules. The RULEBOOK section 4 lists the detector rules, so ai-tells can be rebuilt; ask the owner for the originals first. `main` here = the delivered 8a state;
      `hills/phase-8-plan` = main + the two docs. Run the gate against the real history on the real repo.

## 5. Environment gotchas (this sandbox)
- Prisma engine download is blocked: no Prisma client, no database. Do not retry or work around. tsc errors from missing
  Prisma types are environmental; filter tsc output to the changed files. Signed-in pages CAN be rendered since Phase 8a with a
  fake session plus mocked API (see item 15 and `tools-capture/session.mjs`, `fixtures.mjs`).
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
- The zip received for Phase 5 again had NO git history: `main` = delivered 4b state (one reconstructed commit);
  `hills/phase-4b-home-polish` and `hills/phase-5-apply` branch from it. `hills:logic-diff --base main` therefore proves only
  Phase 5 here. Run it against `hills/phase-4b-home-polish` AND the original baseline on the real repo.
- Capture scripts for Phase 6a: `pages.mjs`, `cap.sh`, `multi.sh`, `measure6.mjs`, `mrun.sh` in the pack (`tools-capture/`); mock `/public/maneb-stats` with a `stats` array
  (academics crashes on a mock without it).
- Capture scripts for Phase 7: `pages7.mjs`, `cap7.sh`, `measure7.mjs`, `mcap7.sh`, `analyze7.py` in the pack (`tools-capture/`); the states list is in `pages7.mjs`.
- Capture scripts for Phase 5 live in the review pack (`tools-capture/`: `run.sh`, `walk.mjs`, `measure.mjs`, `measure.py`);
  the Playwright import must go through `createRequire` (global install, ESM import fails).
- `.env` and `service-account.json` are in the zip: never print or commit them.
- Install: `pnpm install --ignore-scripts --frozen-lockfile` works (registry allowed; Prisma engine download is the thing that is blocked).
- Storybook for screenshots: `npx storybook build -o <dir> --quiet`, then in ONE wrapper script serve it (`python3 -m http.server`) and screenshot
  `iframe.html?id=<story-id>&viewMode=story` with Playwright (import through `createRequire`).
- Never use an UNQUOTED heredoc (`<<EOF`) for text that contains backticks: the shell runs them. Use `<<'EOF'`.
- Gate helper: `pnpm hills:logic-diff --base <branch> --json <file>` writes the unexplained tokens as JSON; generate allowlist entries from it and write the reasons yourself.
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
- Phase 3 left the interim pages on their old field styling inside the new card; Phase 7 redid them.
- Phase 4b open question for the user: the 5iveStack Labs website address (see `lib/hills/studio.ts`).
- Phase 9 (cleanup) is optional and last.
