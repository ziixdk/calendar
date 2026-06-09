import type { Calendar } from '../Calendar'
import type { DateRange } from '../types'
import type { View } from './View'

/**
 * Resources-as-columns day view (the `resourceTimeGridDay` equivalent).
 *
 * Planned for Fase 2 of the roadmap. The class exists so `changeView` and the
 * view registry are stable, but constructing it surfaces a clear, honest error
 * instead of rendering something half-built.
 */
export class ResourceDayView implements View {
  constructor(_cal: Calendar, _root: HTMLElement) {
    throw new Error(
      "[@ziix/calendar] view 'resource-day' is not implemented yet (Fase 2). " +
        "Only 'day' is available in this build.",
    )
  }

  mount(): void {}
  renderEvents(): void {}
  unmount(): void {}
  range(): DateRange {
    throw new Error('not implemented')
  }
  title(): string {
    return ''
  }
}
