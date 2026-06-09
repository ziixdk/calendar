import type { Calendar } from '../Calendar'
import type { Dayjs } from 'dayjs'
import type { DateRange, CalEvent, CalResource } from '../types'
import { dayMinutes, minutesToTime, intlFormat, businessRangesForWeekday, invertRanges } from '../datelib'
import { packEvents } from '../layout/overlap'
import { startDrag, snap } from '../interaction/pointer'
import { el, clamp, type View } from './View'
import { SLOT_PX } from './DayView'

/**
 * Resources-as-columns day view: a shared vertical time axis with one column per resource,
 * grouped under sticky header bands. Reuses the day view's vertical geometry and
 * supports drag-move (incl. across columns → resource change), resize and
 * drag-select.
 */
export class ResourceDayView implements View {
  private rootEl?: HTMLElement
  private colsEl?: HTMLElement
  private nowLine: HTMLElement | null = null
  private cols: Array<{ resource: CalResource; content: HTMLElement }> = []

  constructor(
    private cal: Calendar,
    private root: HTMLElement,
  ) {}

  private get pxPerMinute(): number {
    return SLOT_PX / this.cal.axis.duration
  }

  private get contentHeight(): number {
    return this.cal.axis.slots * SLOT_PX
  }

  private localeTag(): string {
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

  // ---- mount ---------------------------------------------------------------

  mount(): void {
    this.rootEl = el('div', 'zc-rg')
    const groups = this.cal.resources.grouped()
    const ordered = groups.flatMap((g) => g.resources)
    const showGroups = groups.length > 1 || groups.some((g) => g.group !== null)

    this.rootEl.appendChild(this.buildHead(groups, showGroups))

    const canvas = el('div', 'zc-rg-canvas')
    canvas.style.height = `${this.contentHeight}px`
    canvas.appendChild(this.buildAxis())

    this.colsEl = el('div', 'zc-rg-cols')
    this.cols = []
    for (const resource of ordered) {
      const col = el('div', 'zc-rg-col')
      col.dataset.resourceId = resource.id
      this.buildSlotLines(col)
      this.buildNonBusiness(col, resource)
      this.bindColSelect(col, resource)
      this.colsEl.appendChild(col)
      this.cols.push({ resource, content: col })
    }
    canvas.appendChild(this.colsEl)
    this.rootEl.appendChild(canvas)
    this.root.appendChild(this.rootEl)

    this.renderEvents()
  }

  private buildHead(
    groups: Array<{ group: string | null; resources: CalResource[] }>,
    showGroups: boolean,
  ): HTMLElement {
    const head = el('div', 'zc-rg-head')
    const corner = el('div', 'zc-rg-corner')
    head.appendChild(corner)

    const cols = el('div', 'zc-rg-head-cols')
    if (showGroups) {
      const groupRow = el('div', 'zc-rg-group-row')
      for (const bucket of groups) {
        const band = el('div', 'zc-rg-group-band')
        band.style.flex = `${bucket.resources.length} 1 0`
        band.textContent = bucket.group ?? ''
        groupRow.appendChild(band)
      }
      cols.appendChild(groupRow)
    }
    const labelRow = el('div', 'zc-rg-label-row')
    for (const resource of groups.flatMap((g) => g.resources)) {
      const cell = el('div', 'zc-rg-label')
      cell.dataset.resourceId = resource.id
      const custom = this.cal.options.renderResource?.(resource)
      if (custom != null) {
        if (typeof custom === 'string') cell.innerHTML = custom
        else cell.appendChild(custom)
      } else {
        cell.textContent = resource.title
      }
      labelRow.appendChild(cell)
    }
    cols.appendChild(labelRow)
    head.appendChild(cols)
    return head
  }

  private buildAxis(): HTMLElement {
    const axisCol = el('div', 'zc-axis zc-rg-axis')
    axisCol.style.height = `${this.contentHeight}px`
    const axis = this.cal.axis
    for (let m = axis.min; m <= axis.max; m += axis.labelInterval) {
      const label = el('div', 'zc-axis-label')
      label.style.top = `${(m - axis.min) * this.pxPerMinute}px`
      label.textContent = minutesToTime(m)
      axisCol.appendChild(label)
    }
    return axisCol
  }

  private buildNonBusiness(col: HTMLElement, resource: CalResource): void {
    const hours = resource.businessHours.length ? resource.businessHours : this.cal.businessHours
    if (!hours.length) return
    const axis = this.cal.axis
    for (const [s, e] of invertRanges(businessRangesForWeekday(this.cal.date.day(), hours), axis.min, axis.max)) {
      const fill = el('div', 'zc-nonbusiness-fill')
      fill.style.top = `${(s - axis.min) * this.pxPerMinute}px`
      fill.style.height = `${(e - s) * this.pxPerMinute}px`
      col.appendChild(fill)
    }
  }

  private buildSlotLines(col: HTMLElement): void {
    const axis = this.cal.axis
    for (let s = 0; s <= axis.slots; s++) {
      const line = el('div', 'zc-slot-line')
      if ((s * axis.duration) % axis.labelInterval === 0) line.classList.add('zc-slot-major')
      line.style.top = `${s * SLOT_PX}px`
      col.appendChild(line)
    }
  }

  // ---- events --------------------------------------------------------------

  renderEvents(): void {
    if (!this.colsEl) return
    const range = this.range()
    const axis = this.cal.axis
    for (const { resource, content } of this.cols) {
      content.querySelectorAll('.zc-event').forEach((n) => n.remove())
      const packed = packEvents(this.cal.events.inRange(range.start, range.end, resource.id))
      for (const p of packed) {
        const ev = p.event
        const rawStart = dayMinutes(ev.start)
        const rawEnd = dayMinutes(ev.end) || axis.max
        const startMin = clamp(rawStart, axis.min, axis.max)
        const endMin = clamp(rawEnd, axis.min, axis.max)
        const top = (startMin - axis.min) * this.pxPerMinute
        const height = Math.max(SLOT_PX - 2, (endMin - startMin) * this.pxPerMinute)

        const bar = el('div', 'zc-event')
        bar.dataset.eventId = ev.id
        bar.style.top = `${top}px`
        bar.style.height = `${height}px`
        bar.style.left = `calc(${p.left * 100}% + 2px)`
        bar.style.width = `calc(${p.width * 100}% - 4px)`
        if (ev.color) bar.style.setProperty('--zc-event-bg', ev.color)
        if (ev.textColor) bar.style.setProperty('--zc-event-fg', ev.textColor)
        bar.appendChild(this.cal.renderEventContent(ev))
        this.bindBar(bar, ev)
        content.appendChild(bar)
        this.cal.fireEventMount(ev, bar)
      }
    }
    this.renderNowIndicator()
  }

  private renderNowIndicator(): void {
    this.nowLine?.remove()
    this.nowLine = null
    if (!this.cal.options.nowIndicator || !this.colsEl) return
    const now = this.cal.now()
    if (!now.isSame(this.cal.date, 'day')) return
    const axis = this.cal.axis
    const nm = dayMinutes(now)
    if (nm < axis.min || nm > axis.max) return
    this.nowLine = el('div', 'zc-now-indicator zc-rg-now')
    this.nowLine.style.top = `${(nm - axis.min) * this.pxPerMinute}px`
    this.colsEl.appendChild(this.nowLine)
  }

  // ---- interaction ---------------------------------------------------------

  private timeAt(minute: number): Dayjs {
    return this.cal.date.startOf('day').add(minute, 'minute')
  }

  private minuteAtY(clientY: number): number {
    const rect = this.colsEl!.getBoundingClientRect()
    return this.cal.axis.min + (clientY - rect.top) / this.pxPerMinute
  }

  /** The resource column under the pointer (bar ignored for hit-testing). */
  private resourceIdAt(event: MouseEvent, bar: HTMLElement): string | null | undefined {
    const prev = bar.style.pointerEvents
    bar.style.pointerEvents = 'none'
    const target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null
    bar.style.pointerEvents = prev
    const col = target?.closest('.zc-rg-col[data-resource-id]') as HTMLElement | null
    return col ? (col.dataset.resourceId ?? null) : undefined
  }

  private highlightCol(event: MouseEvent, bar: HTMLElement): void {
    this.clearHighlight()
    const prev = bar.style.pointerEvents
    bar.style.pointerEvents = 'none'
    const target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null
    bar.style.pointerEvents = prev
    target?.closest('.zc-rg-col[data-resource-id]')?.classList.add('zc-drop-target')
  }

  private clearHighlight(): void {
    this.colsEl?.querySelectorAll('.zc-drop-target').forEach((n) => n.classList.remove('zc-drop-target'))
  }

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
      const startMinAt = (clientY: number): number =>
        clamp(
          snap(origStartMin + (this.minuteAtY(clientY) - grabMin), axis.duration),
          axis.min,
          axis.max - durMin,
        )
      startDrag(down, {
        onStart: () => bar.classList.add('zc-dragging'),
        onMove: ({ event }) => {
          bar.style.top = `${(startMinAt(event.clientY) - axis.min) * this.pxPerMinute}px`
          this.highlightCol(event, bar)
        },
        onEnd: ({ moved, event }) => {
          bar.classList.remove('zc-dragging')
          this.clearHighlight()
          if (!moved) {
            this.cal.fireEventClick(ev, bar, event)
            return
          }
          const newStart = this.timeAt(startMinAt(event.clientY))
          const newResource = this.resourceIdAt(event, bar) ?? ev.resourceId
          this.cal.commitEventChange(ev, newStart, newStart.add(durMin, 'minute'), newResource)
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

  private bindColSelect(col: HTMLElement, resource: CalResource): void {
    if (!this.cal.selectable) return
    col.addEventListener('pointerdown', (down) => {
      if (down.button !== 0) return
      if ((down.target as HTMLElement).closest('.zc-event')) return
      down.preventDefault()
      const axis = this.cal.axis
      const anchor = clamp(snap(this.minuteAtY(down.clientY), axis.duration), axis.min, axis.max)
      const box = el('div', 'zc-select-box zc-rg-select')
      col.appendChild(box)
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
          this.cal.commitSelect(this.timeAt(lo), this.timeAt(hi), resource, event)
        },
      })
    })
  }

  unmount(): void {
    this.rootEl?.remove()
    this.rootEl = undefined
    this.colsEl = undefined
    this.nowLine = null
    this.cols = []
  }
}
