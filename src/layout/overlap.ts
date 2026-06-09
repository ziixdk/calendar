import type { CalEvent } from '../types'

export interface PackedEvent {
  event: CalEvent
  /** Column index within the cluster. */
  col: number
  /** Number of columns in the cluster. */
  cols: number
  /** Left offset as a 0..1 fraction of the column width. */
  left: number
  /** Width as a 0..1 fraction of the column width. */
  width: number
}

/**
 * Pack events that share a single column (resource/day) into side-by-side
 * sub-columns so overlapping events never cover each other — the classic
 * interval-graph greedy colouring FullCalendar uses.
 *
 * Events are expected to already belong to the same column; callers filter by
 * resource first.
 */
export function packEvents(events: CalEvent[]): PackedEvent[] {
  const sorted = [...events].sort(
    (a, b) => a.start.valueOf() - b.start.valueOf() || b.end.valueOf() - a.end.valueOf(),
  )

  const result: PackedEvent[] = []
  let cluster: CalEvent[] = []
  let clusterEnd = -Infinity

  const flush = () => {
    if (cluster.length === 0) return
    const columns: CalEvent[][] = []
    for (const ev of cluster) {
      let placed = false
      for (const col of columns) {
        const last = col[col.length - 1]
        if (last.end.valueOf() <= ev.start.valueOf()) {
          col.push(ev)
          placed = true
          break
        }
      }
      if (!placed) columns.push([ev])
    }
    const cols = columns.length
    columns.forEach((col, ci) => {
      for (const ev of col) {
        result.push({ event: ev, col: ci, cols, left: ci / cols, width: 1 / cols })
      }
    })
    cluster = []
    clusterEnd = -Infinity
  }

  for (const ev of sorted) {
    if (cluster.length > 0 && ev.start.valueOf() >= clusterEnd) flush()
    cluster.push(ev)
    clusterEnd = Math.max(clusterEnd, ev.end.valueOf())
  }
  flush()

  return result
}
