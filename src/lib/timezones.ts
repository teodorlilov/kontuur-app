interface TimezoneEntry {
  value: string
  city: string
  region: string
}

const TIMEZONE_DATA: TimezoneEntry[] = [
  // North America
  { value: 'Pacific/Honolulu', city: 'Honolulu', region: 'North America' },
  { value: 'America/Anchorage', city: 'Anchorage', region: 'North America' },
  { value: 'America/Los_Angeles', city: 'Los Angeles', region: 'North America' },
  { value: 'America/Vancouver', city: 'Vancouver', region: 'North America' },
  { value: 'America/Denver', city: 'Denver', region: 'North America' },
  { value: 'America/Chicago', city: 'Chicago', region: 'North America' },
  { value: 'America/Mexico_City', city: 'Mexico City', region: 'North America' },
  { value: 'America/New_York', city: 'New York', region: 'North America' },
  { value: 'America/Toronto', city: 'Toronto', region: 'North America' },

  // South America
  { value: 'America/Bogota', city: 'Bogotá', region: 'South America' },
  { value: 'America/Lima', city: 'Lima', region: 'South America' },
  { value: 'America/Santiago', city: 'Santiago', region: 'South America' },
  { value: 'America/Sao_Paulo', city: 'São Paulo', region: 'South America' },
  { value: 'America/Argentina/Buenos_Aires', city: 'Buenos Aires', region: 'South America' },

  // Europe
  { value: 'UTC', city: 'UTC', region: 'Europe' },
  { value: 'Europe/London', city: 'London', region: 'Europe' },
  { value: 'Europe/Lisbon', city: 'Lisbon', region: 'Europe' },
  { value: 'Europe/Amsterdam', city: 'Amsterdam', region: 'Europe' },
  { value: 'Europe/Berlin', city: 'Berlin', region: 'Europe' },
  { value: 'Europe/Madrid', city: 'Madrid', region: 'Europe' },
  { value: 'Europe/Paris', city: 'Paris', region: 'Europe' },
  { value: 'Europe/Rome', city: 'Rome', region: 'Europe' },
  { value: 'Europe/Stockholm', city: 'Stockholm', region: 'Europe' },
  { value: 'Europe/Warsaw', city: 'Warsaw', region: 'Europe' },
  { value: 'Europe/Prague', city: 'Prague', region: 'Europe' },
  { value: 'Europe/Budapest', city: 'Budapest', region: 'Europe' },
  { value: 'Europe/Athens', city: 'Athens', region: 'Europe' },
  { value: 'Europe/Bucharest', city: 'Bucharest', region: 'Europe' },
  { value: 'Europe/Sofia', city: 'Sofia', region: 'Europe' },
  { value: 'Europe/Helsinki', city: 'Helsinki', region: 'Europe' },
  { value: 'Europe/Kyiv', city: 'Kyiv', region: 'Europe' },
  { value: 'Europe/Istanbul', city: 'Istanbul', region: 'Europe' },
  { value: 'Europe/Moscow', city: 'Moscow', region: 'Europe' },

  // Africa
  { value: 'Africa/Cairo', city: 'Cairo', region: 'Africa' },
  { value: 'Africa/Lagos', city: 'Lagos', region: 'Africa' },
  { value: 'Africa/Nairobi', city: 'Nairobi', region: 'Africa' },
  { value: 'Africa/Johannesburg', city: 'Johannesburg', region: 'Africa' },

  // Middle East
  { value: 'Asia/Beirut', city: 'Beirut', region: 'Middle East' },
  { value: 'Asia/Tel_Aviv', city: 'Tel Aviv', region: 'Middle East' },
  { value: 'Asia/Riyadh', city: 'Riyadh', region: 'Middle East' },
  { value: 'Asia/Dubai', city: 'Dubai', region: 'Middle East' },

  // Asia
  { value: 'Asia/Karachi', city: 'Karachi', region: 'Asia' },
  { value: 'Asia/Kolkata', city: 'Mumbai / Kolkata', region: 'Asia' },
  { value: 'Asia/Dhaka', city: 'Dhaka', region: 'Asia' },
  { value: 'Asia/Bangkok', city: 'Bangkok', region: 'Asia' },
  { value: 'Asia/Ho_Chi_Minh', city: 'Ho Chi Minh City', region: 'Asia' },
  { value: 'Asia/Jakarta', city: 'Jakarta', region: 'Asia' },
  { value: 'Asia/Singapore', city: 'Singapore', region: 'Asia' },
  { value: 'Asia/Kuala_Lumpur', city: 'Kuala Lumpur', region: 'Asia' },
  { value: 'Asia/Manila', city: 'Manila', region: 'Asia' },
  { value: 'Asia/Shanghai', city: 'Shanghai / Beijing', region: 'Asia' },
  { value: 'Asia/Hong_Kong', city: 'Hong Kong', region: 'Asia' },
  { value: 'Asia/Taipei', city: 'Taipei', region: 'Asia' },
  { value: 'Asia/Seoul', city: 'Seoul', region: 'Asia' },
  { value: 'Asia/Tokyo', city: 'Tokyo', region: 'Asia' },

  // Oceania
  { value: 'Australia/Perth', city: 'Perth', region: 'Oceania' },
  { value: 'Australia/Adelaide', city: 'Adelaide', region: 'Oceania' },
  { value: 'Australia/Melbourne', city: 'Melbourne', region: 'Oceania' },
  { value: 'Australia/Sydney', city: 'Sydney', region: 'Oceania' },
  { value: 'Pacific/Auckland', city: 'Auckland', region: 'Oceania' },
]

/**
 * Whether a zone is one this app supports — the picker's own list, not all of IANA.
 *
 * Worth checking on the way in because the stored value is handed to
 * `Intl.DateTimeFormat`, which throws `RangeError` on an unknown zone.
 */
export function isSupportedTimezone(value: string): boolean {
  return TIMEZONE_DATA.some((tz) => tz.value === value)
}

/**
 * Minutes this zone is ahead of UTC, right now.
 *
 * Reads the zone's numeric wall-clock parts rather than `timeZoneName`, because
 * only the numbers are stable across ICU builds — see `formatOffset`.
 */
function getOffsetMinutes(timeZone: string, now: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  )

  const wallClock = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    // ICU renders midnight as hour 24 in some builds; both forms mean 0.
    Number(parts.hour) % 24,
    Number(parts.minute)
  )
  // Seconds are dropped from both sides so the difference lands on a whole minute.
  return Math.round((wallClock - Math.floor(now.getTime() / 60000) * 60000) / 60000)
}

/**
 * "GMT", "GMT+5:30", "GMT-8" — formatted here rather than taken from Intl.
 *
 * `timeZoneName: 'shortOffset'` is a *display name*, and its rendering differs
 * between ICU builds: at zero offset Node emits "GMT" while browsers emit
 * "GMT+0". Server and client therefore disagreed on the UTC option's label,
 * which React reported as a hydration mismatch on the timezone <select>.
 */
function formatOffset(minutes: number): string {
  if (minutes === 0) return 'GMT'
  const sign = minutes < 0 ? '-' : '+'
  const abs = Math.abs(minutes)
  const hours = Math.floor(abs / 60)
  const rest = abs % 60
  return rest === 0
    ? `GMT${sign}${hours}`
    : `GMT${sign}${hours}:${String(rest).padStart(2, '0')}`
}

const REGION_ORDER = [
  'North America',
  'South America',
  'Europe',
  'Africa',
  'Middle East',
  'Asia',
  'Oceania',
]

interface TimezoneGroup {
  region: string
  options: { value: string; label: string }[]
}

function buildTimezoneOptions(now: Date): TimezoneGroup[] {
  const withOffsets = TIMEZONE_DATA.map((tz) => {
    const offsetMinutes = getOffsetMinutes(tz.value, now)
    return { ...tz, offsetMinutes, offsetLabel: formatOffset(offsetMinutes) }
  }).sort((a, b) => a.offsetMinutes - b.offsetMinutes)

  return REGION_ORDER.map((region) => ({
    region,
    options: withOffsets
      .filter((tz) => tz.region === region)
      .map((tz) => ({ value: tz.value, label: `(${tz.offsetLabel}) ${tz.city}` })),
  }))
}

let cache: { day: string; groups: TimezoneGroup[] } | null = null

/**
 * Timezone options grouped by region, offsets current as of today.
 *
 * Deliberately a function rather than a module constant. A constant is evaluated
 * once when the module is imported — on the server that is process boot, which
 * may be weeks before a given request, so the offsets it captured go stale the
 * next time a zone changes for DST and stop matching what the browser computes.
 * Memoised per UTC day, so a long-lived server still pays this once a day.
 */
export function getGroupedTimezones(): TimezoneGroup[] {
  const now = new Date()
  const day = now.toISOString().slice(0, 10)
  if (cache?.day !== day) cache = { day, groups: buildTimezoneOptions(now) }
  return cache.groups
}
