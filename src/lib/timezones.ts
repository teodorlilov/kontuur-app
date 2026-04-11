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

function getCurrentOffset(timezone: string): string {
  return (
    new Intl.DateTimeFormat('en', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
    })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName')?.value ?? 'UTC'
  )
}

function getOffsetMinutes(timezone: string): number {
  const label = getCurrentOffset(timezone) // e.g. "GMT+5:30", "GMT-5", "UTC"
  const match = label.match(/([+-])(\d+)(?::(\d+))?/)
  if (!match) return 0
  const sign = match[1] === '+' ? 1 : -1
  return sign * (parseInt(match[2]!) * 60 + parseInt(match[3] ?? '0'))
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

function buildTimezoneOptions(): { region: string; options: { value: string; label: string }[] }[] {
  const withOffsets = TIMEZONE_DATA.map((tz) => ({
    ...tz,
    offsetMinutes: getOffsetMinutes(tz.value),
    offsetLabel: getCurrentOffset(tz.value),
  })).sort((a, b) => a.offsetMinutes - b.offsetMinutes)

  return REGION_ORDER.map((region) => ({
    region,
    options: withOffsets
      .filter((tz) => tz.region === region)
      .map((tz) => ({
        value: tz.value,
        label: `(${tz.offsetLabel}) ${tz.city}`,
      })),
  }))
}

export const GROUPED_TIMEZONES = buildTimezoneOptions()
