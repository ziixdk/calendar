# @ziix/calendar

A framework-agnostic resource & time-grid calendar — a from-scratch, **license-free**
replacement for the FullCalendar views DMS uses (`timeGridDay`, `resourceTimeGridDay`,
`resourceTimeline`). No premium scheduler licence, no React/Vue/Preact dependency: a
plain imperative class you drive through a ref from any framework.

> **Status: early.** Fase 0 (core), Fase 1 (day view) and Fase 3 (timeline view) are
> implemented. The `resource-day` view and the drag/resize/select interaction engine are
> on the roadmap below and currently throw a clear "not implemented yet" error.

## Install

```bash
npm install @ziix/calendar dayjs
```

`dayjs` is a peer dependency (the calendar uses it for timezone-correct date math).

## Quick start

```js
import { Calendar } from '@ziix/calendar'
import '@ziix/calendar/styles.css'

const cal = new Calendar(document.getElementById('calendar'), {
  view: 'day',
  timezone: 'Europe/Copenhagen', // events are placed in the shop's clock, not the browser's
  date: '2026-06-09',
  height: 780,
  slot: { duration: 15, min: '06:00', max: '19:00', labelInterval: 60 },
  nowIndicator: true,
  locale: { code: 'da', intl: 'da-DK', firstDay: 1 },
  events: [
    { id: 1, title: 'Service', start: '2026-06-09T08:00:00+02:00', end: '2026-06-09T09:00:00+02:00' },
  ],
  onEventClick: ({ event }) => console.log('clicked', event.title),
})

cal.render()
```

The host element gets a `.zc` class and owns its own height (set `height`, or give the
element a height in CSS). Call `cal.destroy()` when you tear the component down.

### Loading events from a server

`events` may be an array (above) **or** a function that receives the visible range and
returns events — it re-runs automatically on navigation:

```js
events: async ({ start, end }) => {
  // start / end are Dayjs objects in the calendar timezone
  const res = await fetch(`/calendar/events?from=${start.toISOString()}&to=${end.toISOString()}`)
  return (await res.json()).events
}
```

## Timeline view (resources as rows)

This is the `resourceTimeline` replacement: a sticky resource area on the left and a
horizontally-scrolling time grid on the right. Pass `resources` (array or function) and
set `view: 'timeline'`.

```js
const cal = new Calendar(el, {
  view: 'timeline',
  timezone: 'Europe/Copenhagen',
  height: 780,
  slot: { duration: 15, min: '06:00', max: '19:00' },
  nowIndicator: true,

  // group resources into header bands by this field
  resourceGroupField: 'group',

  // the sticky left area: one or more columns
  resourceArea: {
    width: '25%',
    columns: [
      { field: 'title', header: 'Afdelinger' },              // plain text from resource.title
      { header: 'Tider', render: (r) => renderHoursCell(r) }, // custom HTML / DOM node per resource
    ],
  },

  resources: [
    { id: 'E1', title: 'Anders', group: 'Mekanik' },
    { id: 'E2', title: 'Bo',     group: 'Mekanik' },
    { id: 'C1', title: 'Lånebil 1', group: 'Biler' },
  ],

  events: [
    { id: 1, title: 'Service', start: '...', end: '...', resourceId: 'E1' },
  ],

  // custom label for the default resource column (FullCalendar's resourceLabelContent)
  renderResource: (resource) => `<strong>${resource.title}</strong>`,

  onEventClick: ({ event }) => openOrder(event.extendedProps.orderId),
})
cal.render()
```

Events on the same resource that overlap in time stack into vertical levels and the row
grows to fit them. An event without a matching `resourceId` is not shown in the timeline.

## Data shapes

**Event input** (`color`/`textColor`/`extendedProps` optional; extra keys are preserved on
`event.raw`):

```ts
{ id, title?, start, end?, resourceId?, allDay?, color?, textColor?, extendedProps? }
```

`start` / `end` accept anything dayjs parses (ISO string with offset is safest). Inside the
calendar they become `event.start` / `event.end` Dayjs objects in the configured timezone.

**Resource input:**

```ts
{ id, title?, group?, order?, ...customFields }
```

Custom fields (e.g. `make`, `workHours`) are available as `resource.raw.<field>` in
`renderResource` / column `render`.

## Options reference

| Option | Type | Notes |
| --- | --- | --- |
| `view` | `'day' \| 'resource-day' \| 'timeline'` | default `'day'` |
| `date` | `string \| Date` | initial date; default today |
| `timezone` | `string` | IANA tz; events are placed in this clock |
| `locale` | `string \| { code, intl?, firstDay?, buttons? }` | `intl` is the BCP-47 tag for formatting |
| `firstDay` | `number` | 0 = Sunday; default 1 |
| `slot` | `{ duration?, min?, max?, labelInterval? }` | minutes / `'HH:mm'` / minutes |
| `height` | `number \| string` | applied to the host element |
| `nowIndicator` | `boolean` | current-time line |
| `toolbar` | `{ start?, center?, end? } \| false` | space-separated tokens: `today prev next title <customKey>` |
| `buttons` | `{ [key]: { text?, icon?, onClick } }` | custom toolbar buttons |
| `events` | array \| `(range) => events \| Promise<events>` | function re-runs on navigation |
| `resources` | array \| `(range) => resources \| Promise<…>` | timeline / resource-day |
| `resourceArea` | `{ width?, columns? }` | sticky left area (timeline) |
| `resourceGroupField` | `string` | field to group rows by; default `'group'` |
| `resourceOrder` | `string` | field to sort by; default `'order'` (use `'id'` for id sort) |
| `renderEvent` | `(event) => string \| HTMLElement` | custom event body |
| `renderResource` | `(resource) => string \| HTMLElement` | custom resource label |
| `timeFormat` | `Intl.DateTimeFormatOptions` | default event time format |
| `onEventClick` | `({ event, el, jsEvent }) => void` | |
| `onEventMount` | `({ event, el }) => void` | bind context menus / deep-link highlight here |
| `onDatesSet` | `({ start, end, view }) => void` | fires on navigation / view change |
| `onEventsSet` | `(events) => void` | after each event load |

> Drag/resize options (`editable`, `selectable`, `eventOverlap`, `selectAllow`,
> `onEventChange`, `onSelect`) are typed but not wired yet — they land with the interaction
> engine (Fase 4).

## Imperative API

The calendar is a plain class you drive through a ref — mirrors the surface FullCalendar
consumers rely on:

| Method | Purpose |
| --- | --- |
| `render()` / `destroy()` | mount / tear down |
| `refetchEvents()` | re-run the events source for the current range |
| `reload()` | re-fetch resources **and** events |
| `addEvent(input)` | add one event, returns an `EventHandle` |
| `getEventById(id)` | returns `{ event, remove(), setExtendedProp() }` or `null` |
| `getEvents()` / `getResources()` / `getResourceById(id)` | read stores |
| `gotoDate(date)` / `today()` / `prev()` / `next()` | navigation |
| `changeView('day' \| 'resource-day' \| 'timeline')` | switch view |
| `view` / `date` (getters) | current state |

### Real-time updates

Drive incremental updates from a websocket without a full refetch (DMS uses Laravel Echo):

```js
echo.private(`shop.${id}`)
  .listen('.eventCreated', (e) => cal.addEvent(e.event))
  .listen('.eventUpdated', () => cal.refetchEvents())
  .listen('.eventRemoved', (e) => cal.getEventById(e.id)?.remove())
```

### Using it from Preact / React

Because the calendar is framework-agnostic, you mount it on a ref and drive it
imperatively — no wrapper component needed:

```jsx
import { useEffect, useRef } from 'preact/hooks'
import { Calendar } from '@ziix/calendar'
import '@ziix/calendar/styles.css'

export function CalendarView({ shopId }) {
  const elRef = useRef(null)
  const calRef = useRef(null)

  useEffect(() => {
    const cal = new Calendar(elRef.current, {
      view: 'timeline',
      timezone: window.ziix.timezone,
      events: ({ start, end }) => fetchEvents(shopId, start, end),
      resources: () => fetchResources(shopId),
      onEventClick: ({ event }) => openOrder(event),
    })
    cal.render()
    calRef.current = cal
    return () => cal.destroy()
  }, [shopId])

  return <div ref={elRef} style={{ height: 780 }} />
}
```

## Theming

Every colour is a `--zc-*` custom property on `.zc`. Remap them to your design tokens —
no need to touch internals:

```css
.zc {
  --zc-border: var(--color-border);
  --zc-today-bg: var(--color-primary-50);
  --zc-event-bg: var(--color-primary-200);
  --zc-event-border: var(--color-primary-300);
  --zc-event-fg: var(--color-primary-700);
  --zc-now: var(--color-danger-500);
}
```

## Develop

```bash
npm install
npm run dev        # Vite playground (examples/index.html)
npm test           # vitest (datelib, overlap logic + day/timeline DOM render)
npm run typecheck  # tsc --noEmit
npm run build      # dist/ziix-calendar.js + .css + index.d.ts
```

## Roadmap

| Fase | Scope | State |
| --- | --- | --- |
| 0 | Core: Calendar class, stores, datelib, toolbar, navigation, theming | ✅ |
| 1 | `day` view: time axis, overlap packing, now indicator, event hooks | ✅ |
| 3 | `timeline` view (resources as rows, horizontal axis, grouping, custom resource columns, event stacking) | ✅ |
| 2 | `resource-day` view (resources as columns) | ⏳ |
| 4 | Interaction engine: drag-move, resize, drag-select | ⏳ |
| 5 | Locale pack, deep-link highlight, a11y polish | ⏳ |

## License

MIT
