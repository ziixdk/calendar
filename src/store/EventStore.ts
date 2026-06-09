import type { Dayjs } from 'dayjs'
import type { CalEvent, EventInput } from '../types'
import { toTz } from '../datelib'

/** Normalises raw event input, dedupes by id, and answers range/resource queries. */
export class EventStore {
  private map = new Map<string, CalEvent>()

  constructor(private tz?: string) {}

  normalize(input: EventInput): CalEvent {
    const start = toTz(input.start, this.tz)
    const end = input.end ? toTz(input.end, this.tz) : start.add(30, 'minute')
    return {
      id: String(input.id),
      title: input.title ?? '',
      start,
      end,
      resourceId: input.resourceId != null ? String(input.resourceId) : null,
      allDay: Boolean(input.allDay),
      color: input.color,
      textColor: input.textColor,
      extendedProps: input.extendedProps ?? {},
      raw: input,
    }
  }

  /** Replace the entire set, deduping by id (last write wins). */
  set(inputs: EventInput[]): void {
    this.map.clear()
    for (const input of inputs) {
      const e = this.normalize(input)
      this.map.set(e.id, e)
    }
  }

  add(input: EventInput): CalEvent {
    const e = this.normalize(input)
    this.map.set(e.id, e)
    return e
  }

  remove(id: string | number): boolean {
    return this.map.delete(String(id))
  }

  get(id: string | number): CalEvent | undefined {
    return this.map.get(String(id))
  }

  all(): CalEvent[] {
    return [...this.map.values()]
  }

  /**
   * Events overlapping [start, end). When `resourceId` is supplied (including
   * `null` for unassigned), only events on that resource are returned.
   */
  inRange(start: Dayjs, end: Dayjs, resourceId?: string | null): CalEvent[] {
    return this.all().filter((e) => {
      if (resourceId !== undefined && e.resourceId !== resourceId) return false
      return e.start.isBefore(end) && e.end.isAfter(start)
    })
  }
}
