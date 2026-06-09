import { describe, it, expect } from 'vitest'
import {
  timeToMinutes,
  minutesToTime,
  buildAxis,
  dayMinutes,
  toTz,
} from '../src/datelib'

describe('timeToMinutes / minutesToTime', () => {
  it('parses HH:mm', () => {
    expect(timeToMinutes('00:00')).toBe(0)
    expect(timeToMinutes('06:30')).toBe(390)
    expect(timeToMinutes('24:00')).toBe(1440)
  })

  it('round-trips', () => {
    expect(minutesToTime(0)).toBe('00:00')
    expect(minutesToTime(390)).toBe('06:30')
    expect(minutesToTime(1439)).toBe('23:59')
  })
})

describe('buildAxis', () => {
  it('derives slot counts from the visible window', () => {
    const axis = buildAxis({ min: '06:00', max: '19:00', duration: 15, labelInterval: 60 })
    expect(axis.min).toBe(360)
    expect(axis.max).toBe(1140)
    expect(axis.totalMinutes).toBe(780)
    expect(axis.slots).toBe(52) // 780 / 15
  })

  it('defaults to a full day in 15-minute slots', () => {
    const axis = buildAxis()
    expect(axis.min).toBe(0)
    expect(axis.max).toBe(1440)
    expect(axis.slots).toBe(96)
    expect(axis.labelInterval).toBe(60)
  })
})

describe('timezone handling', () => {
  it('reads the wall-clock minute in the target timezone, not the host', () => {
    // 08:30 UTC is 10:30 in Copenhagen during CEST (summer).
    const d = toTz('2026-06-09T08:30:00Z', 'Europe/Copenhagen')
    expect(dayMinutes(d)).toBe(10 * 60 + 30)
  })
})
