import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import type { SlotConfig } from './types'

dayjs.extend(utc)
dayjs.extend(timezone)

/** Parse a value into a Dayjs anchored to `tz` (the shop timezone), if given. */
export function toTz(value: string | Date | Dayjs, tz?: string): Dayjs {
  const d = dayjs(value)
  return tz ? d.tz(tz) : d
}

/** "Now" in the calendar timezone. */
export function nowTz(tz?: string): Dayjs {
  return tz ? dayjs().tz(tz) : dayjs()
}

/** Parse 'HH:mm' / 'HH:mm:ss' / '24:00' into minutes from midnight. */
export function timeToMinutes(t: string): number {
  const parts = t.split(':')
  const h = Number(parts[0]) || 0
  const m = Number(parts[1]) || 0
  return h * 60 + m
}

/** Format minutes-from-midnight back to a zero-padded 'HH:mm'. */
export function minutesToTime(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Minutes from midnight for a Dayjs, read in its own (tz-applied) clock. */
export function dayMinutes(d: Dayjs): number {
  return d.hour() * 60 + d.minute()
}

/** Format an absolute instant in the given timezone via Intl. */
export function intlFormat(
  d: Dayjs,
  opts: Intl.DateTimeFormatOptions,
  localeTag: string,
  tz?: string,
): string {
  return new Intl.DateTimeFormat(localeTag, { ...opts, timeZone: tz }).format(d.toDate())
}

/** Resolved, numeric time-axis derived from a SlotConfig. */
export interface SlotAxis {
  /** First visible minute from midnight. */
  min: number
  /** Last visible minute from midnight. */
  max: number
  /** Minutes per slot. */
  duration: number
  /** Minutes between axis labels. */
  labelInterval: number
  /** Number of whole slots between min and max. */
  slots: number
  /** Total visible minutes (max - min). */
  totalMinutes: number
}

export function buildAxis(slot: SlotConfig = {}): SlotAxis {
  const min = timeToMinutes(slot.min ?? '00:00')
  const max = timeToMinutes(slot.max ?? '24:00')
  const duration = slot.duration ?? 15
  const labelInterval = slot.labelInterval ?? 60
  const totalMinutes = Math.max(0, max - min)
  const slots = duration > 0 ? Math.ceil(totalMinutes / duration) : 0
  return { min, max, duration, labelInterval, slots, totalMinutes }
}
