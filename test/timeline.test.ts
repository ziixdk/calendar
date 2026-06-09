// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { Calendar } from '../src/Calendar'
import type { CalResource } from '../src/types'

describe('TimelineView rendering', () => {
  let host: HTMLElement

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
  })

  function build(opts = {}) {
    const cal = new Calendar(host, {
      view: 'timeline',
      timezone: 'Europe/Copenhagen',
      date: '2026-06-09',
      slot: { min: '06:00', max: '19:00', duration: 15, labelInterval: 60 },
      resources: [
        { id: 'E1', title: 'Anders', group: 'Mekanik' },
        { id: 'E2', title: 'Bo', group: 'Mekanik' },
        { id: 'C1', title: 'Bil 1', group: 'Biler' },
      ],
      events: [
        { id: 1, title: 'A', start: '2026-06-09T08:00:00+02:00', end: '2026-06-09T09:00:00+02:00', resourceId: 'E1' },
        { id: 2, title: 'B', start: '2026-06-09T08:30:00+02:00', end: '2026-06-09T09:30:00+02:00', resourceId: 'E1' },
        { id: 3, title: 'C', start: '2026-06-09T10:00:00+02:00', end: '2026-06-09T10:30:00+02:00', resourceId: 'C1' },
      ],
      ...opts,
    })
    cal.render()
    return cal
  }

  it('renders one row per resource plus group headers', () => {
    build()
    expect(host.querySelector('.zc-timeline')).toBeTruthy()
    expect(host.querySelectorAll('.zc-tl-resource-row[data-resource-id]').length).toBe(3)
    expect(host.querySelectorAll('.zc-tl-group-row').length).toBe(2) // Mekanik, Biler
  })

  it('places events in the correct resource row', () => {
    build()
    const e1Row = host.querySelector<HTMLElement>('.zc-tl-row[data-resource-id="E1"]')!
    const c1Row = host.querySelector<HTMLElement>('.zc-tl-row[data-resource-id="C1"]')!
    expect(e1Row.querySelectorAll('.zc-event').length).toBe(2)
    expect(c1Row.querySelectorAll('.zc-event').length).toBe(1)
  })

  it('positions an event bar by wall-clock minute along the x-axis', () => {
    build()
    const bar = host.querySelector<HTMLElement>('.zc-tl-row[data-resource-id="C1"] .zc-event')!
    // 10:00 is 240 min after 06:00; pxPerMinute = 90/60 = 1.5 → left = 360px, width = 30*1.5 = 45px
    expect(bar.style.left).toBe('360px')
    expect(bar.style.width).toBe('45px')
  })

  it('stacks overlapping events into vertical levels and grows the row to fit', () => {
    build()
    const e1Row = host.querySelector<HTMLElement>('.zc-tl-row[data-resource-id="E1"]')!
    const bars = e1Row.querySelectorAll<HTMLElement>('.zc-event')
    // two overlapping events → different vertical offsets
    expect(bars[0].style.top).not.toBe(bars[1].style.top)
    // row height = levels(2) * eventMinHeight(48) + 2*PAD(4) = 104; events keep ~min height
    expect(e1Row.style.height).toBe('104px')
    expect(parseInt(bars[0].style.height, 10)).toBeGreaterThanOrEqual(44)
  })

  it('respects a custom eventMinHeight for stacked rows', () => {
    build({ eventMinHeight: 60 })
    const e1Row = host.querySelector<HTMLElement>('.zc-tl-row[data-resource-id="E1"]')!
    expect(e1Row.style.height).toBe('128px') // 2*60 + 8
  })

  it('renders custom resource-area columns', () => {
    build({
      resourceArea: {
        width: '30%',
        columns: [
          { field: 'title', header: 'Afdeling' },
          { header: 'Tider', render: (r: CalResource) => `<em data-tider>${r.id}</em>` },
        ],
      },
    })
    const heads = host.querySelectorAll('.zc-tl-col-head')
    expect(heads[0].textContent).toBe('Afdeling')
    expect(heads[1].textContent).toBe('Tider')
    expect(host.querySelector('[data-tider]')).toBeTruthy()
  })

  it('fires onEventClick from a timeline bar', () => {
    let clicked: string | null = null
    build({ onEventClick: ({ event }: { event: { id: string } }) => (clicked = event.id) })
    host.querySelector<HTMLElement>('.zc-tl-row[data-resource-id="C1"] .zc-event')!.click()
    expect(clicked).toBe('3')
  })
})
