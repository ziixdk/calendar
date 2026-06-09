// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Calendar } from '../src/Calendar'
import { snap } from '../src/interaction/pointer'

describe('snap', () => {
  it('rounds to the nearest slot boundary', () => {
    expect(snap(372, 15)).toBe(375)
    expect(snap(367, 15)).toBe(360)
    expect(snap(100, 0)).toBe(100) // guard against div-by-zero
  })
})

function dayCal(host: HTMLElement, opts = {}) {
  const cal = new Calendar(host, {
    view: 'day',
    timezone: 'Europe/Copenhagen',
    date: '2026-06-09',
    slot: { min: '06:00', max: '19:00', duration: 15 },
    events: [
      { id: 1, title: 'A', start: '2026-06-09T08:00:00+02:00', end: '2026-06-09T09:00:00+02:00' },
      { id: 2, title: 'B', start: '2026-06-09T10:00:00+02:00', end: '2026-06-09T11:00:00+02:00' },
    ],
    ...opts,
  })
  cal.render()
  return cal
}

describe('commitEventChange', () => {
  let host: HTMLElement
  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
  })

  it('moves the event and fires onEventChange with the old snapshot', () => {
    const onEventChange = vi.fn()
    const cal = dayCal(host, { onEventChange })
    const ev = cal.getEventById(1)!.event
    const oldStart = ev.start
    const newStart = ev.start.add(60, 'minute')
    const ok = cal.commitEventChange(ev, newStart, newStart.add(60, 'minute'), null)
    expect(ok).toBe(true)
    expect(ev.start.isSame(newStart)).toBe(true)
    expect(onEventChange).toHaveBeenCalledOnce()
    expect(onEventChange.mock.calls[0][0].oldEvent.start.isSame(oldStart)).toBe(true)
  })

  it('rejects a move onto an overlap when eventOverlap is false', () => {
    const onEventChange = vi.fn()
    const cal = dayCal(host, { eventOverlap: false, onEventChange })
    const ev2 = cal.getEventById(2)!.event
    const clash = cal.getEventById(1)!.event.start.add(30, 'minute') // 08:30, overlaps event 1 (08–09)
    const ok = cal.commitEventChange(ev2, clash, clash.add(60, 'minute'), null)
    expect(ok).toBe(false)
    expect(onEventChange).not.toHaveBeenCalled()
    expect(ev2.start.hour()).toBe(10) // unchanged
  })

  it('allows overlap by default', () => {
    const cal = dayCal(host)
    const ev2 = cal.getEventById(2)!.event
    const clash = cal.getEventById(1)!.event.start.add(30, 'minute')
    expect(cal.commitEventChange(ev2, clash, clash.add(60, 'minute'), null)).toBe(true)
  })
})

describe('commitSelect', () => {
  let host: HTMLElement
  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
  })

  it('fires onSelect when allowed', () => {
    const onSelect = vi.fn()
    const cal = dayCal(host, { onSelect })
    const start = cal.date.startOf('day').add(7 * 60, 'minute')
    expect(cal.commitSelect(start, start.add(30, 'minute'), null, new MouseEvent('pointerup'))).toBe(true)
    expect(onSelect).toHaveBeenCalledOnce()
  })

  it('is blocked by selectAllow returning false', () => {
    const onSelect = vi.fn()
    const cal = dayCal(host, { onSelect, selectAllow: () => false })
    const start = cal.date.startOf('day').add(7 * 60, 'minute')
    expect(cal.commitSelect(start, start.add(30, 'minute'), null, new MouseEvent('pointerup'))).toBe(false)
    expect(onSelect).not.toHaveBeenCalled()
  })
})

describe('editable wiring', () => {
  let host: HTMLElement
  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
  })

  it('adds a resize handle and move cursor to editable bars', () => {
    dayCal(host, { editable: true })
    const bar = host.querySelector<HTMLElement>('.zc-event')!
    expect(bar.style.cursor).toBe('move')
    expect(bar.querySelector('.zc-resize-handle')).toBeTruthy()
  })

  it('leaves read-only bars without handles', () => {
    dayCal(host)
    const bar = host.querySelector<HTMLElement>('.zc-event')!
    expect(bar.querySelector('.zc-resize-handle')).toBeNull()
  })
})

function fire(target: EventTarget, type: string, clientX: number, clientY: number) {
  target.dispatchEvent(
    new MouseEvent(type, { clientX, clientY, button: 0, bubbles: true, cancelable: true }),
  )
}

describe('onEventContextMenu', () => {
  let host: HTMLElement
  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
  })

  it('fires on right-click and suppresses the native menu (read-only bars too)', () => {
    const onEventContextMenu = vi.fn()
    dayCal(host, { onEventContextMenu })
    const bar = host.querySelector<HTMLElement>('.zc-event')!
    const evt = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    bar.dispatchEvent(evt)
    expect(onEventContextMenu).toHaveBeenCalledOnce()
    expect(onEventContextMenu.mock.calls[0][0].event.id).toBe('1')
    expect(evt.defaultPrevented).toBe(true)
  })

  it('does nothing when no handler is set', () => {
    dayCal(host)
    const bar = host.querySelector<HTMLElement>('.zc-event')!
    const evt = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    bar.dispatchEvent(evt)
    expect(evt.defaultPrevented).toBe(false)
  })
})

describe('drag-select gesture (day)', () => {
  let host: HTMLElement
  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
  })

  it('produces an onSelect from a pointer drag on empty space', () => {
    const onSelect = vi.fn()
    dayCal(host, { selectable: true, onSelect })
    const col = host.querySelector<HTMLElement>('.zc-col')!
    // jsdom rects are 0 → minuteAtY(y) = axisMin(360) + y / (24/15)
    fire(col, 'pointerdown', 0, 24) // anchor 06:15
    fire(window, 'pointermove', 0, 120) // drag down past threshold → 07:15
    fire(window, 'pointerup', 0, 120)
    expect(onSelect).toHaveBeenCalledOnce()
    const info = onSelect.mock.calls[0][0]
    expect(info.end.diff(info.start, 'minute')).toBe(60)
  })
})
