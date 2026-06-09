import type { Calendar } from '../Calendar'
import type { Dayjs } from 'dayjs'
import type { DateRange, CalEvent } from '../types'
import { dayMinutes, minutesToTime, intlFormat } from '../datelib'
import { packEvents } from '../layout/overlap'
import { startDrag, snap } from '../interaction/pointer'
import { el, clamp, type View } from './View'

/** Pixel height of one slot-duration on the time axis. */
export const SLOT_PX = 24

/**
 * Single-column day view: a vertical time axis
 * with absolutely-positioned, overlap-packed events. Supports drag-move,
 * resize and drag-select when `editable`/`selectable` are set.
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
    this.bindSelect()
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
      this.bindBar(node, ev)
      this.content.appendChild(node)
      this.cal.fireEventMount(ev, node)
    }

    this.renderNowIndicator()
  }

  // ---- interaction ---------------------------------------------------------

  private timeAt(minute: number): Dayjs {
    return this.cal.date.startOf('day').add(minute, 'minute')
  }

  private minuteAtY(clientY: number): number {
    const rect = this.content!.getBoundingClientRect()
    return this.cal.axis.min + (clientY - rect.top) / this.pxPerMinute
  }

  /** Wire click, drag-move and resize on an event bar (or just click if read-only). */
  private bindBar(bar: HTMLElement, ev: CalEvent): void {
    this.cal.bindContextMenu(bar, ev)
    if (!this.cal.editable) {
      bar.addEventListener('click', (jsEvent) => this.cal.fireEventClick(ev, bar, jsEvent))
      return
    }
    bar.style.cursor = 'move'

    const handle = el('div', 'zc-resize-handle zc-resize-s')
    bar.appendChild(handle)
    handle.addEventListener('pointerdown', (down) => this.beginResize(down, bar, ev))

    bar.addEventListener('pointerdown', (down) => {
      if (down.button !== 0) return
      if ((down.target as HTMLElement).closest('.zc-resize-handle')) return
      down.preventDefault()
      const axis = this.cal.axis
      const durMin = ev.end.diff(ev.start, 'minute')
      const origStartMin = dayMinutes(ev.start)
      const grabMin = this.minuteAtY(down.clientY)
      const place = (clientY: number): number =>
        clamp(
          snap(origStartMin + (this.minuteAtY(clientY) - grabMin), axis.duration),
          axis.min,
          axis.max - durMin,
        )
      startDrag(down, {
        onStart: () => bar.classList.add('zc-dragging'),
        onMove: ({ event }) => {
          bar.style.top = `${(place(event.clientY) - axis.min) * this.pxPerMinute}px`
        },
        onEnd: ({ moved, event }) => {
          bar.classList.remove('zc-dragging')
          if (!moved) {
            this.cal.fireEventClick(ev, bar, event)
            return
          }
          const newStart = this.timeAt(place(event.clientY))
          this.cal.commitEventChange(ev, newStart, newStart.add(durMin, 'minute'), ev.resourceId)
        },
      })
    })
  }

  private beginResize(down: MouseEvent, bar: HTMLElement, ev: CalEvent): void {
    if (down.button !== 0) return
    down.stopPropagation()
    down.preventDefault()
    const axis = this.cal.axis
    const startMin = dayMinutes(ev.start)
    const endAt = (clientY: number): number =>
      clamp(snap(this.minuteAtY(clientY), axis.duration), startMin + axis.duration, axis.max)
    startDrag(down, {
      onStart: () => bar.classList.add('zc-dragging'),
      onMove: ({ event }) => {
        bar.style.height = `${(endAt(event.clientY) - startMin) * this.pxPerMinute}px`
      },
      onEnd: ({ moved, event }) => {
        bar.classList.remove('zc-dragging')
        if (!moved) return
        this.cal.commitEventChange(ev, ev.start, this.timeAt(endAt(event.clientY)), ev.resourceId)
      },
    })
  }

  private bindSelect(): void {
    if (!this.cal.selectable || !this.content) return
    this.content.addEventListener('pointerdown', (down) => {
      if (down.button !== 0) return
      if ((down.target as HTMLElement).closest('.zc-event')) return
      down.preventDefault()
      const axis = this.cal.axis
      const anchor = clamp(snap(this.minuteAtY(down.clientY), axis.duration), axis.min, axis.max)
      const box = el('div', 'zc-select-box')
      this.content!.appendChild(box)
      const place = (clientY: number) => {
        const cur = clamp(snap(this.minuteAtY(clientY), axis.duration), axis.min, axis.max)
        const lo = Math.min(anchor, cur)
        const hi = Math.max(anchor, cur)
        box.style.top = `${(lo - axis.min) * this.pxPerMinute}px`
        box.style.height = `${(hi - lo) * this.pxPerMinute}px`
      }
      startDrag(down, {
        onMove: ({ event }) => place(event.clientY),
        onEnd: ({ moved, event }) => {
          box.remove()
          if (!moved) return
          const cur = clamp(snap(this.minuteAtY(event.clientY), axis.duration), axis.min, axis.max)
          let lo = Math.min(anchor, cur)
          let hi = Math.max(anchor, cur)
          if (hi <= lo) hi = Math.min(lo + axis.duration, axis.max)
          if (hi <= lo) return
          this.cal.commitSelect(this.timeAt(lo), this.timeAt(hi), null, event)
        },
      })
    })
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
