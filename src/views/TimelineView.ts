import type { Calendar } from '../Calendar'
import type { DateRange } from '../types'
import type { View } from './View'

/**
 * Resources-as-rows horizontal timeline (the `resourceTimeline` equivalent) —
 * the heaviest view and the main reason to drop FullCalendar's premium
 * scheduler.
 *
 * Planned for Fase 3 of the roadmap. The class exists so the view registry is
 * stable, but constructing it surfaces a clear, honest error.
 */
export class TimelineView implements View {
  constructor(_cal: Calendar, _root: HTMLElement) {
    throw new Error(
      "[@ziix/calendar] view 'timeline' is not implemented yet (Fase 3). " +
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
