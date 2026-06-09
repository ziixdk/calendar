import type { Dayjs } from 'dayjs'

/** Built-in view identifiers. */
export type ViewType = 'day' | 'resource-day' | 'timeline'

/** A start/end window expressed in the calendar's timezone. */
export interface DateRange {
  start: Dayjs
  end: Dayjs
}

/** Vertical/horizontal time-axis configuration. */
export interface SlotConfig {
  /** Slot granularity in minutes (default 15). */
  duration?: number
  /** First visible time as 'HH:mm' (default '00:00'). */
  min?: string
  /** Last visible time as 'HH:mm', '24:00' allowed (default '24:00'). */
  max?: string
  /** Minutes between axis labels (default 60). */
  labelInterval?: number
}

/** Raw event as supplied by the host application. */
export interface EventInput {
  id: string | number
  title?: string
  start: string | Date
  end?: string | Date
  resourceId?: string | number
  allDay?: boolean
  /** Background colour (any CSS colour). */
  color?: string
  /** Foreground/text colour. */
  textColor?: string
  /** Arbitrary domain data forwarded to renderEvent and callbacks. */
  extendedProps?: Record<string, unknown>
  [key: string]: unknown
}

/** Raw resource as supplied by the host application. */
export interface ResourceInput {
  id: string | number
  title?: string
  group?: string
  order?: number
  [key: string]: unknown
}

/** Normalised event used internally and exposed to callbacks. */
export interface CalEvent {
  id: string
  title: string
  start: Dayjs
  end: Dayjs
  resourceId: string | null
  allDay: boolean
  color?: string
  textColor?: string
  extendedProps: Record<string, unknown>
  /** The original, untouched input. */
  raw: EventInput
}

/** Normalised resource used internally and exposed to callbacks. */
export interface CalResource {
  id: string
  title: string
  group: string | null
  order: number
  raw: ResourceInput
}

/** Locale strings and behaviour. */
export interface Locale {
  /** BCP-47-ish code, e.g. 'da'. */
  code: string
  /** Day the week starts on (0 = Sunday). Overrides `firstDay` option when set. */
  firstDay?: number
  /** Toolbar button labels. */
  buttons?: { today?: string; prev?: string; next?: string }
  /** Intl locale tag for date formatting; defaults to `code`. */
  intl?: string
}

export interface ToolbarConfig {
  start?: string
  center?: string
  end?: string
}

export interface CustomButton {
  text?: string
  /** CSS class for an icon span (e.g. an icon-font class). */
  icon?: string
  onClick: (jsEvent: MouseEvent) => void
}

export interface ResourceColumn {
  /** Resource field to read for a plain-text cell. */
  field?: string
  /** Column header text. */
  header?: string
  width?: number | string
  /** Custom cell renderer; takes precedence over `field`. */
  render?: (resource: CalResource) => HTMLElement | string
}

export interface ResourceAreaConfig {
  width?: number | string
  columns?: ResourceColumn[]
}

export type EventSource =
  | EventInput[]
  | ((range: DateRange) => EventInput[] | Promise<EventInput[]>)

export type ResourceSource =
  | ResourceInput[]
  | ((range: DateRange) => ResourceInput[] | Promise<ResourceInput[]>)

export interface SelectInfo {
  start: Dayjs
  end: Dayjs
  resource: CalResource | null
  jsEvent: MouseEvent | PointerEvent
}

export interface EventClickInfo {
  event: CalEvent
  el: HTMLElement
  jsEvent: MouseEvent
}

export interface EventContextMenuInfo {
  event: CalEvent
  el: HTMLElement
  /** The contextmenu event; `preventDefault()` has already been called. */
  jsEvent: MouseEvent
}

export interface EventMountInfo {
  event: CalEvent
  el: HTMLElement
}

export interface EventChangeInfo {
  event: CalEvent
  oldEvent: CalEvent
}

export interface DatesSetInfo {
  start: Dayjs
  end: Dayjs
  view: ViewType
}

/** Handle returned by addEvent/getEventById, mirroring the imperative API hosts rely on. */
export interface EventHandle {
  id: string
  event: CalEvent
  remove(): void
  setExtendedProp(key: string, value: unknown): void
}

export interface CalendarOptions {
  view?: ViewType
  date?: string | Date
  locale?: Locale | string
  timezone?: string
  firstDay?: number
  weekends?: boolean
  slot?: SlotConfig
  /** Intl options for the default event time rendering. */
  timeFormat?: Intl.DateTimeFormatOptions
  nowIndicator?: boolean
  editable?: boolean
  selectable?: boolean
  height?: number | string
  /**
   * Minimum height (px) of a single stacked event in the timeline. The resource
   * row grows to `levels × eventMinHeight` so overlapping events keep this height
   * instead of being squashed. Default 48.
   */
  eventMinHeight?: number
  toolbar?: ToolbarConfig | false
  buttons?: Record<string, CustomButton>
  resources?: ResourceSource
  resourceArea?: ResourceAreaConfig
  resourceGroupField?: string
  resourceOrder?: string
  events?: EventSource
  /** Custom event body renderer. Return a string (innerHTML) or a node. */
  renderEvent?: (event: CalEvent) => HTMLElement | string
  /** Custom resource label renderer. */
  renderResource?: (resource: CalResource) => HTMLElement | string
  eventOverlap?: boolean | (() => boolean)
  selectAllow?: (info: { start: Dayjs; end: Dayjs; resource: CalResource | null }) => boolean
  onEventClick?: (info: EventClickInfo) => void
  /** Right-click on an event. The native menu is suppressed before this fires. */
  onEventContextMenu?: (info: EventContextMenuInfo) => void
  onEventChange?: (info: EventChangeInfo) => void
  onSelect?: (info: SelectInfo) => void
  onDatesSet?: (info: DatesSetInfo) => void
  onEventMount?: (info: EventMountInfo) => void
  onEventsSet?: (events: CalEvent[]) => void
}
