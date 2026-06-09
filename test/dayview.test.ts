// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { Calendar } from '../src/Calendar'

describe('DayView rendering', () => {
  let host: HTMLElement

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
  })

  function build(opts = {}) {
    const cal = new Calendar(host, {
      view: 'day',
      timezone: 'Europe/Copenhagen',
      date: '2026-06-09',
      slot: { min: '06:00', max: '19:00', duration: 15, labelInterval: 60 },
      events: [
        { id: 1, title: 'A', start: '2026-06-09T08:00:00+02:00', end: '2026-06-09T09:00:00+02:00' },
        { id: 2, title: 'B', start: '2026-06-09T08:30:00+02:00', end: '2026-06-09T09:30:00+02:00' },
      ],
      ...opts,
    })
    cal.render()
    return cal
  }

  it('mounts a toolbar, time grid and axis labels', () => {
    build()
    expect(host.classList.contains('zc')).toBe(true)
    expect(host.querySelector('.zc-toolbar')).toBeTruthy()
    expect(host.querySelector('.zc-timegrid')).toBeTruthy()
    // 06:00..19:00 inclusive at a 60-min interval = 14 labels
    expect(host.querySelectorAll('.zc-axis-label').length).toBe(14)
  })

  it('renders events and packs overlaps side by side', () => {
    build()
    const events = host.querySelectorAll<HTMLElement>('.zc-event')
    expect(events.length).toBe(2)
    // overlapping pair → each takes half width
    expect(events[0].style.width).toContain('50%')
  })

  it('positions an event by its wall-clock minute in the timezone', () => {
    build()
    const first = host.querySelector<HTMLElement>('.zc-event')!
    // 08:00 is 120 min after the 06:00 axis start; SLOT_PX/duration = 24/15 px-per-min
    // top = 120 * (24/15) = 192px
    expect(first.style.top).toBe('192px')
  })

  it('fires onEventClick with the normalised event', () => {
    let clicked: string | null = null
    build({ onEventClick: ({ event }: { event: { title: string } }) => (clicked = event.title) })
    host.querySelector<HTMLElement>('.zc-event')!.click()
    expect(clicked).toBeTruthy()
  })

  it('addEvent and getEventById(id).remove() update the DOM', () => {
    const cal = build()
    cal.addEvent({ id: 3, title: 'C', start: '2026-06-09T11:00:00+02:00', end: '2026-06-09T12:00:00+02:00' })
    expect(host.querySelectorAll('.zc-event').length).toBe(3)
    cal.getEventById(3)!.remove()
    expect(host.querySelectorAll('.zc-event').length).toBe(2)
  })

  it('throws a clear error for an unknown view type', () => {
    // cast past the type guard to exercise the runtime fallback
    const cal = new Calendar(host, { view: 'agenda' as 'day' })
    expect(() => cal.render()).toThrow(/unknown view/i)
  })
})
