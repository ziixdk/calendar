import type { DateRange } from '../types'

/** Contract every view (day, resource-day, timeline) implements. */
export interface View {
  /** Build the static DOM structure (axis, columns/rows) and render events. */
  mount(): void
  /** Re-place events only, without rebuilding the static structure. */
  renderEvents(): void
  /**
   * Re-render only the resource-area cells (e.g. after a resource's
   * extendedProps change), leaving event bars untouched. Optional — views
   * without a resource area can omit it.
   */
  renderResources?(): void
  /** Tear down and detach all DOM owned by the view. */
  unmount(): void
  /** The date window this view currently shows, in the calendar timezone. */
  range(): DateRange
  /** Human-readable title for the toolbar. */
  title(): string
}

/** Tiny DOM helper shared by views. */
export function el(tag: string, cls: string): HTMLElement {
  const node = document.createElement(tag)
  node.className = cls
  return node
}

export function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value))
}
