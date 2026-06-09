# @ziix/calendar

By [ziix.eu](https://ziix.eu) · [npm](https://www.npmjs.com/package/@ziix/calendar)

A framework-agnostic resource & time-grid calendar with three views — **day**,
**resource-day** (resources as columns) and **timeline** (resources as rows) — plus
drag/resize/select, resource grouping and timezone-correct rendering. No framework
dependency: a plain imperative class you drive through a ref from React, Preact, Vue,
Svelte or vanilla JS.

> **Status.** All three views and the full interaction engine (drag/resize/select) are
> implemented and tested, and the package is published on npm.

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
  timezone: 'Europe/Copenhagen', // events are placed in this timezone, not the browser's
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

A sticky resource area on the left and a horizontally-scrolling time grid on the right.
Pass `resources` (array or function) and set `view: 'timeline'`.

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

  // custom label for the default resource column
  renderResource: (resource) => `<strong>${resource.title}</strong>`,

  onEventClick: ({ event }) => openOrder(event.extendedProps.orderId),
})
cal.render()
```

Events on the same resource that overlap in time stack into vertical levels and the row
grows to fit them. An event without a matching `resourceId` is not shown in the timeline.

### Resource-day view (resources as columns)

`view: 'resource-day'` uses the same vertical time axis as the day view, but with one
column per resource under a sticky, grouped header. Takes the
same `resources` / `resourceGroupField` / `renderResource` options as the timeline. With
`editable`, dragging an event sideways moves it to another resource column.

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
| `eventMinHeight` | `number` | min height (px) of a stacked event in the timeline; row grows to fit. Default 48 |
| `nowIndicator` | `boolean` | current-time line |
| `dayClosed` | `boolean \| ((date) => boolean)` | tint the day as closed/non-business (`--zc-nonbusiness`) |
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
| `editable` | `boolean` | enable drag-move + resize |
| `selectable` | `boolean` | enable drag-select of empty ranges |
| `eventOverlap` | `boolean \| (() => boolean)` | allow overlapping events on drop; default `true` |
| `selectAllow` | `({ start, end, resource }) => boolean` | gate which ranges can be selected |
| `onEventClick` | `({ event, el, jsEvent }) => void` | |
| `onEventContextMenu` | `({ event, el, jsEvent }) => void` | right-click; native menu suppressed |
| `onEventMount` | `({ event, el }) => void` | bind deep-link highlight / extra listeners here |
| `onEventChange` | `({ event, oldEvent }) => void` | after a drag/resize commit |
| `onSelect` | `({ start, end, resource, jsEvent }) => void` | after a drag-select |
| `onDatesSet` | `({ start, end, view }) => void` | fires on navigation / view change |
| `onEventsSet` | `(events) => void` | after each event load |

## Editing — drag, resize, select

Set `editable: true` to let users drag events to a new time (and, in the timeline, a new
resource row) and resize them by their edges. Set `selectable: true` to let users
drag-select an empty range. Everything snaps to `slot.duration`.

```js
const cal = new Calendar(el, {
  view: 'timeline',
  editable: true,
  selectable: true,

  // false ⇒ a drop/resize that would overlap another event on the same resource is
  // rejected and snaps back. May be a function evaluated per drop.
  eventOverlap: () => settings.allowOverlap,

  // gate which ranges may be selected (e.g. only employee or rental-car rows)
  selectAllow: ({ resource }) => !!resource && /^[EC]/.test(resource.id),

  // fired after a successful drag/resize — persist it to your backend here
  onEventChange: ({ event, oldEvent, revert }) => {
    api.patch(`/calendar/event/${event.id}`, {
      from: event.start.toISOString(),
      to: event.end.toISOString(),
      resource: event.resourceId,
    }).catch(() => revert()) // server rejected the move → snap the event back
  },

  // fired after a drag-select — open a "new event" menu, etc.
  onSelect: ({ start, end, resource }) => openNewEventMenu(start, end, resource),
})
```

Behaviour notes:

- **Day view:** drag moves vertically (time only); resize from the bottom edge.
- **Timeline:** drag moves horizontally (time) and vertically (across resource rows);
  resize from either edge.
- A rejected move (overlap / out of bounds) reverts automatically — `onEventChange` does
  **not** fire.
- A plain click on an editable event still fires `onEventClick` (distinguished from a drag
  by a movement threshold).

## Context menus

Right-click on an event fires `onEventContextMenu` (the native browser menu is suppressed
first). The calendar deliberately does **not** ship a menu UI — you render your own from the
hook, so it matches your app. Works in all three views, on read-only and editable events.

```js
const cal = new Calendar(el, {
  onEventContextMenu: ({ event, jsEvent }) => {
    myMenu.open(jsEvent.clientX, jsEvent.clientY, [
      { label: 'Open order', run: () => openOrder(event.extendedProps.orderId) },
      { label: 'Delete', run: () => cal.getEventById(event.id)?.remove() },
    ])
  },
})
```

For a context menu on **empty** space (e.g. "create here"), use `onSelect` — a drag-select
gives you `{ start, end, resource }` to anchor the menu. See `examples/index.html` for a
working menu implementation.

## Imperative API

The calendar is a plain class you drive through a ref:

| Method | Purpose |
| --- | --- |
| `render()` / `destroy()` | mount / tear down |
| `refetchEvents()` | re-run the events source for the current range |
| `reload()` | re-fetch resources **and** events |
| `addEvent(input)` | add one event, returns an `EventHandle` |
| `getEventById(id)` | returns `{ event, remove(), setExtendedProp() }` or `null` |
| `getEvents()` / `getResources()` | read stores |
| `getResourceById(id)` | returns a `ResourceHandle` — `{ resource, setExtendedProp(), setProp() }` for pushing live data (work hours, punch-ins) into a resource column |
| `gotoDate(date)` / `today()` / `prev()` / `next()` | navigation |
| `changeView('day' \| 'resource-day' \| 'timeline')` | switch view |
| `getView()` | `{ type, activeStart, activeEnd }` for the current range |
| `view` / `date` / `activeStart` / `activeEnd` (getters) | current state |

### Real-time updates

Drive incremental updates from a websocket without a full refetch:

```js
socket.on('event:created', (e) => cal.addEvent(e.event))
socket.on('event:updated', () => cal.refetchEvents())
socket.on('event:removed', (e) => cal.getEventById(e.id)?.remove())
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
      timezone: 'Europe/Copenhagen',
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

## Translations & locale

The calendar renders almost no text of its own — column headers, resource labels and
event content all come from **your** render hooks, so they're already in your language.
The only built-in strings are the toolbar buttons, and the date in the title. Both are
driven by the `locale` option — pass your app's translations there:

```js
const cal = new Calendar(el, {
  locale: {
    code: 'da',
    intl: 'da-DK', // BCP-47 tag used by Intl to format the title date
    firstDay: 1,
    buttons:    { today: t('today'), prev: '‹', next: '›' },
    ariaLabels: { today: t('today'), prev: t('prev'), next: t('next') },
  },
})
```

There are no hardcoded user-facing strings in the library — anything visible is either
supplied by you (hooks) or overridable here. The title date is localised automatically
via `Intl` using `intl` (falling back to `code`).

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
  --zc-nonbusiness: var(--color-muted); /* closed-day tint */
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

## Features

- **Three views** — `day`, `resource-day` (resources as columns) and `timeline`
  (resources as rows, horizontal axis) with grouped resources and custom resource columns
- **Interaction** — drag-move (incl. across resources), resize, drag-select, with
  overlap and selection gating
- **Timezone-correct** rendering via dayjs; events placed in the configured timezone
- **Imperative API** — drive it from any framework through a ref
- **Real-time friendly** — add/update/remove events incrementally from a websocket
- **Themeable** via `--zc-*` custom properties; **translatable** via the `locale` option
- **Typed** — ships TypeScript declarations; one peer dependency (`dayjs`)

## Changelog

| Version | Highlights |
| --- | --- |
| **0.1.7** | `eventOverlap` callback returning `undefined`/`null` is treated as "allow" (no opinion) — only an explicit falsy value disallows. |
| **0.1.6** | Timezone fix — a naïve datetime string (no offset) is interpreted as wall-clock time in the calendar timezone, not the host's. Server times no longer shift when the browser runs a different zone. |
| **0.1.5** | `refetchEvents()` guards against stale responses — during rapid navigation an older request can no longer overwrite the newer range's events. |
| **0.1.4** | Public `select({ start, end, resourceId })` — trigger a selection programmatically (fires `onSelect`, gated by `selectAllow`). |
| **0.1.3** | Business-hours shading — non-open time is greyed per resource via `businessHours` (resource-level or global); `BusinessHours` type. |
| **0.1.2** | Non-standard top-level resource fields fold into `extendedProps`; resource `setExtendedProp` re-renders only the resource area and coalesces bursts (no timeline flicker); clearer drag drop-target; more resource-cell padding. |
| **0.1.1** | Docs only — describe the library on its own terms. |
| **0.1.0** | Initial release: `day` / `resource-day` / `timeline` views, drag-move / resize / drag-select with overlap & allow gating, resource grouping & custom columns, `dayClosed`, `onEventContextMenu`, timezone-correct rendering, theming via `--zc-*`, translatable via `locale`, TypeScript types. |

## License

MIT

---

Built by [ziix](https://ziix.eu).
