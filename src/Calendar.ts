import type { Dayjs } from 'dayjs'
import type {
  CalendarOptions,
  ViewType,
  CalEvent,
  CalResource,
  EventInput,
  EventHandle,
  ResourceHandle,
  Locale,
  ToolbarConfig,
  BusinessHours,
} from './types'
import { EventStore } from './store/EventStore'
import { ResourceStore } from './store/ResourceStore'
import { buildAxis, nowTz, toTz, intlFormat } from './datelib'
import type { SlotAxis } from './datelib'
import type { View } from './views/View'
import { DayView } from './views/DayView'
import { ResourceDayView } from './views/ResourceDayView'
import { TimelineView } from './views/TimelineView'

// Neutral English defaults — every label is overridable via the `locale` option,
// so a host app passes its own translations in.
const DEFAULT_LOCALE: Locale = {
  code: 'en',
  buttons: { today: 'Today', prev: '‹', next: '›' },
  ariaLabels: { today: 'Today', prev: 'Previous', next: 'Next' },
}

const DEFAULT_TOOLBAR: ToolbarConfig = { start: '', center: 'title', end: 'today prev next' }

/**
 * The public, framework-agnostic calendar. Construct with a host element and
 * options, then `render()`. Mirrors the imperative surface hosts rely on
 * (render/destroy/refetchEvents/addEvent/getEventById/gotoDate/changeView/…) so
 * Preact and React callers can drive it through a ref.
 */
export class Calendar {
  readonly el: HTMLElement
  options: CalendarOptions
  readonly events: EventStore
  readonly resources: ResourceStore

  private _date: Dayjs
  private _view: ViewType
  private viewImpl: View | null = null
  private bodyEl: HTMLElement | null = null
  private titleEl: HTMLElement | null = null

  constructor(el: HTMLElement, options: CalendarOptions = {}) {
    this.el = el
    this.options = options
    this.events = new EventStore(options.timezone)
    this.resources = new ResourceStore(
      options.resourceGroupField ?? 'group',
      options.resourceOrder ?? 'order',
    )
    this._view = options.view ?? 'day'
    this._date = options.date ? toTz(options.date, options.timezone) : nowTz(options.timezone)
    if (Array.isArray(options.resources)) this.resources.set(options.resources)
    if (Array.isArray(options.events)) this.events.set(options.events)
  }

  // ---- derived state -------------------------------------------------------

  get tz(): string | undefined {
    return this.options.timezone
  }

  get date(): Dayjs {
    return this._date
  }

  get view(): ViewType {
    return this._view
  }

  get axis(): SlotAxis {
    return buildAxis(this.options.slot)
  }

  get locale(): Locale {
    const l = this.options.locale
    if (!l) return DEFAULT_LOCALE
    if (typeof l === 'string') return { ...DEFAULT_LOCALE, code: l }
    return {
      ...DEFAULT_LOCALE,
      ...l,
      buttons: { ...DEFAULT_LOCALE.buttons, ...l.buttons },
      ariaLabels: { ...DEFAULT_LOCALE.ariaLabels, ...l.ariaLabels },
    }
  }

  get firstDay(): number {
    return this.locale.firstDay ?? this.options.firstDay ?? 1
  }

  /** Start of the currently-shown view range, in the calendar timezone. */
  get activeStart(): Dayjs {
    return this.viewImpl?.range().start ?? this._date.startOf('day')
  }

  /** End of the currently-shown view range. */
  get activeEnd(): Dayjs {
    return this.viewImpl?.range().end ?? this._date.endOf('day')
  }

  /** The active view's type and date window. */
  getView(): { type: ViewType; activeStart: Dayjs; activeEnd: Dayjs } {
    return { type: this._view, activeStart: this.activeStart, activeEnd: this.activeEnd }
  }

  /** Default business hours (normalised to an array). */
  get businessHours(): BusinessHours[] {
    const b = this.options.businessHours
    if (!b) return []
    return Array.isArray(b) ? b : [b]
  }

  private isDayClosed(): boolean {
    const d = this.options.dayClosed
    if (d === undefined) return false
    return typeof d === 'function' ? d(this._date) : d
  }

  get editable(): boolean {
    return this.options.editable === true
  }

  get selectable(): boolean {
    return this.options.selectable === true
  }

  now(): Dayjs {
    return nowTz(this.tz)
  }

  // ---- lifecycle -----------------------------------------------------------

  render(): this {
    this.el.classList.add('zc')
    this.el.innerHTML = ''
    if (this.options.height != null) {
      this.el.style.height =
        typeof this.options.height === 'number' ? `${this.options.height}px` : this.options.height
    }
    this.renderToolbar()
    this.bodyEl = document.createElement('div')
    this.bodyEl.className = 'zc-body'
    this.el.appendChild(this.bodyEl)
    this.mountView()
    void this.reload()
    return this
  }

  destroy(): void {
    this.viewImpl?.unmount()
    this.viewImpl = null
    this.el.innerHTML = ''
    this.el.classList.remove('zc')
  }

  // ---- views ---------------------------------------------------------------

  private createView(type: ViewType): View {
    const root = this.bodyEl
    if (!root) throw new Error('[@ziix/calendar] render() must run before a view is created')
    switch (type) {
      case 'day':
        return new DayView(this, root)
      case 'resource-day':
        return new ResourceDayView(this, root)
      case 'timeline':
        return new TimelineView(this, root)
      default:
        throw new Error(`[@ziix/calendar] unknown view: ${String(type)}`)
    }
  }

  private mountView(): void {
    if (!this.bodyEl) return
    this.viewImpl?.unmount()
    this.bodyEl.innerHTML = ''
    this.viewImpl = this.createView(this._view)
    this.viewImpl.mount()
    this.bodyEl.classList.toggle('zc-closed', this.isDayClosed())
    this.updateTitle()
    this.emitDatesSet()
  }

  changeView(type: ViewType): void {
    this._view = type
    this.mountView()
    void this.reload()
  }

  // ---- navigation ----------------------------------------------------------

  gotoDate(date: string | Date | Dayjs): void {
    this._date = toTz(date as string | Date, this.tz)
    this.mountView()
    void this.reload()
  }

  today(): void {
    this.gotoDate(this.now())
  }

  prev(): void {
    this.gotoDate(this._date.subtract(1, 'day'))
  }

  next(): void {
    this.gotoDate(this._date.add(1, 'day'))
  }

  // ---- data ----------------------------------------------------------------

  /** Refetch resources (if a function source), rebuild structure, then events. */
  async reload(): Promise<void> {
    if (typeof this.options.resources === 'function') {
      await this.refetchResources()
      this.mountView()
    }
    await this.refetchEvents()
  }

  private async refetchResources(): Promise<void> {
    const src = this.options.resources
    if (typeof src !== 'function') return
    const range = this.viewImpl?.range()
    if (!range) return
    this.resources.set(await src(range))
  }

  async refetchEvents(): Promise<void> {
    const src = this.options.events
    const range = this.viewImpl?.range()
    if (typeof src === 'function' && range) {
      this.events.set(await src(range))
    }
    this.options.onEventsSet?.(this.events.all())
    this.viewImpl?.renderEvents()
  }

  addEvent(input: EventInput): EventHandle {
    const e = this.events.add(input)
    this.viewImpl?.renderEvents()
    return this.handle(e)
  }

  getEventById(id: string | number): EventHandle | null {
    const e = this.events.get(id)
    return e ? this.handle(e) : null
  }

  getEvents(): CalEvent[] {
    return this.events.all()
  }

  getResources(): CalResource[] {
    return this.resources.all()
  }

  getResourceById(id: string | number): ResourceHandle | null {
    const r = this.resources.get(id)
    return r ? this.resourceHandle(r) : null
  }

  private resourceRenderScheduled = false

  /**
   * Coalesce resource-area re-renders: many setExtendedProp calls in a row (e.g.
   * pushing work hours / punch-ins for every resource) collapse into a single
   * cell update on the next microtask, and event bars are never rebuilt — so the
   * timeline doesn't flicker.
   */
  private scheduleResourceRender(): void {
    if (this.resourceRenderScheduled) return
    this.resourceRenderScheduled = true
    queueMicrotask(() => {
      this.resourceRenderScheduled = false
      if (this.viewImpl?.renderResources) this.viewImpl.renderResources()
      else this.viewImpl?.renderEvents()
    })
  }

  private resourceHandle(r: CalResource): ResourceHandle {
    return {
      id: r.id,
      resource: r,
      setExtendedProp: (key, value) => {
        r.extendedProps[key] = value
        this.scheduleResourceRender()
      },
      setProp: (key, value) => {
        if (key === 'title') r.title = value
        else r.group = value
        this.scheduleResourceRender()
      },
    }
  }

  private handle(e: CalEvent): EventHandle {
    return {
      id: e.id,
      event: e,
      remove: () => {
        this.events.remove(e.id)
        this.viewImpl?.renderEvents()
      },
      setExtendedProp: (key, value) => {
        e.extendedProps[key] = value
        this.viewImpl?.renderEvents()
      },
    }
  }

  // ---- rendering helpers used by views ------------------------------------

  /** Build the inner body of an event, honouring the `renderEvent` hook. */
  renderEventContent(event: CalEvent): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'zc-event-main'
    const custom = this.options.renderEvent?.(event)
    if (custom != null) {
      if (typeof custom === 'string') wrap.innerHTML = custom
      else wrap.appendChild(custom)
    } else {
      wrap.appendChild(this.defaultEventContent(event))
    }
    return wrap
  }

  private defaultEventContent(event: CalEvent): HTMLElement {
    const frag = document.createElement('div')
    frag.className = 'zc-event-default'
    const time = document.createElement('span')
    time.className = 'zc-event-time'
    const fmt = this.options.timeFormat ?? { hour: '2-digit', minute: '2-digit', hour12: false }
    time.textContent = intlFormat(event.start, fmt, this.locale.intl ?? this.locale.code, this.tz)
    const title = document.createElement('span')
    title.className = 'zc-event-title'
    title.textContent = event.title
    frag.append(time, title)
    return frag
  }

  // ---- callback dispatch (called by views) --------------------------------

  fireEventClick(event: CalEvent, el: HTMLElement, jsEvent: MouseEvent): void {
    this.options.onEventClick?.({ event, el, jsEvent })
  }

  fireEventMount(event: CalEvent, el: HTMLElement): void {
    this.options.onEventMount?.({ event, el })
  }

  /** Attach a right-click handler to an event bar when `onEventContextMenu` is set. */
  bindContextMenu(el: HTMLElement, event: CalEvent): void {
    const handler = this.options.onEventContextMenu
    if (!handler) return
    el.addEventListener('contextmenu', (jsEvent) => {
      jsEvent.preventDefault()
      handler({ event, el, jsEvent })
    })
  }

  /** Whether events are allowed to overlap on the same resource (default true). */
  private allowsOverlap(): boolean {
    const o = this.options.eventOverlap
    if (o === undefined) return true
    return typeof o === 'function' ? o() : o
  }

  private hasCollision(event: CalEvent, start: Dayjs, end: Dayjs, resourceId: string | null): boolean {
    return this.events
      .all()
      .some(
        (e) =>
          e.id !== event.id &&
          e.resourceId === resourceId &&
          e.start.isBefore(end) &&
          e.end.isAfter(start),
      )
  }

  /**
   * Apply a drag/resize result: gate on `eventOverlap`, mutate the event,
   * re-render, and fire `onEventChange`. Returns false (and reverts the live
   * preview by re-rendering) when the move is rejected.
   */
  commitEventChange(
    event: CalEvent,
    start: Dayjs,
    end: Dayjs,
    resourceId: string | null,
  ): boolean {
    const unchanged =
      event.start.isSame(start) && event.end.isSame(end) && event.resourceId === resourceId
    if (unchanged) {
      this.viewImpl?.renderEvents()
      return false
    }
    if (!this.allowsOverlap() && this.hasCollision(event, start, end, resourceId)) {
      this.viewImpl?.renderEvents()
      return false
    }
    const oldEvent: CalEvent = { ...event }
    event.start = start
    event.end = end
    event.resourceId = resourceId
    this.viewImpl?.renderEvents()
    const revert = () => {
      event.start = oldEvent.start
      event.end = oldEvent.end
      event.resourceId = oldEvent.resourceId
      this.viewImpl?.renderEvents()
    }
    this.options.onEventChange?.({ event, oldEvent, revert })
    return true
  }

  /** Gate a drag-selection on `selectAllow`, then fire `onSelect`. */
  commitSelect(start: Dayjs, end: Dayjs, resource: CalResource | null, jsEvent: MouseEvent): boolean {
    if (this.options.selectAllow && !this.options.selectAllow({ start, end, resource })) return false
    this.options.onSelect?.({ start, end, resource, jsEvent })
    return true
  }

  // ---- toolbar -------------------------------------------------------------

  private renderToolbar(): void {
    if (this.options.toolbar === false) return
    const cfg = this.options.toolbar ?? DEFAULT_TOOLBAR
    const toolbar = document.createElement('div')
    toolbar.className = 'zc-toolbar'
    for (const section of ['start', 'center', 'end'] as const) {
      const sec = document.createElement('div')
      sec.className = `zc-toolbar-section zc-toolbar-${section}`
      const spec = cfg[section]
      if (spec) {
        // Whitespace separates button groups (gap between them); commas join
        // buttons within a group with no gap — e.g. 'today prev,next'.
        for (const group of spec.split(/\s+/).filter(Boolean)) {
          const tokens = group.split(',').filter(Boolean)
          if (tokens.length === 1 && tokens[0] === 'title') {
            sec.appendChild(this.renderToolbarToken('title'))
            continue
          }
          const groupEl = document.createElement('div')
          groupEl.className = 'zc-btn-group'
          for (const token of tokens) groupEl.appendChild(this.renderToolbarToken(token))
          sec.appendChild(groupEl)
        }
      }
      toolbar.appendChild(sec)
    }
    this.el.appendChild(toolbar)
  }

  private renderToolbarToken(token: string): HTMLElement {
    if (token === 'title') {
      this.titleEl = document.createElement('h2')
      this.titleEl.className = 'zc-title'
      return this.titleEl
    }
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'zc-btn'
    btn.dataset.zcButton = token
    const labels = this.locale.buttons ?? {}
    const aria = this.locale.ariaLabels ?? {}
    if (token === 'today') {
      btn.textContent = labels.today ?? 'Today'
      if (aria.today) btn.setAttribute('aria-label', aria.today)
      btn.onclick = () => this.today()
    } else if (token === 'prev') {
      btn.textContent = labels.prev ?? '‹'
      btn.setAttribute('aria-label', aria.prev ?? 'Previous')
      btn.onclick = () => this.prev()
    } else if (token === 'next') {
      btn.textContent = labels.next ?? '›'
      btn.setAttribute('aria-label', aria.next ?? 'Next')
      btn.onclick = () => this.next()
    } else {
      const custom = this.options.buttons?.[token]
      if (custom) {
        if (custom.icon) {
          const icon = document.createElement('span')
          icon.className = custom.icon
          btn.appendChild(icon)
        }
        if (custom.text) btn.appendChild(document.createTextNode(custom.text))
        btn.onclick = (jsEvent) => custom.onClick(jsEvent)
      } else {
        btn.textContent = token
      }
    }
    return btn
  }

  private updateTitle(): void {
    if (this.titleEl) this.titleEl.textContent = this.viewImpl?.title() ?? ''
  }

  private emitDatesSet(): void {
    const r = this.viewImpl?.range()
    if (r) this.options.onDatesSet?.({ start: r.start, end: r.end, view: this._view })
  }
}
