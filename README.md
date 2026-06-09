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

## Usage

```js
import { Calendar } from '@ziix/calendar'
import '@ziix/calendar/styles.css'

const cal = new Calendar(document.getElementById('calendar'), {
  view: 'day',
  timezone: 'Europe/Copenhagen',
  date: '2026-06-09',
  height: 780,
  slot: { duration: 15, min: '06:00', max: '19:00', labelInterval: 60 },
  nowIndicator: true,
  locale: { code: 'da', intl: 'da-DK', firstDay: 1 },
  events: async ({ start, end }) => {
    const res = await fetch(`/calendar/events?from=${start.toISOString()}&to=${end.toISOString()}`)
    return (await res.json()).events // [{ id, title, start, end, resourceId?, extendedProps? }]
  },
  renderEvent: (event) => `<strong>${event.title}</strong>`, // string or HTMLElement
  onEventClick: ({ event, jsEvent }) => { /* navigate / preview */ },
  onEventMount: ({ event, el }) => { /* bind a right-click context menu */ },
})

cal.render()
```

## Imperative API

Mirrors the surface FullCalendar consumers rely on, so wiring it into a Preact/React
`ref` is a drop-in:

| Method | Purpose |
| --- | --- |
| `render()` / `destroy()` | mount / tear down |
| `refetchEvents()` | re-run the events source for the current range |
| `addEvent(input)` | add one event, returns an `EventHandle` |
| `getEventById(id)` | returns `{ event, remove(), setExtendedProp() }` or `null` |
| `getEvents()` / `getResources()` / `getResourceById(id)` | read stores |
| `gotoDate(date)` / `today()` / `prev()` / `next()` | navigation |
| `changeView('day' \| 'resource-day' \| 'timeline')` | switch view |

Real-time example (DMS drives this from Laravel Echo):

```js
echo.private(`shop.${id}`)
  .listen('.eventCreated', (e) => cal.addEvent(e.event))
  .listen('.eventUpdated', () => cal.refetchEvents())
  .listen('.eventRemoved', (e) => cal.getEventById(e.id)?.remove())
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
npm test           # vitest (datelib + overlap logic)
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
