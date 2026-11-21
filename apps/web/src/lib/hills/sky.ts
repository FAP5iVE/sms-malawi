/**
 * apps/web/src/lib/hills/sky.ts
 *
 * [CHANGE TYPE]: NEW FILE (Chikangawa Hills theme, Phase 1)
 * [PURPOSE]: Decides which of the four Hills skies (dawn, day, dusk, night)
 *   the public site shows, and provides the tiny inline script that applies it
 *   before first paint so there is no flash of the wrong sky.
 *
 * [RULES]  (from the locked decisions in the plan)
 *   - Theme "Light"  always shows the day sky.
 *   - Theme "Dark"   always shows the night sky.
 *   - Theme "Auto"   (stored value "system") follows the Malawi clock:
 *       05:00 to 07:59 dawn, 08:00 to 15:59 day, 16:00 to 18:59 dusk,
 *       19:00 to 04:59 night.
 *   - The result is written to <html data-sky="...">. Only elements inside a
 *     `.hills` scope read the sky palette.
 *   - Phase 10a: the light or dark MODE (the `dark` class on <html>) comes from
 *     the same sky: night is dark, dawn, day and dusk are light. Auto therefore
 *     moves the whole app, public and signed in, with the clock, and no longer
 *     follows the device's own colour setting. Light and Dark never move.
 *
 * [CLOCK]: Malawi is on Central Africa Time, UTC+2 all year with no daylight
 *   saving, so the hour is simply the UTC hour plus two. That avoids Intl in
 *   the pre-paint script and gives the same answer on every device regardless
 *   of the visitor's own time zone.
 *
 * [KEEP IN SYNC]: HILLS_SKY_SCRIPT repeats resolveSky() by hand because it must
 *   run as plain text before any bundle loads. tools/hills/__tests__/sky.test.mts
 *   executes the script for every hour and every theme value and compares it
 *   with resolveSky(), so the two cannot drift apart unnoticed.
 */

export type HillsSky = 'dawn' | 'day' | 'dusk' | 'night'

/** Same key ThemeProvider passes to next-themes. */
export const HILLS_THEME_STORAGE_KEY = 'sms-malawi-theme'

/** Africa/Blantyre is UTC+2 with no daylight saving time. */
const MALAWI_UTC_OFFSET_HOURS = 2

export function malawiHour(now: Date): number {
  return (now.getUTCHours() + MALAWI_UTC_OFFSET_HOURS) % 24
}

export function skyForHour(hour: number): HillsSky {
  if (hour >= 5 && hour < 8) return 'dawn'
  if (hour >= 8 && hour < 16) return 'day'
  if (hour >= 16 && hour < 19) return 'dusk'
  return 'night'
}

/**
 * @param theme the next-themes setting: 'light' | 'dark' | 'system'. Anything
 *   else (undefined before mount, an unknown stored value) behaves as Auto.
 */
export function resolveSky(theme: string | null | undefined, now: Date): HillsSky {
  if (theme === 'light') return 'day'
  if (theme === 'dark') return 'night'
  return skyForHour(malawiHour(now))
}

/**
 * Runs synchronously while the HTML is parsed. Reads the stored theme itself
 * (next-themes has not hydrated yet) and sets data-sky on <html>. Every step is
 * guarded: if storage is blocked the sky simply follows the clock.
 */
/** Light or dark colours for a sky. Only the night sky is dark. */
export type HillsMode = 'light' | 'dark'

export function modeForSky(sky: HillsSky): HillsMode {
  return sky === 'night' ? 'dark' : 'light'
}

/** The colour mode for a stored theme value at a given moment. */
export function resolveMode(theme: string | null | undefined, now: Date): HillsMode {
  return modeForSky(resolveSky(theme, now))
}

/** The three choices a person can make. "system" is shown as Auto. */
export type ThemeChoice = 'light' | 'dark' | 'system'

export function normalizeChoice(value: string | null | undefined): ThemeChoice {
  return value === 'light' || value === 'dark' ? value : 'system'
}

export const HILLS_SKY_SCRIPT = `(function(){try{var t=null;try{t=localStorage.getItem(${JSON.stringify(
  HILLS_THEME_STORAGE_KEY,
)})}catch(e){}var s;if(t==='light')s='day';else if(t==='dark')s='night';else{var h=(new Date().getUTCHours()+${MALAWI_UTC_OFFSET_HOURS})%24;s=h>=5&&h<8?'dawn':h>=8&&h<16?'day':h>=16&&h<19?'dusk':'night'}var r=document.documentElement;r.setAttribute('data-sky',s);var d=s==='night';if(d)r.classList.add('dark');else r.classList.remove('dark');r.style.colorScheme=d?'dark':'light'}catch(e){}})();`
