import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/site'

// Static text generated at build time from the site constants.
export const dynamic = 'force-static'

/**
 * /llms.txt: a plain-markdown map of the site for language-model crawlers,
 * following the llmstxt.org format (H1 name, blockquote summary, then
 * sections of annotated links). Only public pages are listed. The portal is
 * behind a login and is deliberately left out.
 */
export function GET() {
  const body = `# ${SITE_NAME}

> ${SITE_DESCRIPTION}

The public website covers admissions, examination results, news and events. Student and staff tools (grades, fees, timetables, library) live in a login-protected portal that is not part of this index.

## Admissions
- [Admissions](${SITE_URL}/admissions): How to apply, entry requirements, fees and scholarships
- [Apply online](${SITE_URL}/apply): The online application form for new students

## School
- [Academics](${SITE_URL}/academics): Curriculum, MANEB standards and facilities
- [Student life](${SITE_URL}/student-life): Clubs, sport, wellness and boarding
- [Leadership](${SITE_URL}/leadership): Head teacher and leadership team
- [University placement results](${SITE_URL}/placement-results): Confirmed placements of MSCE leavers by year
- [Photo gallery](${SITE_URL}/gallery): Photos from school life and events

## Latest updates
- [News](${SITE_URL}/news): News articles from the school
- [Announcements](${SITE_URL}/notices): General notices from the school office
- [Events](${SITE_URL}/events): Upcoming events with dates and venues
- [Academic advertisements](${SITE_URL}/academic-advertisements): Intake notices and examination circulars

## Policies
- [Privacy policy](${SITE_URL}/privacy): How personal data is collected, used and protected
- [Terms of use](${SITE_URL}/terms): Terms for using the website and portal

## Optional
- [Sitemap](${SITE_URL}/sitemap.xml): Every public URL, including individual news items and events
`

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=86400',
    },
  })
}
