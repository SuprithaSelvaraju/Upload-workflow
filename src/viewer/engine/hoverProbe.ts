/**
 * Turns a stream of mouse-move points into a cheap, bounded stream of "is the pointer
 * over selectable geometry?" answers. Pure scheduling logic (frame + clock are injected),
 * so it is unit-testable and has no DOM or vtk.js dependency.
 *
 *  - Coalescing: at most one probe per animation frame, always on the newest point.
 *  - Adaptive backoff: if a probe is slow (huge model), probes are spaced out to
 *    `cost * BACKOFF_FACTOR` (capped), keeping hover to a small share of frame time.
 *  - Trailing probe: the last point is always probed once the pointer stops, so the
 *    cursor never stays stale.
 *  - Leaving the viewport (null) answers `false` immediately and drops pending work.
 */
export interface HoverProbeDeps {
  /** The (possibly expensive) query: is there selectable geometry under this client point? */
  probe: (x: number, y: number) => boolean;
  onResult: (over: boolean) => void;
  requestFrame: (cb: () => void) => number;
  cancelFrame: (handle: number) => void;
  now: () => number;
}

export interface HoverProbe {
  /** Feed the latest pointer position, or null when the pointer left the viewport. */
  move(point: { x: number; y: number } | null): void;
  /** Forget everything and report "not over anything" (model changed or was removed). */
  reset(): void;
  dispose(): void;
}

/** A probe cheaper than this never causes backoff. */
const FREE_BUDGET_MS = 3;
/** Slow probes are spaced out to this multiple of their cost... */
const BACKOFF_FACTOR = 4;
/** ...but never further apart than this, so hover still feels alive. */
const MAX_INTERVAL_MS = 120;

export function createHoverProbe(deps: HoverProbeDeps): HoverProbe {
  let latest: { x: number; y: number } | null = null;
  let frame = 0;
  let disposed = false;
  let lastRunAt = -Infinity;
  let minInterval = 0;
  let over = false;

  function report(next: boolean) {
    if (next === over) return;
    over = next;
    deps.onResult(next);
  }

  function schedule() {
    if (frame || disposed) return;
    frame = deps.requestFrame(run);
  }

  function run() {
    frame = 0;
    if (disposed || !latest) return;
    const t0 = deps.now();
    if (t0 - lastRunAt < minInterval) {
      schedule(); // too soon after a slow probe: try again next frame (this is the trailing probe too)
      return;
    }
    const point = latest;
    latest = null;
    const result = deps.probe(point.x, point.y);
    const t1 = deps.now();
    lastRunAt = t1;
    const cost = t1 - t0;
    minInterval = cost > FREE_BUDGET_MS ? Math.min(MAX_INTERVAL_MS, cost * BACKOFF_FACTOR) : 0;
    report(result);
  }

  return {
    move(point) {
      if (disposed) return;
      if (!point) {
        latest = null;
        if (frame) deps.cancelFrame(frame);
        frame = 0;
        report(false);
        return;
      }
      latest = point;
      schedule();
    },
    reset() {
      if (disposed) return;
      latest = null;
      if (frame) deps.cancelFrame(frame);
      frame = 0;
      minInterval = 0;
      lastRunAt = -Infinity;
      report(false);
    },
    dispose() {
      disposed = true;
      if (frame) deps.cancelFrame(frame);
      frame = 0;
      latest = null;
    },
  };
}
