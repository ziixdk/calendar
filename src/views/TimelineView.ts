import type { Calendar } from '../Calendar'
import type { DateRange, CalEvent, CalResource, ResourceColumn } from '../types'
import { dayMinutes, minutesToTime, intlFormat } from '../datelib'
import { packEvents } from '../layout/overlap'
import { el, clamp, type View } from './View'

/** Header (time axis / column header) height in px. */
const HEAD_H = 38
/** Group header row height in px. */
const GROUP_H = 26
/** Minimum resource row height in px. */
const ROW_MIN = 56
/** Minimum height of one stacked event level in px. */
const LEVEL_MIN = 28
/** Vertical padding inside a resource row in px. */
const PAD = 4
/** Width of one hour on the time axis in px. */
const HOUR_PX = 90
/** Minimum rendered width of an event bar in px. */
const EVENT_MIN_W = 14

/**
 * Resources-as-rows horizontal timeline (the `resourceTimeline` equivalent).
 *
 * Layout: a sticky resource area (one or more columns) on the left and a
 * horizontally-scrolling time grid on the right. Resources may be grouped; each
 * resource is a row whose height grows to stack overlapping events into levels.
 * Read-only in this build — drag/resize/select arrive with the interaction
 * engine (Fase 4).
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
    const rowH = Math.max(ROW_MIN, levels * LEVEL_MIN + 2 * PAD)
    const levelH = (rowH - 2 * PAD) / levels

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
      bar.addEventListener('click', (jsEvent) =>
        this.cal.fireEventClick(ev, bar, jsEvent as MouseEvent),
      )
      tRow.appendChild(bar)
      this.cal.fireEventMount(ev, bar)
    }
    this.rowsEl!.appendChild(tRow)
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
