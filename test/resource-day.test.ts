// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { Calendar } from '../src/Calendar'

describe('ResourceDayView rendering', () => {
  let host: HTMLElement

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
  })

  function build(opts = {}) {
    const cal = new Calendar(host, {
      view: 'resource-day',
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
        { id: 2, title: 'B', start: '2026-06-09T10:00:00+02:00', end: '2026-06-09T11:00:00+02:00', resourceId: 'C1' },
      ],
      ...opts,
    })
    cal.render()
    return cal
  }

  it('renders one column and one header label per resource', () => {
    build()
    expect(host.querySelector('.zc-rg')).toBeTruthy()
    expect(host.querySelectorAll('.zc-rg-col[data-resource-id]').length).toBe(3)
    expect(host.querySelectorAll('.zc-rg-label').length).toBe(3)
  })

  it('renders group bands for the grouped header', () => {
    build()
    const bands = host.querySelectorAll<HTMLElement>('.zc-rg-group-band')
    expect(bands.length).toBe(2) // Mekanik, Biler
    expect(bands[0].textContent).toBe('Mekanik')
  })

  it('places each event in its resource column', () => {
    build()
    const e1 = host.querySelector<HTMLElement>('.zc-rg-col[data-resource-id="E1"]')!
    const c1 = host.querySelector<HTMLElement>('.zc-rg-col[data-resource-id="C1"]')!
    const e2 = host.querySelector<HTMLElement>('.zc-rg-col[data-resource-id="E2"]')!
    expect(e1.querySelectorAll('.zc-event').length).toBe(1)
    expect(c1.querySelectorAll('.zc-event').length).toBe(1)
    expect(e2.querySelectorAll('.zc-event').length).toBe(0)
  })

  it('positions an event by its wall-clock minute on the shared axis', () => {
    build()
    const bar = host.querySelector<HTMLElement>('.zc-rg-col[data-resource-id="E1"] .zc-event')!
    // 08:00 → 120 min after 06:00; SLOT_PX/duration = 24/15 → top = 120 * 1.6 = 192px
    expect(bar.style.top).toBe('192px')
  })

  it('uses renderResource for the column header when provided', () => {
    build({ renderResource: (r: { title: string }) => `<b data-r>${r.title}</b>` })
    expect(host.querySelector('[data-r]')).toBeTruthy()
  })

  it('adds resize handles to editable bars', () => {
    build({ editable: true })
    const bar = host.querySelector<HTMLElement>('.zc-event')!
    expect(bar.style.cursor).toBe('move')
    expect(bar.querySelector('.zc-resize-handle')).toBeTruthy()
  })
})
