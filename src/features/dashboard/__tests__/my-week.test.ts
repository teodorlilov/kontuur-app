import { describe, expect, it } from 'vitest'
import { buildMyWeekDays } from '../lib/my-week'
import { emptyWeek, type WeekDay } from '@/lib/queries/week-coverage'

const ZONE = 'Europe/Sofia'
const WEEK = '2026-09-07'

function withPost(index: number, state: WeekDay['state'], at: string, count = 1): WeekDay[] {
  const week = emptyWeek()
  week[index] = { state, postId: `p${index}`, at, count }
  return week
}

describe('buildMyWeekDays', () => {
  it("gives every column its cap facts from the week key and the page's today", () => {
    const days = buildMyWeekDays({
      week: emptyWeek(),
      previews: {},
      weekStartISO: WEEK,
      timeZone: ZONE,
      todayIndex: 5,
    })

    expect(days.map((day) => day.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
    expect(days.map((day) => day.dayNumber)).toEqual([7, 8, 9, 10, 11, 12, 13])
    expect(days.map((day) => day.isToday)).toEqual([false, false, false, false, false, true, false])
    expect(days.map((day) => day.isPast)).toEqual([true, true, true, true, true, false, false])
    expect(days.every((day) => day.state === 'open' && day.post === null)).toBe(true)
  })

  it("titles a day by its caption's preview line and clocks it in the agency zone", () => {
    const days = buildMyWeekDays({
      week: withPost(1, 'scheduled', '2026-09-08T07:30:00Z'),
      previews: {
        p1: {
          id: 'p1',
          caption: '# POST 1\nThree questions to ask first',
          imageUrl: 'https://x/img.jpg',
        },
      },
      weekStartISO: WEEK,
      timeZone: ZONE,
      todayIndex: 0,
    })

    expect(days[1]?.post).toEqual({
      id: 'p1',
      title: 'Three questions to ask first',
      time: '10:30',
      imageUrl: 'https://x/img.jpg',
    })
    expect(days[1]?.state).toBe('scheduled')
  })

  it("keeps a day's state and time when its preview is missing", () => {
    const days = buildMyWeekDays({
      week: withPost(3, 'published', '2026-09-10T15:00:00Z', 2),
      previews: {},
      weekStartISO: WEEK,
      timeZone: ZONE,
      todayIndex: 6,
    })

    expect(days[3]?.post).toEqual({
      id: 'p3',
      title: 'Untitled draft',
      time: '18:00',
      imageUrl: null,
    })
    expect(days[3]?.count).toBe(2)
  })

  it('reads an empty caption as untitled rather than as a blank line', () => {
    const days = buildMyWeekDays({
      week: withPost(0, 'scheduled', '2026-09-07T06:00:00Z'),
      previews: { p0: { id: 'p0', caption: '', imageUrl: null } },
      weekStartISO: WEEK,
      timeZone: ZONE,
      todayIndex: 0,
    })

    expect(days[0]?.post?.title).toBe('Untitled draft')
  })
})
