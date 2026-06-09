import type { Calendar } from '../Calendar'
import type { Dayjs } from 'dayjs'
import type { DateRange, CalEvent, CalResource, ResourceColumn } from '../types'
import { dayMinutes, minutesToTime, intlFormat } from '../datelib'
import { packEvents } from '../layout/overlap'
import { startDrag, snap } from '../interaction/pointer'
import { el, clamp, type View } from './View'

/** Header (time axis / column header) height in px. */
const HEAD_H = 38
/** Group header row height in px. */
const GROUP_H = 26
/** Default minimum height of one stacked event level in px (override via `eventMinHeight`). */
const DEFAULT_EVENT_MIN_H = 48
/** Vertical padding inside a resource row in px. */
const PAD = 4
/** Width of one hour on the time axis in px. */
const HOUR_PX = 90
/** Minimum rendered width of an event bar in px. */
const EVENT_MIN_W = 14

/**
 * Resources-as-rows horizontal timeline.
 *
 * Layout: a sticky resource area (one or more columns) on the left and a
 * horizontally-scrolling time grid on the right. Resources may be grouped; each
 * resource is a row whose height grows to stack overlapping events into levels.
 * Supports drag-move (incl. across resource rows), resize and drag-select when
 * `editable`/`selectable` are set.
 */
export class TimelineView implements View {
  private rootEl?: HTMLElement
  private resourceBody?: HTMLElement
  private resourceRows?: HTMLElement
  private timeHead?: HTMLElement
  private timeBody?: HTMLElement
  private rowsEl?: HTMLElement
  private overlay?: HTMLElement
  private onScroll?: () => void

  constructor(
    private cal: Calendar,
    private root: HTMLElement,
  ) {}

  // ---- geometry ------------------------------------------------------------

  private get pxPerMinute(): number {
    return HOUR_PX / 60
  }

  private get width(): number {
    return this.cal.axis.totalMinutes * this.pxPerMinute
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

  // ---- resource columns ----------------------------------------------------

  private columns(): ResourceColumn[] {
    const configured = this.cal.options.resourceArea?.columns
    if (configured && configured.length) return configured
    // Default: a single column rendering the resource label.
    return [{ field: 'title', header: '' }]
  }

  private applyWidth(node: HTMLElement, width: number | string | undefined, flexFallback = true): void {
    if (width != null) {
      const w = typeof width === 'number' ? `${width}px` : width
      node.style.flex = `0 0 ${w}`
      node.style.width = w
    } else if (flexFallback) {
      node.style.flex = '1 1 0'
    }
  }

  // ---- mount ---------------------------------------------------------------

  mount(): void {
    this.rootEl = el('div', 'zc-timeline')

    // Resource area (sticky left).
    const resourceArea = el('div', 'zc-tl-resource-area')
    this.applyWidth(resourceArea, this.cal.options.resourceArea?.width ?? '25%', false)
    if (this.cal.options.resourceArea?.width == null) resourceArea.style.flex = '0 0 25%'

    const resourceHead = el('div', 'zc-tl-resource-head')
    resourceHead.style.height = `${HEAD_H}px`
    for (const col of this.columns()) {
      const cell = el('div', 'zc-tl-col-head')
      this.applyWidth(cell, col.width)
      cell.textContent = col.header ?? ''
      resourceHead.appendChild(cell)
    }
    this.resourceBody = el('div', 'zc-tl-resource-body')
    this.resourceRows = el('div', 'zc-tl-resource-rows')
    this.resourceBody.appendChild(this.resourceRows)
    resourceArea.append(resourceHead, this.resourceBody)

    // Time area (scrolls horizontally; body scrolls vertically).
    const timeArea = el('div', 'zc-tl-time-area')
    this.timeHead = el('div', 'zc-tl-time-head')
    this.timeHead.style.height = `${HEAD_H}px`
    this.buildAxisHeader(this.timeHead)

    this.timeBody = el('div', 'zc-tl-time-body')
    const canvas = el('div', 'zc-tl-time-canvas')
    canvas.style.width = `${this.width}px`
    this.overlay = el('div', 'zc-tl-overlay')
    this.buildOverlayLines(this.overlay)
    this.rowsEl = el('div', 'zc-tl-rows')
    canvas.append(this.overlay, this.rowsEl)
    this.timeBody.appendChild(canvas)
    timeArea.append(this.timeHead, this.timeBody)

    this.rootEl.append(resourceArea, timeArea)
    this.root.appendChild(this.rootEl)

    // Keep the three scroll planes in sync.
    this.onScroll = () => {
      if (this.resourceBody && this.timeBody) this.resourceBody.scrollTop = this.timeBody.scrollTop
      if (this.timeHead && this.timeBody) this.timeHead.scrollLeft = this.timeBody.scrollLeft
    }
    this.timeBody.addEventListener('scroll', this.onScroll, { passive: true })

    this.relayout()
  }

  private buildAxisHeader(head: HTMLElement): void {
    const inner = el('div', 'zc-tl-axis')
    inner.style.width = `${this.width}px`
    const axis = this.cal.axis
    for (let m = axis.min; m <= axis.max; m += axis.labelInterval) {
      const label = el('div', 'zc-tl-axis-label')
      label.style.left = `${(m - axis.min) * this.pxPerMinute}px`
      label.textContent = minutesToTime(m)
      inner.appendChild(label)
    }
    head.appendChild(inner)
  }

  private buildOverlayLines(overlay: HTMLElement): void {
    const axis = this.cal.axis
    for (let m = axis.min; m <= axis.max; m += axis.labelInterval) {
      const line = el('div', 'zc-tl-vline')
      line.style.left = `${(m - axis.min) * this.pxPerMinute}px`
      overlay.appendChild(line)
    }
  }

  // ---- layout (rows + events) ---------------------------------------------

  renderEvents(): void {
    this.relayout()
  }

  /** Rebuild rows in both panes from the current resources + events. */
  private relayout(): void {
    if (!this.resourceRows || !this.rowsEl) return
    this.resourceRows.innerHTML = ''
    this.rowsEl.innerHTML = ''

    const range = this.range()
    const groups = this.cal.resources.grouped()
    const showGroupHeaders = groups.length > 1 || groups.some((g) => g.group !== null)

    for (const bucket of groups) {
      if (showGroupHeaders && bucket.group !== null) {
        this.appendGroupRow(bucket.group)
      }
      for (const resource of bucket.resources) {
        const events = this.cal.events.inRange(range.start, range.end, resource.id)
        this.appendResourceRow(resource, events)
      }
    }

    this.renderNowIndicator()
  }

  private appendGroupRow(label: string): void {
    const r = el('div', 'zc-tl-resource-row zc-tl-group-row')
    r.style.height = `${GROUP_H}px`
    r.textContent = label
    this.resourceRows!.appendChild(r)

    const t = el('div', 'zc-tl-row zc-tl-group-spacer')
    t.style.height = `${GROUP_H}px`
    this.rowsEl!.appendChild(t)
  }

  private appendResourceRow(resource: CalResource, events: CalEvent[]): void {
    const packed = packEvents(events)
    const levels = packed.reduce((max, p) => Math.max(max, p.cols), 1)
    // Each stacked level keeps at least eventMinHeight, so the row grows with the
    // number of overlapping events instead of squashing them together.
    const eventMinH = this.cal.options.eventMinHeight ?? DEFAULT_EVENT_MIN_H
    const rowH = levels * eventMinH + 2 * PAD
    const levelH = eventMinH

    // Resource-area row: one cell per column.
    const rRow = el('div', 'zc-tl-resource-row')
    rRow.style.height = `${rowH}px`
    rRow.dataset.resourceId = resource.id
    for (const col of this.columns()) {
      const cell = el('div', 'zc-tl-col-cell')
      this.applyWidth(cell, col.width)
      this.fillResourceCell(cell, col, resource)
      rRow.appendChild(cell)
    }
    this.resourceRows!.appendChild(rRow)

    // Time-grid row: event bars positioned along the x-axis.
    const tRow = el('div', 'zc-tl-row')
    tRow.style.height = `${rowH}px`
    tRow.dataset.resourceId = resource.id
    const axis = this.cal.axis
    for (const p of packed) {
      const ev = p.event
      const rawStart = dayMinutes(ev.start)
      let rawEnd = dayMinutes(ev.end)
      if (rawEnd <= rawStart) rawEnd = axis.max
      const startMin = clamp(rawStart, axis.min, axis.max)
      const endMin = clamp(rawEnd, axis.min, axis.max)
      if (endMin <= axis.min || startMin >= axis.max) continue

      const x = (startMin - axis.min) * this.pxPerMinute
      const w = Math.max(EVENT_MIN_W, (endMin - startMin) * this.pxPerMinute)
      const top = PAD + p.col * levelH

      const bar = el('div', 'zc-event zc-tl-event')
      bar.dataset.eventId = ev.id
      bar.style.left = `${x}px`
      bar.style.width = `${Math.min(w, this.width - x)}px`
      bar.style.top = `${top}px`
      bar.style.height = `${levelH - 2}px`
      if (ev.color) bar.style.setProperty('--zc-event-bg', ev.color)
      if (ev.textColor) bar.style.setProperty('--zc-event-fg', ev.textColor)
      bar.appendChild(this.cal.renderEventContent(ev))
      this.bindBar(bar, ev)
      tRow.appendChild(bar)
      this.cal.fireEventMount(ev, bar)
    }
    this.bindRowSelect(tRow, resource)
    this.rowsEl!.appendChild(tRow)
  }

  // ---- interaction ---------------------------------------------------------

  private timeAt(minute: number): Dayjs {
    return this.cal.date.startOf('day').add(minute, 'minute')
  }

  private minuteAtX(clientX: number): number {
    const rect = this.rowsEl!.getBoundingClientRect()
    return this.cal.axis.min + (clientX - rect.left) / this.pxPerMinute
  }

  /** The resource row currently under the pointer (bar ignored for hit-testing). */
  private rowAt(event: MouseEvent, bar: HTMLElement): HTMLElement | null {
    const prev = bar.style.pointerEvents
    bar.style.pointerEvents = 'none'
    const target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null
    bar.style.pointerEvents = prev
    return (target?.closest('.zc-tl-row[data-resource-id]') as HTMLElement | null) ?? null
  }

  private highlightRow(event: MouseEvent, bar: HTMLElement): void {
    this.clearHighlight()
    this.rowAt(event, bar)?.classList.add('zc-drop-target')
  }

  private clearHighlight(): void {
    this.rowsEl?.querySelectorAll('.zc-drop-target').forEach((n) => n.classList.remove('zc-drop-target'))
  }

  private bindBar(bar: HTMLElement, ev: CalEvent): void {
    this.cal.bindContextMenu(bar, ev)
    if (!this.cal.editable) {
      bar.addEventListener('click', (jsEvent) => this.cal.fireEventClick(ev, bar, jsEvent))
      return
    }
    bar.style.cursor = 'move'

    const west = el('div', 'zc-resize-handle zc-resize-w')
    const east = el('div', 'zc-resize-handle zc-resize-e')
    bar.append(west, east)
    west.addEventListener('pointerdown', (down) => this.beginResize(down, bar, ev, 'start'))
    east.addEventListener('pointerdown', (down) => this.beginResize(down, bar, ev, 'end'))

    bar.addEventListener('pointerdown', (down) => {
      if (down.button !== 0) return
      if ((down.target as HTMLElement).closest('.zc-resize-handle')) return
      down.preventDefault()
      const axis = this.cal.axis
      const durMin = ev.end.diff(ev.start, 'minute')
      const origStartMin = dayMinutes(ev.start)
      const grabMin = this.minuteAtX(down.clientX)
      const startMinAt = (clientX: number): number =>
        clamp(
          snap(origStartMin + (this.minuteAtX(clientX) - grabMin), axis.duration),
          axis.min,
          axis.max - durMin,
        )
      startDrag(down, {
        onStart: () => bar.classList.add('zc-dragging'),
        onMove: ({ event }) => {
          bar.style.left = `${(startMinAt(event.clientX) - axis.min) * this.pxPerMinute}px`
          this.highlightRow(event, bar)
        },
        onEnd: ({ moved, event }) => {
          bar.classList.remove('zc-dragging')
          this.clearHighlight()
          if (!moved) {
            this.cal.fireEventClick(ev, bar, event)
            return
          }
          const row = this.rowAt(event, bar)
          const newResource = row ? (row.dataset.resourceId ?? null) : ev.resourceId
          const newStart = this.timeAt(startMinAt(event.clientX))
          this.cal.commitEventChange(ev, newStart, newStart.add(durMin, 'minute'), newResource)
        },
      })
    })
  }

  private beginResize(down: MouseEvent, bar: HTMLElement, ev: CalEvent, edge: 'start' | 'end'): void {
    if (down.button !== 0) return
    down.stopPropagation()
    down.preventDefault()
    const axis = this.cal.axis
    const minuteAt = (clientX: number) => clamp(snap(this.minuteAtX(clientX), axis.duration), axis.min, axis.max)
    startDrag(down, {
      onStart: () => bar.classList.add('zc-dragging'),
      onMove: ({ event }) => {
        const m = minuteAt(event.clientX)
        if (edge === 'end') {
          const endMin = Math.max(m, dayMinutes(ev.start) + axis.duration)
          bar.style.width = `${(endMin - dayMinutes(ev.start)) * this.pxPerMinute}px`
        } else {
          const startMin = Math.min(m, dayMinutes(ev.end) - axis.duration)
          bar.style.left = `${(startMin - axis.min) * this.pxPerMinute}px`
          bar.style.width = `${(dayMinutes(ev.end) - startMin) * this.pxPerMinute}px`
        }
      },
      onEnd: ({ moved, event }) => {
        bar.classList.remove('zc-dragging')
        if (!moved) return
        const m = minuteAt(event.clientX)
        if (edge === 'end') {
          const endMin = Math.max(m, dayMinutes(ev.start) + axis.duration)
          this.cal.commitEventChange(ev, ev.start, this.timeAt(endMin), ev.resourceId)
        } else {
          const startMin = Math.min(m, dayMinutes(ev.end) - axis.duration)
          this.cal.commitEventChange(ev, this.timeAt(startMin), ev.end, ev.resourceId)
        }
      },
    })
  }

  private bindRowSelect(tRow: HTMLElement, resource: CalResource): void {
    if (!this.cal.selectable) return
    tRow.addEventListener('pointerdown', (down) => {
      if (down.button !== 0) return
      if ((down.target as HTMLElement).closest('.zc-event')) return
      down.preventDefault()
      const axis = this.cal.axis
      const anchor = clamp(snap(this.minuteAtX(down.clientX), axis.duration), axis.min, axis.max)
      const box = el('div', 'zc-select-box zc-tl-select')
      tRow.appendChild(box)
      const place = (clientX: number) => {
        const cur = clamp(snap(this.minuteAtX(clientX), axis.duration), axis.min, axis.max)
        const lo = Math.min(anchor, cur)
        const hi = Math.max(anchor, cur)
        box.style.left = `${(lo - axis.min) * this.pxPerMinute}px`
        box.style.width = `${(hi - lo) * this.pxPerMinute}px`
      }
      startDrag(down, {
        onMove: ({ event }) => place(event.clientX),
        onEnd: ({ moved, event }) => {
          box.remove()
          if (!moved) return
          const cur = clamp(snap(this.minuteAtX(event.clientX), axis.duration), axis.min, axis.max)
          let lo = Math.min(anchor, cur)
          let hi = Math.max(anchor, cur)
          if (hi <= lo) hi = Math.min(lo + axis.duration, axis.max)
          if (hi <= lo) return
          this.cal.commitSelect(this.timeAt(lo), this.timeAt(hi), resource, event)
        },
      })
    })
  }

  private fillResourceCell(cell: HTMLElement, col: ResourceColumn, resource: CalResource): void {
    if (col.render) {
      const out = col.render(resource)
      if (typeof out === 'string') cell.innerHTML = out
      else cell.appendChild(out)
      return
    }
    // The label column defers to the renderResource hook when present.
    if ((col.field === 'title' || !col.field) && this.cal.options.renderResource) {
      const out = this.cal.options.renderResource(resource)
      if (typeof out === 'string') cell.innerHTML = out
      else cell.appendChild(out)
      return
    }
    const value = col.field ? resource.raw[col.field] : resource.title
    cell.textContent = value != null ? String(value) : ''
  }

  private renderNowIndicator(): void {
    this.overlay?.querySelector('.zc-tl-now')?.remove()
    if (!this.cal.options.nowIndicator || !this.overlay) return
    const now = this.cal.now()
    if (!now.isSame(this.cal.date, 'day')) return
    const axis = this.cal.axis
    const nm = dayMinutes(now)
    if (nm < axis.min || nm > axis.max) return
    const line = el('div', 'zc-tl-now')
    line.style.left = `${(nm - axis.min) * this.pxPerMinute}px`
    this.overlay.appendChild(line)
  }

  unmount(): void {
    if (this.onScroll) this.timeBody?.removeEventListener('scroll', this.onScroll)
    this.rootEl?.remove()
    this.rootEl = undefined
    this.resourceBody = undefined
    this.resourceRows = undefined
    this.timeHead = undefined
    this.timeBody = undefined
    this.rowsEl = undefined
    this.overlay = undefined
    this.onScroll = undefined
  }
}
