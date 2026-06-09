/** Context handed to drag move/end callbacks. */
export interface DragContext {
  /** Horizontal delta from the pointer-down position, in px. */
  dx: number
  /** Vertical delta from the pointer-down position, in px. */
  dy: number
  /** Whether the drag threshold was exceeded (i.e. a real drag, not a click). */
  moved: boolean
  /** The current pointer/mouse event. */
  event: MouseEvent
}

export interface DragHandlers {
  /** Pixels of movement before a drag is considered started (default 4). */
  threshold?: number
  /** Fired once, when the threshold is first exceeded. */
  onStart?(event: MouseEvent): void
  /** Fired on every pointer move after the drag has started. */
  onMove?(ctx: DragContext): void
  /** Fired once on pointer up / cancel. `moved` distinguishes drag from click. */
  onEnd?(ctx: DragContext): void
}

/**
 * Track a pointer drag from a pointerdown event. Listeners live on `window` for
 * the duration of the gesture so the pointer can leave the origin element.
 * `onStart`/`onMove` only fire once movement passes the threshold, so a plain
 * click ends with `moved === false` and no `onStart`.
 */
export function startDrag(down: MouseEvent, handlers: DragHandlers): void {
  const threshold = handlers.threshold ?? 4
  const startX = down.clientX
  const startY = down.clientY
  let started = false

  const move = (e: Event) => {
    const me = e as MouseEvent
    const dx = me.clientX - startX
    const dy = me.clientY - startY
    if (!started && Math.hypot(dx, dy) < threshold) return
    if (!started) {
      started = true
      handlers.onStart?.(me)
    }
    handlers.onMove?.({ dx, dy, moved: true, event: me })
  }

  const up = (e: Event) => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', up)
    const me = e as MouseEvent
    handlers.onEnd?.({
      dx: me.clientX - startX,
      dy: me.clientY - startY,
      moved: started,
      event: me,
    })
  }

  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', up)
}

/** Round a minute value to the nearest slot boundary. */
export function snap(minute: number, slot: number): number {
  if (slot <= 0) return minute
  return Math.round(minute / slot) * slot
}
