import { describe, it, expect } from 'vitest'
import dayjs from 'dayjs'
import { packEvents } from '../src/layout/overlap'
import type { CalEvent } from '../src/types'

function ev(id: string, start: string, end: string): CalEvent {
  return {
    id,
    title: id,
    start: dayjs(`2026-06-09T${start}:00`),
    end: dayjs(`2026-06-09T${end}:00`),
    resourceId: null,
    allDay: false,
    extendedProps: {},
    raw: { id, start: '', end: '' },
  }
}

function byId(packed: ReturnType<typeof packEvents>) {
  return Object.fromEntries(packed.map((p) => [p.event.id, p]))
}

describe('packEvents', () => {
  it('gives a lone event the full width', () => {
    const packed = packEvents([ev('a', '09:00', '10:00')])
    expect(packed[0].cols).toBe(1)
    expect(packed[0].left).toBe(0)
    expect(packed[0].width).toBe(1)
  })

  it('splits two overlapping events into two columns', () => {
    const packed = byId(packEvents([ev('a', '09:00', '10:00'), ev('b', '09:30', '10:30')]))
    expect(packed.a.cols).toBe(2)
    expect(packed.b.cols).toBe(2)
    expect(packed.a.col).not.toBe(packed.b.col)
    expect(packed.a.width).toBe(0.5)
  })

  it('keeps non-overlapping events at full width in separate clusters', () => {
    const packed = byId(packEvents([ev('a', '09:00', '10:00'), ev('b', '11:00', '12:00')]))
    expect(packed.a.cols).toBe(1)
    expect(packed.b.cols).toBe(1)
  })

  it('reuses a freed column when an earlier event has ended', () => {
    // a: 9-10, b: 9-11 (overlap, 2 cols). c: 10-11 overlaps only b, can reuse a's column.
    const packed = byId(
      packEvents([ev('a', '09:00', '10:00'), ev('b', '09:00', '11:00'), ev('c', '10:00', '11:00')]),
    )
    expect(packed.b.cols).toBe(2)
    expect(packed.a.col).toBe(packed.c.col) // c slots into a's vacated column
  })
})
