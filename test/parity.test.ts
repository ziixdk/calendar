// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Calendar } from '../src/Calendar'

describe('DMS API parity', () => {
  let host: HTMLElement
  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
  })

  function timelineCal(opts = {}) {
    const cal = new Calendar(host, {
      view: 'timeline',
      timezone: 'Europe/Copenhagen',
      date: '2026-06-09',
      slot: { min: '06:00', max: '19:00', duration: 15 },
      resources: [{ id: 'E1', title: 'Anders', group: 'Mekanik', extendedProps: { employee_id: 7 } }],
      resourceArea: {
        columns: [
          { field: 'title', header: 'Afdeling' },
          { header: 'Tider', render: (r) => `<i data-wh>${r.extendedProps.workHours ?? '–'}</i>` },
        ],
      },
      events: [
        { id: 1, title: 'A', start: '2026-06-09T08:00:00+02:00', end: '2026-06-09T09:00:00+02:00', resourceId: 'E1' },
      ],
      ...opts,
    })
    cal.render()
    return cal
  }

  it('#1 getResourceById(id).setExtendedProp updates the resource column live', async () => {
    const cal = timelineCal()
    expect(host.querySelector('[data-wh]')!.textContent).toBe('–')
    const handle = cal.getResourceById('E1')!
    expect(handle.id).toBe('E1')
    expect(handle.resource.extendedProps.employee_id).toBe(7)
    handle.setExtendedProp('workHours', '07:30')
    // resource-area re-render is coalesced onto a microtask (avoids flicker)
    await Promise.resolve()
    expect(host.querySelector('[data-wh]')!.textContent).toBe('07:30')
  })

  it('#1b folds non-standard top-level resource fields into extendedProps', () => {
    const cal = new Calendar(host, {
      view: 'timeline',
      timezone: 'Europe/Copenhagen',
      date: '2026-06-09',
      resources: [{id: 'E1', title: 'A', group: 'G', badges: ['vip', 'new'], workHours: {workTime: 60}}],
    })
    cal.render()
    const r = cal.getResourceById('E1')!.resource
    expect(r.extendedProps.badges).toEqual(['vip', 'new'])
    expect(r.extendedProps.workHours).toEqual({workTime: 60})
  })

  it('#2 exposes the active view range (view.activeStart parity)', () => {
    const cal = timelineCal()
    expect(cal.activeStart.format('YYYY-MM-DD')).toBe('2026-06-09')
    expect(cal.getView().type).toBe('timeline')
    expect(cal.getView().activeStart.hour()).toBe(0)
  })

  it('#3 onEventChange provides revert() that restores the old times', () => {
    let captured: { revert: () => void; oldStart: string } | null = null
    const cal = timelineCal({
      editable: true,
      onEventChange: ({ oldEvent, revert }: any) => {
        captured = { revert, oldStart: oldEvent.start.toISOString() }
      },
    })
    const ev = cal.getEventById(1)!.event
    const moved = ev.start.add(60, 'minute')
    cal.commitEventChange(ev, moved, moved.add(60, 'minute'), 'E1')
    expect(ev.start.hour()).toBe(9) // 08→09 (CEST)
    captured!.revert()
    expect(ev.start.toISOString()).toBe(captured!.oldStart) // back to 08:00
  })

  it('#4 toolbar parses comma-joined button groups', () => {
    timelineCal({ toolbar: { start: '', center: 'title', end: 'today prev,next' } })
    const groups = host.querySelectorAll('.zc-toolbar-end .zc-btn-group')
    // one group for "today", one for "prev,next"
    expect(groups.length).toBe(2)
    expect(groups[1].querySelectorAll('.zc-btn').length).toBe(2)
  })

  it('#6 dayClosed tints the grid via a predicate on the current date', () => {
    const isClosed = vi.fn((d: { day: () => number }) => d.day() === 2) // 2026-06-09 is a Tuesday
    timelineCal({ dayClosed: isClosed })
    expect(host.querySelector('.zc-body')!.classList.contains('zc-closed')).toBe(true)
    expect(isClosed).toHaveBeenCalled()
  })

  it('i18n: every toolbar label and aria-label comes from locale', () => {
    timelineCal({
      toolbar: { start: '', center: 'title', end: 'today prev next' },
      locale: {
        code: 'da',
        intl: 'da-DK',
        buttons: { today: 'I dag', prev: 'Forrige', next: 'Næste' },
        ariaLabels: { prev: 'Forrige dag', next: 'Næste dag' },
      },
    })
    const today = host.querySelector<HTMLElement>('[data-zc-button="today"]')!
    const prev = host.querySelector<HTMLElement>('[data-zc-button="prev"]')!
    expect(today.textContent).toBe('I dag')
    expect(prev.textContent).toBe('Forrige')
    expect(prev.getAttribute('aria-label')).toBe('Forrige dag')
  })
})
