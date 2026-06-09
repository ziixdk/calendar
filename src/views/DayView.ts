import type { Calendar } from '../Calendar'
import type { DateRange, CalEvent } from '../types'
import { dayMinutes, minutesToTime, intlFormat } from '../datelib'
import { packEvents } from '../layout/overlap'
import { el, clamp, type View } from './View'

/** Pixel height of one slot-duration on the time axis. */
export const SLOT_PX = 24

/**
 * Single-column day view (the `timeGridDay` equivalent): a vertical time axis
 * with absolutely-positioned, overlap-packed events. Read-only in this build;
 * drag/resize arrive with the interaction engine (Fase 4).
 */
export class DayView implements View {
  protected grid?: HTMLElement
  protected content?: HTMLElement
  private nowLine: HTMLElement | null = null

  constructor(
    protected cal: Calendar,
    protected root: HTMLElement,
  ) {}

  protected get pxPerMinute(): number {
    return SLOT_PX / this.cal.axis.duration
  }

  protected get contentHeight(): number {
    return this.cal.axis.slots * SLOT_PX
  }

  protected localeTag(): string {
    return this.cal.locale.intl ?? this.cal.locale.code
  }

  range(): DateRange {
    const d = this.cal.date
    return { start: d.startOf('day'), end: d.endOf('day') }
  }

  title(): string {
    return intlFormat(
      this.cal.date,
      { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
      this.localeTag(),
      this.cal.tz,
    )
  }

  mount(): void {
    const axis = this.cal.axis
    this.grid = el('div', 'zc-timegrid')

    const axisCol = el('div', 'zc-axis')
    axisCol.style.height = `${this.contentHeight}px`
    for (let m = axis.min; m <= axis.max; m += axis.labelInterval) {
      const label = el('div', 'zc-axis-label')
      label.style.top = `${(m - axis.min) * this.pxPerMinute}px`
      label.textContent = minutesToTime(m)
      axisCol.appendChild(label)
    }

    this.content = el('div', 'zc-col')
    this.content.style.height = `${this.contentHeight}px`
    for (let s = 0; s <= axis.slots; s++) {
      const line = el('div', 'zc-slot-line')
      if ((s * axis.duration) % axis.labelInterval === 0) line.classList.add('zc-slot-major')
      line.style.top = `${s * SLOT_PX}px`
      this.content.appendChild(line)
    }

    this.grid.appendChild(axisCol)
    this.grid.appendChild(this.content)
    this.root.appendChild(this.grid)
    this.renderEvents()
  }

  /** Events to lay out in this column. Subclasses scope this by resource. */
  protected eventsFor(): CalEvent[] {
    const r = this.range()
    return this.cal.events.inRange(r.start, r.end)
  }

  renderEvents(): void {
    if (!this.content) return
    this.content.querySelectorAll('.zc-event').forEach((n) => n.remove())

    const axis = this.cal.axis
    const packed = packEvents(this.eventsFor())
    for (const p of packed) {
      const ev = p.event
      const rawStart = dayMinutes(ev.start)
      const rawEnd = dayMinutes(ev.end) || axis.max
      const startMin = clamp(rawStart, axis.min, axis.max)
      const endMin = clamp(rawEnd, axis.min, axis.max)
      const top = (startMin - axis.min) * this.pxPerMinute
      const height = Math.max(SLOT_PX - 2, (endMin - startMin) * this.pxPerMinute)

      const node = el('div', 'zc-event')
      node.dataset.eventId = ev.id
      node.style.top = `${top}px`
      node.style.height = `${height}px`
      node.style.left = `calc(${p.left * 100}% + 2px)`
      node.style.width = `calc(${p.width * 100}% - 4px)`
      if (ev.color) node.style.setProperty('--zc-event-bg', ev.color)
      if (ev.textColor) node.style.setProperty('--zc-event-fg', ev.textColor)
      node.appendChild(this.cal.renderEventContent(ev))
      node.addEventListener('click', (jsEvent) =>
        this.cal.fireEventClick(ev, node, jsEvent as MouseEvent),
      )
      this.content.appendChild(node)
      this.cal.fireEventMount(ev, node)
    }

    this.renderNowIndicator()
  }

  protected renderNowIndicator(): void {
    this.nowLine?.remove()
    this.nowLine = null
    if (!this.cal.options.nowIndicator || !this.content) return
    const now = this.cal.now()
    if (!now.isSame(this.cal.date, 'day')) return
    const axis = this.cal.axis
    const nm = dayMinutes(now)
    if (nm < axis.min || nm > axis.max) return
    this.nowLine = el('div', 'zc-now-indicator')
    this.nowLine.style.top = `${(nm - axis.min) * this.pxPerMinute}px`
    this.content.appendChild(this.nowLine)
  }

  unmount(): void {
    this.grid?.remove()
    this.grid = undefined
    this.content = undefined
    this.nowLine = null
  }
}
