/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: packages/shared/constants/countries.ts
 * [R-PHASE]: R16 — Constants Centralization (Phase 10B Plan)
 * [PURPOSE]: The single country reference list, replacing apply/page.tsx's
 *   24-entry inline COUNTRIES array and StudentFormSections.tsx's 13-entry
 *   subset (a strict subset — this is a UX completeness upgrade as well as a
 *   refactor). ISO 3166-1 alpha-2 code, English short name, and E.164 calling
 *   code. getCountriesForForm() pins Malawi first, then alphabetical, for
 *   nationality selectors; COUNTRY_CALLING_CODES is derived at module load so
 *   the phone-code picker never maintains a second hand-written list.
 * [DEPENDS ON]: none
 */

export interface Country {
  /** ISO 3166-1 alpha-2 code. */
  code: string
  /** English short name (the value stored for a student's nationality). */
  name: string
  /** E.164 international calling code, e.g. '+265'. */
  callingCode?: string
}

export const DEFAULT_COUNTRY_CODE = 'MW' as const

// Alphabetical by name. Malawi is pinned first only for form display via
// getCountriesForForm(); the raw COUNTRIES list stays purely alphabetical.
export const COUNTRIES: Country[] = [
  { code: 'AF', name: "Afghanistan", callingCode: '+93' },
  { code: 'AL', name: "Albania", callingCode: '+355' },
  { code: 'DZ', name: "Algeria", callingCode: '+213' },
  { code: 'AD', name: "Andorra", callingCode: '+376' },
  { code: 'AO', name: "Angola", callingCode: '+244' },
  { code: 'AG', name: "Antigua and Barbuda", callingCode: '+1' },
  { code: 'AR', name: "Argentina", callingCode: '+54' },
  { code: 'AM', name: "Armenia", callingCode: '+374' },
  { code: 'AU', name: "Australia", callingCode: '+61' },
  { code: 'AT', name: "Austria", callingCode: '+43' },
  { code: 'AZ', name: "Azerbaijan", callingCode: '+994' },
  { code: 'BS', name: "Bahamas", callingCode: '+1' },
  { code: 'BH', name: "Bahrain", callingCode: '+973' },
  { code: 'BD', name: "Bangladesh", callingCode: '+880' },
  { code: 'BB', name: "Barbados", callingCode: '+1' },
  { code: 'BY', name: "Belarus", callingCode: '+375' },
  { code: 'BE', name: "Belgium", callingCode: '+32' },
  { code: 'BZ', name: "Belize", callingCode: '+501' },
  { code: 'BJ', name: "Benin", callingCode: '+229' },
  { code: 'BT', name: "Bhutan", callingCode: '+975' },
  { code: 'BO', name: "Bolivia", callingCode: '+591' },
  { code: 'BA', name: "Bosnia and Herzegovina", callingCode: '+387' },
  { code: 'BW', name: "Botswana", callingCode: '+267' },
  { code: 'BR', name: "Brazil", callingCode: '+55' },
  { code: 'BN', name: "Brunei", callingCode: '+673' },
  { code: 'BG', name: "Bulgaria", callingCode: '+359' },
  { code: 'BF', name: "Burkina Faso", callingCode: '+226' },
  { code: 'BI', name: "Burundi", callingCode: '+257' },
  { code: 'CV', name: "Cabo Verde", callingCode: '+238' },
  { code: 'KH', name: "Cambodia", callingCode: '+855' },
  { code: 'CM', name: "Cameroon", callingCode: '+237' },
  { code: 'CA', name: "Canada", callingCode: '+1' },
  { code: 'CF', name: "Central African Republic", callingCode: '+236' },
  { code: 'TD', name: "Chad", callingCode: '+235' },
  { code: 'CL', name: "Chile", callingCode: '+56' },
  { code: 'CN', name: "China", callingCode: '+86' },
  { code: 'CO', name: "Colombia", callingCode: '+57' },
  { code: 'KM', name: "Comoros", callingCode: '+269' },
  { code: 'CD', name: "Congo (DRC)", callingCode: '+243' },
  { code: 'CG', name: "Congo (Republic)", callingCode: '+242' },
  { code: 'CR', name: "Costa Rica", callingCode: '+506' },
  { code: 'CI', name: "Côte d'Ivoire", callingCode: '+225' },
  { code: 'HR', name: "Croatia", callingCode: '+385' },
  { code: 'CU', name: "Cuba", callingCode: '+53' },
  { code: 'CY', name: "Cyprus", callingCode: '+357' },
  { code: 'CZ', name: "Czechia", callingCode: '+420' },
  { code: 'DK', name: "Denmark", callingCode: '+45' },
  { code: 'DJ', name: "Djibouti", callingCode: '+253' },
  { code: 'DM', name: "Dominica", callingCode: '+1' },
  { code: 'DO', name: "Dominican Republic", callingCode: '+1' },
  { code: 'EC', name: "Ecuador", callingCode: '+593' },
  { code: 'EG', name: "Egypt", callingCode: '+20' },
  { code: 'SV', name: "El Salvador", callingCode: '+503' },
  { code: 'GQ', name: "Equatorial Guinea", callingCode: '+240' },
  { code: 'ER', name: "Eritrea", callingCode: '+291' },
  { code: 'EE', name: "Estonia", callingCode: '+372' },
  { code: 'SZ', name: "Eswatini", callingCode: '+268' },
  { code: 'ET', name: "Ethiopia", callingCode: '+251' },
  { code: 'FJ', name: "Fiji", callingCode: '+679' },
  { code: 'FI', name: "Finland", callingCode: '+358' },
  { code: 'FR', name: "France", callingCode: '+33' },
  { code: 'GA', name: "Gabon", callingCode: '+241' },
  { code: 'GM', name: "Gambia", callingCode: '+220' },
  { code: 'GE', name: "Georgia", callingCode: '+995' },
  { code: 'DE', name: "Germany", callingCode: '+49' },
  { code: 'GH', name: "Ghana", callingCode: '+233' },
  { code: 'GR', name: "Greece", callingCode: '+30' },
  { code: 'GD', name: "Grenada", callingCode: '+1' },
  { code: 'GT', name: "Guatemala", callingCode: '+502' },
  { code: 'GN', name: "Guinea", callingCode: '+224' },
  { code: 'GW', name: "Guinea-Bissau", callingCode: '+245' },
  { code: 'GY', name: "Guyana", callingCode: '+592' },
  { code: 'HT', name: "Haiti", callingCode: '+509' },
  { code: 'HN', name: "Honduras", callingCode: '+504' },
  { code: 'HU', name: "Hungary", callingCode: '+36' },
  { code: 'IS', name: "Iceland", callingCode: '+354' },
  { code: 'IN', name: "India", callingCode: '+91' },
  { code: 'ID', name: "Indonesia", callingCode: '+62' },
  { code: 'IR', name: "Iran", callingCode: '+98' },
  { code: 'IQ', name: "Iraq", callingCode: '+964' },
  { code: 'IE', name: "Ireland", callingCode: '+353' },
  { code: 'IL', name: "Israel", callingCode: '+972' },
  { code: 'IT', name: "Italy", callingCode: '+39' },
  { code: 'JM', name: "Jamaica", callingCode: '+1' },
  { code: 'JP', name: "Japan", callingCode: '+81' },
  { code: 'JO', name: "Jordan", callingCode: '+962' },
  { code: 'KZ', name: "Kazakhstan", callingCode: '+7' },
  { code: 'KE', name: "Kenya", callingCode: '+254' },
  { code: 'KI', name: "Kiribati", callingCode: '+686' },
  { code: 'KW', name: "Kuwait", callingCode: '+965' },
  { code: 'KG', name: "Kyrgyzstan", callingCode: '+996' },
  { code: 'LA', name: "Laos", callingCode: '+856' },
  { code: 'LV', name: "Latvia", callingCode: '+371' },
  { code: 'LB', name: "Lebanon", callingCode: '+961' },
  { code: 'LS', name: "Lesotho", callingCode: '+266' },
  { code: 'LR', name: "Liberia", callingCode: '+231' },
  { code: 'LY', name: "Libya", callingCode: '+218' },
  { code: 'LI', name: "Liechtenstein", callingCode: '+423' },
  { code: 'LT', name: "Lithuania", callingCode: '+370' },
  { code: 'LU', name: "Luxembourg", callingCode: '+352' },
  { code: 'MG', name: "Madagascar", callingCode: '+261' },
  { code: 'MW', name: "Malawi", callingCode: '+265' },
  { code: 'MY', name: "Malaysia", callingCode: '+60' },
  { code: 'MV', name: "Maldives", callingCode: '+960' },
  { code: 'ML', name: "Mali", callingCode: '+223' },
  { code: 'MT', name: "Malta", callingCode: '+356' },
  { code: 'MH', name: "Marshall Islands", callingCode: '+692' },
  { code: 'MR', name: "Mauritania", callingCode: '+222' },
  { code: 'MU', name: "Mauritius", callingCode: '+230' },
  { code: 'MX', name: "Mexico", callingCode: '+52' },
  { code: 'FM', name: "Micronesia", callingCode: '+691' },
  { code: 'MD', name: "Moldova", callingCode: '+373' },
  { code: 'MC', name: "Monaco", callingCode: '+377' },
  { code: 'MN', name: "Mongolia", callingCode: '+976' },
  { code: 'ME', name: "Montenegro", callingCode: '+382' },
  { code: 'MA', name: "Morocco", callingCode: '+212' },
  { code: 'MZ', name: "Mozambique", callingCode: '+258' },
  { code: 'MM', name: "Myanmar", callingCode: '+95' },
  { code: 'NA', name: "Namibia", callingCode: '+264' },
  { code: 'NR', name: "Nauru", callingCode: '+674' },
  { code: 'NP', name: "Nepal", callingCode: '+977' },
  { code: 'NL', name: "Netherlands", callingCode: '+31' },
  { code: 'NZ', name: "New Zealand", callingCode: '+64' },
  { code: 'NI', name: "Nicaragua", callingCode: '+505' },
  { code: 'NE', name: "Niger", callingCode: '+227' },
  { code: 'NG', name: "Nigeria", callingCode: '+234' },
  { code: 'KP', name: "North Korea", callingCode: '+850' },
  { code: 'MK', name: "North Macedonia", callingCode: '+389' },
  { code: 'NO', name: "Norway", callingCode: '+47' },
  { code: 'OM', name: "Oman", callingCode: '+968' },
  { code: 'PK', name: "Pakistan", callingCode: '+92' },
  { code: 'PW', name: "Palau", callingCode: '+680' },
  { code: 'PS', name: "Palestine", callingCode: '+970' },
  { code: 'PA', name: "Panama", callingCode: '+507' },
  { code: 'PG', name: "Papua New Guinea", callingCode: '+675' },
  { code: 'PY', name: "Paraguay", callingCode: '+595' },
  { code: 'PE', name: "Peru", callingCode: '+51' },
  { code: 'PH', name: "Philippines", callingCode: '+63' },
  { code: 'PL', name: "Poland", callingCode: '+48' },
  { code: 'PT', name: "Portugal", callingCode: '+351' },
  { code: 'QA', name: "Qatar", callingCode: '+974' },
  { code: 'RO', name: "Romania", callingCode: '+40' },
  { code: 'RU', name: "Russia", callingCode: '+7' },
  { code: 'RW', name: "Rwanda", callingCode: '+250' },
  { code: 'KN', name: "Saint Kitts and Nevis", callingCode: '+1' },
  { code: 'LC', name: "Saint Lucia", callingCode: '+1' },
  { code: 'VC', name: "Saint Vincent and the Grenadines", callingCode: '+1' },
  { code: 'WS', name: "Samoa", callingCode: '+685' },
  { code: 'SM', name: "San Marino", callingCode: '+378' },
  { code: 'ST', name: "Sao Tome and Principe", callingCode: '+239' },
  { code: 'SA', name: "Saudi Arabia", callingCode: '+966' },
  { code: 'SN', name: "Senegal", callingCode: '+221' },
  { code: 'RS', name: "Serbia", callingCode: '+381' },
  { code: 'SC', name: "Seychelles", callingCode: '+248' },
  { code: 'SL', name: "Sierra Leone", callingCode: '+232' },
  { code: 'SG', name: "Singapore", callingCode: '+65' },
  { code: 'SK', name: "Slovakia", callingCode: '+421' },
  { code: 'SI', name: "Slovenia", callingCode: '+386' },
  { code: 'SB', name: "Solomon Islands", callingCode: '+677' },
  { code: 'SO', name: "Somalia", callingCode: '+252' },
  { code: 'ZA', name: "South Africa", callingCode: '+27' },
  { code: 'KR', name: "South Korea", callingCode: '+82' },
  { code: 'SS', name: "South Sudan", callingCode: '+211' },
  { code: 'ES', name: "Spain", callingCode: '+34' },
  { code: 'LK', name: "Sri Lanka", callingCode: '+94' },
  { code: 'SD', name: "Sudan", callingCode: '+249' },
  { code: 'SR', name: "Suriname", callingCode: '+597' },
  { code: 'SE', name: "Sweden", callingCode: '+46' },
  { code: 'CH', name: "Switzerland", callingCode: '+41' },
  { code: 'SY', name: "Syria", callingCode: '+963' },
  { code: 'TW', name: "Taiwan", callingCode: '+886' },
  { code: 'TJ', name: "Tajikistan", callingCode: '+992' },
  { code: 'TZ', name: "Tanzania", callingCode: '+255' },
  { code: 'TH', name: "Thailand", callingCode: '+66' },
  { code: 'TL', name: "Timor-Leste", callingCode: '+670' },
  { code: 'TG', name: "Togo", callingCode: '+228' },
  { code: 'TO', name: "Tonga", callingCode: '+676' },
  { code: 'TT', name: "Trinidad and Tobago", callingCode: '+1' },
  { code: 'TN', name: "Tunisia", callingCode: '+216' },
  { code: 'TR', name: "Türkiye", callingCode: '+90' },
  { code: 'TM', name: "Turkmenistan", callingCode: '+993' },
  { code: 'TV', name: "Tuvalu", callingCode: '+688' },
  { code: 'UG', name: "Uganda", callingCode: '+256' },
  { code: 'UA', name: "Ukraine", callingCode: '+380' },
  { code: 'AE', name: "United Arab Emirates", callingCode: '+971' },
  { code: 'GB', name: "United Kingdom", callingCode: '+44' },
  { code: 'US', name: "United States", callingCode: '+1' },
  { code: 'UY', name: "Uruguay", callingCode: '+598' },
  { code: 'UZ', name: "Uzbekistan", callingCode: '+998' },
  { code: 'VU', name: "Vanuatu", callingCode: '+678' },
  { code: 'VA', name: "Vatican City", callingCode: '+379' },
  { code: 'VE', name: "Venezuela", callingCode: '+58' },
  { code: 'VN', name: "Vietnam", callingCode: '+84' },
  { code: 'YE', name: "Yemen", callingCode: '+967' },
  { code: 'ZM', name: "Zambia", callingCode: '+260' },
  { code: 'ZW', name: "Zimbabwe", callingCode: '+263' },
]

/**
 * Returns the country list for a form selector with the default country
 * (Malawi) pinned to the top, followed by the remaining countries in
 * alphabetical order.
 */
export function getCountriesForForm(defaultCode: string = DEFAULT_COUNTRY_CODE): Country[] {
  const pinned = COUNTRIES.filter((c) => c.code === defaultCode)
  const rest = COUNTRIES.filter((c) => c.code !== defaultCode)
  return [...pinned, ...rest]
}

/** Phone-code options, derived from COUNTRIES (Malawi first, then
 *  alphabetical), for the international dial-code picker. Only countries with
 *  a known callingCode are included. */
export const COUNTRY_CALLING_CODES: Pick<Country, 'code' | 'name' | 'callingCode'>[] =
  getCountriesForForm()
    .filter((c) => Boolean(c.callingCode))
    .map((c) => ({ code: c.code, name: c.name, callingCode: c.callingCode }))
