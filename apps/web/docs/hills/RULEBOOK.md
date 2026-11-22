# Hills rulebook for the signed-in area (Phase 8b to 9)

Written 15 Nov 2026 after the 8a pilot was approved. This is the single list of rules every later change is checked against.
Research files with the full source logs are in `docs/hills/research/` (A to G). Each rule says where it comes from:

- **[read]** the source page was opened and read in this project.
- **[ours]** a decision for this school app, built on read sources or on the owner's brief. Not a published standard.
- **[unverified]** from memory or not opened. Do not quote it as a standard. It needs a check before it becomes a hard gate.

Hard limit for everything here: **looks only**. No handler, request, route, data shape, permission or timing changes. Where a rule seems to
need one, it is listed in section 12 and waits for the owner.

## 1. One look (already decided by the pilot)
- R1.1 One surface per page: border 1px, radius 14px, padding 20px (24px from 1024px), edge to edge under 768px. [ours, 8a]
- R1.2 Inside a surface nothing else has a border: tint tiles (`.app-tint`), dividers, plain text. Tappable cards and list rows are tint tiles too (hover `hover:bg-brand-teal/10`); a selected one gets `ring-2 ring-brand-teal`, not a border. Only controls (inputs, selects, chips, buttons) keep borders. [ours, 8a; owner decision 17 Nov 2026]
- R1.3 Page title and tabs sit on the sky above the surface; idle tab text uses `.app-sky-idle`. [ours, 8a, measured]
- R1.4 Gutters 16 / 24 / 32px. [ours, 8a]

## 2. Status and role words (no pills)
- R2.1 A status or role word (Primary, Pays fees, Emergency contact, Active, Cleared, Outstanding, Pending) is **coloured text with a small leading dot or icon**. It is never inside a filled or outlined pill. [ours, owner's brief; supported by Red Hat tag guidance: tags are for attention and search, counts go in badges, choices in chips [read]]
- R2.2 A filled shape is allowed only for: a count badge, a selectable filter chip, a warning that must be seen at once (e.g. "Overdue" on a payment row that blocks something). [ours]
- R2.3 Five meanings only: success, warning, danger, info, neutral. One component (`StatusText`) renders them, so the dot, the weight and the spacing are the same everywhere. [ours]
- R2.4 Colour is never the only signal: the word is always present, and danger/warning also carry an icon or the word itself. [read: WCAG 1.4.1 via Analysis Function and Eleken]
- R2.5 Text length at most 25 characters. Red and red-orange are for failure or error only. [read: Red Hat]
- R2.6 Scope of the sweep: about 14 `rounded-full ... px-2/px-3` sites and about 25 to 32 pill-like spans found by the audit, including the five in `GuardianLinkCard.tsx`. Every one is converted as its page is reached; a final grep in Phase 9 proves none are left.
- R2.7 A selectable filter chip is a CONTROL: it keeps a border but uses the button radius (`rounded-xl`), never a full pill, so it cannot be mistaken for a status pill. Selected = filled brand pair (`bg-btn-brand text-btn-brand-fg`), not selected = outline. 44px tall. One source: `src/lib/hills/chip.ts` (`CHIP`, `CHIP_ON`, `CHIP_OFF`, `chipClass`). Decided 16 Nov 2026 (owner asked for a debate on the 8b-1 open question). Other chip sites (HR, library, monitoring alerts) switch to it as their pages are reached. The calendar category bar, the event form's category picker and the phone filter sheet use it since 8e. [ours]

## 3. Colour of text (fix of the old failures)
- R3.1 Text is 4.5:1 on its real background (3:1 only for 18px+ or bold 14px+). [read: WCAG, GSS palette page]
- R3.2 The failures measured in 8a are fixed by adding **text-use tones** for success, warning, danger, info and teal links, darker than the fill tones. The light tones stay for icons, bars and fills. Measured before: green 4.38, teal link 4.38, coral 4.19, amber 3.19, white on teal button in dark mode 1.91. [ours]
- R3.3 Exact values are chosen in 8b-0 by the contrast checker, not by eye. Every new pair is added to `check-contrast.mts`. [ours]
- R3.4 Dark mode: filled primary buttons use a fill that gives 4.5:1 with their label, not the light teal. [ours; fixes the 1.91 failure]
- R3.5 Chart colours: no more than 4 series; neighbours 3:1; axes #595959 or darker; gridlines light grey (#D9D9D9 passes); GSS categorical order #12436D, #28A197, #801650, #F46A25. Our navy and teal lead the order. [read: GSS colours page]

## 4. Words in the interface
Detector: `apps/web/tools/hills/ai-tells/tells.json` (23 rules) and `scan_tells.py`. Baseline on 15 Nov 2026: **235 hits in 89 files**
(em dash 119, internal words 42, abbreviations 35, "Manage/View your X" 15, "at a glance" 12, exclamation marks 6, "Coming soon" 2).
The scan is line based. It misses multi-line strings, so it is a ratchet, and a human reads every page.
- R4.1 If a line only repeats the heading, delete it. [read: Apple HIG writing]
- R4.2 Buttons: verb + object, one label per action everywhere. Not "Submit", "OK", "Yes". Permanent actions name the result ("Delete class"). [read: Apollo, Apple]
- R4.3 Confirmation: headline = the consequence ("Delete this class?"), main button repeats it, the other says "Keep class", the body says what is lost. [read: Apollo]
- R4.4 Errors say what happened and what to do, next to the field. No "Oops", no "we". [read: Apple, Apollo]
- R4.5 Empty states always have a next action, with different words for first use, no results and filtered-empty. [read: Apple, Apollo]
- R4.6 Sentence case. No exclamation marks except real celebration. Sentences about 25 words or fewer. No "Click" on touch screens. [read: Apollo, Apple]
- R4.7 Plain words for readers with English as a second language: no idioms, no "e.g./i.e./etc.", no slashes, "not" in full. Words to avoid: delve, seamless, robust, comprehensive, streamline, empower, leverage, insights, at a glance, all in one place, stay on top of, hub, portal. [read: Home Office Digital, Civil Service; the UI list is ours]
- R4.8 School words: Fees, Marks, Term, Form, Guardian, Report card. Money as "MK 18,450,000". Never show raw enum values (PENDING_APPROVAL) or internal words (payload, entity, workspace, module, record id). [ours]
- R4.9 Em dashes are removed from visible text unless a real range or pause needs one. [ours, from Wikipedia "Signs of AI writing" [read]]
- R4.10 One sign is not proof. Density matters. Every rewritten line is read aloud once by a person. [read: Wikipedia guide]

### Greeting and role line (dashboard)
- R4.11 Greeting = time-of-day + first name. Under it, the one role, term and date line (R4.12). AMENDED in 8e: no facts line (count, deadline). It would need every role dashboard to hand a number up to the page, which is a data change, and a number that is wrong or stale breaks R6.3; the attention card already holds the live counts. No slogan. [ours; Setproduct "one lead question" [read]]
- R4.12 The line after the role title shows role, term and date, for example "Administrator · Term 1 2026 · Sunday 15 November". It replaces "School at a glance". [ours, proposal for the owner to approve]
- Examples (proposal): "Good morning, Grace" / "3 fee payments to confirm. 2 leave requests are waiting." Nothing waiting: "Good morning, Grace" and no second line.

## 5. Navigation and header
- R5.1 Phone bottom bar: 4 visible destinations plus "More" = 5 slots. Icon and label always shown, one word, 12px minimum. The bar is fixed per role and never hides or disables a destination. [read: Apple HIG tab bars, Android layout and nav, NN/g hidden navigation (hidden nav lowers discoverability by over 20 percent, desktop tasks 39 percent slower, mobile 15 percent slower)]
- R5.2 Bar content height 64px minimum plus the safe-area inset, flat solid surface, 1px top divider, no shadow. Active item = icon in the active colour + label + the light tint pill. Tap target 44px minimum. [ours, built on Material 3 numbers [read]]
- R5.3 The drawer behind "More" holds everything else. Desktop and tablet (768px and up) use the sidebar; there is no bottom bar there. [read: Material compact/medium/large]
- R5.4 Header, left to right: menu control, crest, school name (one link to home), then page context (term). Right: search, notifications, theme, user. Phones keep crest, search, bell, avatar only. System utilities are right aligned and open panels. DOM order equals visual order. [read: Carbon global header]
- R5.5 Tabs on one page: at most 5 visible on desktop, 6 or 7 only with one-word labels. One row only. Left aligned. Selected tab has two signals (bold or dark text + 2px underline). A tab never opens a new page. One badge per label, 4 characters at most. Phones: a scrolling strip with a partly visible next tab, or a select when there are more than 5. [read: NN/g tabs, Galaxus, Eleken; Material says 4, Apple says 6]
- R5.6 Page tabs are not mixed with navigation tabs. Tabs that load slow data activate on selection with a visible loading state. [read: NN/g, W3C APG]
- R5.7 Audit: 24 `ModuleTabs` usages in 12 pages. Finance has 7 groups and a second tab row; it is regrouped to one row in the Finances batch. [ours]

## 6. Attention badges
- R6.1 A section that has items needing attention shows a badge on its sidebar item, bottom-bar item and tab. [owner's brief]
- R6.2 A number only when the number changes what the user does next (unpaid, waiting for approval, unread). Otherwise a dot. Do not mix dots and numbers on one bar. "99+" everywhere. [read: Eleken]
- R6.3 Never show a count that can be wrong or stale. If the page does not already load the number, show no badge and put the item on the open-questions list. A wrong badge is worse than none. [read: Eleken]
- R6.4 A fourth badge on one screen means stop and reconsider. [read: Eleken]
- R6.5 Badges have text at 4.5:1, are never focusable, read as "5 waiting for approval", and a dot has an aria-label on its parent. [read: Eleken]
- R6.6 Today only `Sidebar`, `MobileBottomNav`, `PageHeader`, `ModuleTabs`, placements and announcements use counts. Phase 8b-0 builds one `AttentionBadge` and one map of which module may show which existing count.

## 7. Lists and paging (no endless scrolling)
- R7.1 Desktop tables: 25 rows by default, selector 10 / 25 / 50, choice remembered in the browser. [read: Elastic EUI]
- R7.2 Phones: 20 rows then "Show 20 more". Not infinite scroll. [read: Baymard 15 to 30 on mobile; "Load more" tested well] [ours: 20]
- R7.3 Dashboard cards: top 5 and a "View all" link. [ours; Baymard warns that too few per page forces extra pages [read]]
- R7.4 Paging is done on data the page already loaded (client side). Lists that are already paged by the server stay as they are. No new query, no changed limit. [ours; protects the logic]
- R7.5 Filters show as removable chips with "Clear all"; the count of results is shown. [read: Setproduct]
- R7.6 Audit: 55 `.slice(0, N)` sites and 14 files with paging today. Each list is tagged keep, page or show-more in its page's notes.

## 8. Popups and buttons
- R8.1 A dialog is for a short task in one context. Anything with several contexts or side navigation is a page. Side sheets are not used for create or edit forms. [read: GitHub Primer]
- R8.2 Sizes: small 400px, medium 560px, large 720px; under 640px a dialog with any input is full screen with a sticky footer; a confirmation without input may be a bottom sheet; centred dialogs keep 16px from the edge. [Primer rule read; the three widths are ours and unverified]
- R8.3 Structure: required title, visible close button, body scrolls with a divider above the footer, footer inside the safe area, **primary action on the right**, the cancel action on its left. [read: Primer]
- R8.4 Backdrop click closes unless the form has unsaved changes. At most two nested. Escape closes the top one only. Focus returns to the trigger. [read: Primer]
- R8.5 Touch targets: 44px minimum height on phones for primary controls, 36 to 40px on desktop, never under 24px. [read: WCAG 2.2 target size]
- R8.6 Buttons: one primary per view area; destructive style only on the confirm of a destructive action. Icon buttons have an accessible name. [ours]
- R8.7 Audit: 45 files with dialogs. Each is checked against R8.2 to R8.4 in its batch.

## 9. Motion and waiting
- R9.1 Hover and press: 100 to 150ms. Dialog in 250ms, out 200ms. Page level 400ms at most. [read: Atlassian, Material]
- R9.2 Easing: entering cubic-bezier(0, 0, 0.2, 1); leaving cubic-bezier(0.4, 0, 1, 1); other changes cubic-bezier(0.4, 0, 0.2, 1). [read: Material 1]
- R9.3 Animate colour, opacity and transform only. Never width, height, top, left. [read: Atlassian]
- R9.4 `prefers-reduced-motion: reduce` = no transforms; colour and opacity change only. [ours; source not read]
- R9.5 One hover standard, four cases, 120ms, pointer devices only (a touch screen never keeps a hover after a tap). (a) Anything with a box (row, card, menu item, quiet button): a background tint (`hover:bg-page`, `.app-hover`). (b) Words that act but have no box ("Edit", "Open reports", "Remove"): `.app-action`, a soft pill of the word's own colour drawn with a shadow, so nothing moves; keyboard focus shows the same pill. (c) A link inside a sentence is underlined at rest and 2px thick on hover (base layer; also `.prose`). (d) Filled buttons use their hover colour token (`bg-btn-*-hover`) or `hover:brightness-110`. Never lift, scale, glow, or an underline that exists only on hover, because touch and keyboard users never see it and WCAG 1.4.1 wants links told apart by more than colour. The cursor is a pointer on anything pressable (base layer). Public-page links (`.hills-link`, `.hills-back`, `.hills-page__back`, toc, credit) use the same pill. [ours; read: WCAG 1.4.1, GOV.UK link states, Material state layers, Atlassian; owner decision 21 Nov 2026]
- R9.6 Waiting: under 1 second show nothing. Spinner delayed 1 second for 2 to 10 second waits and visible at least 0.5s. Skeleton only for familiar shapes up to 3 seconds and it must match the real layout. Progress bar over 10 seconds, with counts in user units. [read: NN/g via UX Tigers]
- R9.7 Buttons that act: on press, disable, keep width, change the label ("Saving…"), then show the result inline or in a toast. A failed action says what to do. [ours, built on R9.6]

## 10. Charts, tiles and reports
- R10.1 Every chart has a headline title (the finding), a subtitle (what, where, when) and a source line with the date range. [read: Analysis Function]
- R10.2 Type by question: change over time = line (few points = columns); comparing or ranking = bars; part of a whole = stacked bar, or pie only with a dominant slice and 5 categories at most. [read: Analysis Function, Datawrapper]
- R10.3 Bars start at zero. No dual axis, no 3D, no shadows. Lines 4 at most. Direct labels, legend only if needed. On phones prefer horizontal bars. [read]
- R10.4 Every chart has a text alternative or data table directly under it (collapsible). [read: Analysis Function checklist]
- R10.5 KPI tile: label (12px, no abbreviations), value (largest), change with symbol and colour, comparison ("vs last term"). 4 tiles per page, never more than 6. Value size: `text-xl` by default; `sm:text-2xl` only in a strip of 4 or fewer wide tiles (module-page stat tiles stay `text-xl`). [read: NHSBSA, Setproduct; owner decision 17 Nov 2026]
- R10.6 Numbers: exact under 1,000, then 1.2K style in tiles only; money without cents in summaries ("MK 18,450,000"). "Last updated" time on dashboards and reports. [read: Setproduct]
- R10.7 Audit: 23 BarChart, 6 ComposedChart, 4 AreaChart, 2 LineChart, 2 PieChart usages. Each is checked against R10.2 to R10.4. The two pies are checked against the pie rule.
- R10.8 Report cards (HTML view): the same surface, tint tiles for marks, school crest and name at the top, term and form, marks table, remarks, signatures. Grading logic is untouched. [ours]

## 10b. Calendar
- R10b.1 Same data, same actions, restyled to the surface and tint tiles. Visible previous, next and Today buttons that work by touch, keyboard and mouse. Day states: default, today, selected, outside month. Each state differs by shape or text, not by colour alone: selected = ring or filled brand pair, today = ring and teal number, outside month = muted number and no tint tile. Event category is always named in words next to its colour. [read: SAP Fiori]
- R10b.2 Phones: month grid on top, the selected day's events listed below. [read: Mantine]
- R10b.3 The current week start stays as it is unless the owner asks to change it (Monday is a suggestion only, not verified as a Malawi source). [ours]

## 11. Documents and emails (both are frozen server code, see section 12)
- R11.1 Email: 600px single column, nested tables, inline CSS, `role="presentation"`, body 16px, line height 1.5, buttons at least 44px high and 200px wide, full width on phones, HTML under 100KB (Gmail clips at 102KB). [read: Tabular, WooCommerce]
- R11.2 Logo: a hosted PNG on a stable https URL of the app, displayed at 56px crest (2x source), with `alt="Chikangawa Hills Academy"`, on a solid navy band, and the school name as live text next to it so the email still makes sense with images blocked. Not base64 (Outlook blocks it), not CID. [read: Mailtrap]
- R11.3 Dark mode: `color-scheme` and `supported-color-schemes` meta tags; solid navy band stays navy; body colours chosen so both a normal and a partly inverted client read. [read: Litmus]
- R11.4 Subject about 50 characters, key fact first, no sender name repeated, absolute dates, expiry time on links. Plain-text part mirrors the HTML fields. From name is the school, never "noreply". [read: Postmark]
- R11.5 Fee receipt order: one-sentence summary ("MK 120,000 received for Term 1 fees for Chimwemwe Banda"), items, payer, balance, how to report a problem, school contact, thanks. Content stays what the templates send today; only order, wording and layout change. [read: Postmark receipts]
- R11.6 Templates in scope (10 plus the shared `base.ts` shell): announcement, application-received, contract-alert, fee-reminder, leave-update, newsletter-confirm, overdue-library, password-reset, placement-update, result-release, and the `base.ts` shell.
- R11.7 PDFs and exports share the existing `pdfBranding.ts` kit (letterhead with logo, stamp, signatory). Improve inside that kit so every document (report cards, receipts, report exports, exam documents) gets the same letterhead, reference line, "Page x of y" and footer. [ours; A4 numbers not researched]
- R11.8 CSV and Excel exports: same column titles as the screen, plain headers, no formulas in text cells. [ours; unverified source]

## 12. Owner decisions (answered 15 Nov 2026, 06:05)
All seven items from the first draft are decided. This is the record; do not ask again.
1. **Emails (R11) and export documents (R11.7, R11.8): YES.** A scoped `approvedFrozen` exception for presentation only is approved. Data, timing, recipients, routes and permissions stay unchanged. Add each touched server file to `logic-allowlist.json` `approvedFrozen` with a reason, like 7b, and keep the gate clean.
2. **Attention badges (R6) that need a count the page does not load: owner left it to Claude.** Decision: no badge and no new query. The sections affected are listed in each batch's notes for a later, separate logic decision.
3. **Server side paging (R7.4): NO.** Client side only, on data already loaded. Lists the server already pages stay as they are.
4. **Header, sidebar, bottom bar (R5): YES.** Layout and grouping change; no link target changes.
5. **Colour text tones (R3): YES.** Change and fix.
6. **Greeting and role line wording (R4.11, R4.12): YES.** The proposed wording is approved. Keep the facts line to data the page already loads.
7. **Export "ready" notice and undo-instead-of-confirm (ideas 14 and 20): NOT planned**, confirmed.

### Added after the 8b-0 review (answered 15 Nov 2026, 16:16)
8. **Muted text and warning colour a little darker, app wide: YES.** Both were failing contrast.
9. **Fix the three public home page buttons that used white on teal ("Login Portal", "Menu", "All about us"): YES,** as long as logic and workflow stay exactly as before. Done as a class-only swap to the brand button pair (5.52:1 light, 10.06:1 dark). No href, handler or text changed.
10. **Unsaved-changes warning on form dialogs (R8.4): YES.** Logic exception, recorded in `logic-allowlist.json`. Rule in `src/lib/hills/unsaved.ts`. Only Hills form dialogs (size s/m/l with onSubmit) that have been typed in ask "Keep editing" or "Discard changes" before an outside click, the X or Escape closes them. Untouched dialogs, old sizes, the footer's own Cancel/Save and all caller callbacks are unchanged.

### Decided after 8d (owner delegated the call, 16 Nov 2026)
11. **Crest and school name stay in the sidebar's top row.** On desktop the sidebar's top row and the header are one 64px band, so the sidebar's top-left IS the left end of the header (crest, school name, one link to home, collapse control). Moving them into the header would float the brand mid-screen, leave a hole at the top-left and drop the crest in the icon rail. R5.4 is read this way: on desktop and tablet the band is sidebar row + header; on phones the header itself carries the crest.
12. **Phone header avatar: DONE.** It opens the same More sheet as the bar's last slot, through one shared open flag (`lib/hills/moreSheet.ts`, tested). Logic change declared in the allowlist. The phone header is now crest, page title, search, bell, avatar.
13. **Period switcher leaves the phone header and becomes a "Viewing period" row at the top of the More sheet.** The strip under the header (`PeriodBanner`) still shows on every page whenever the viewing period is not the live one, with its "Return to ..." link, so nobody saves into the wrong term unseen. The page title no longer truncates.
14. **Greeting facts line: NO (decided in 8e; owner said "debate over it and make the best call").** For: a count or deadline under the greeting is the kind of fact that makes a dashboard feel alive. Against: (a) the greeting lives in the dashboard page, but every number sits inside one of nine role dashboards, so each would have to hand a value up, which is a data and logic change in a looks-only project; (b) the line would be empty for some roles, so it would appear and vanish between roles; (c) a count that is wrong or stale breaks R6.3, and the attention card just below already shows the live counts with the same data; (d) it would repeat the card. Decision: keep only the role, term and date line (R4.12). R4.11 amended. If the owner still wants it, the cheaper way is to move the attention card to the top of each dashboard, which is a layout change only.
