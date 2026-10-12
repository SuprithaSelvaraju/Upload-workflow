/**
 * Mouse/touchpad navigation for the viewer. Plain DOM pointer + wheel events in,
 * OrbitState out. It never touches vtk.js: it drives a `CameraRig`, which
 * createViewer implements with the vtk.js camera.
 *
 *   Left drag             orbit (turntable about +Z, elevation clamped)
 *   Right / middle drag   pan
 *   Shift + left drag     pan
 *   Wheel                 zoom towards the orbit target
 */
import type { Vec3 } from '../../domain/sceneModel';
import {
  clampElevation,
  clampVec,
  dollyBy,
  easeOutCubic,
  interpolateState,
  orbitBy,
  panBy,
  wrapAngle,
  type OrbitState,
} from './orbitMath';

export interface CameraRig {
  readonly viewAngleRad: number;
  viewportSize(): { width: number; height: number };
  /** Write the state to the camera and schedule a render. */
  apply(state: OrbitState): void;
}

/** Pointer position in client (page viewport) coordinates. */
export interface PointerPoint {
  x: number;
  y: number;
}

export interface OrbitLimits {
  targetMin: Vec3;
  targetMax: Vec3;
  minDistance: number;
  maxDistance: number;
}

/** Optional pointer callbacks. Navigation is unaffected by what they do. */
export interface PointerHandlers {
  /** A plain left click: pressed and released without moving past the tap slop. */
  onTap?: (point: PointerPoint) => void;
  /**
   * Mouse moved over the viewport with no button down (also fired after a drag ends and
   * after a wheel step, since the geometry under a still cursor changed).
   * `null`: the pointer left. Not fired for touch. May be called at mouse-move rate:
   * the callee must be cheap or coalesce.
   */
  onHover?: (point: PointerPoint | null) => void;
}

export interface OrbitController {
  getState(): OrbitState;
  /**
   * The controller is the only writer of the host's cursor. The viewer says whether the
   * pointer is over selectable geometry; the controller turns that into 'pointer'
   * when idle ('grab' otherwise). Drags always show 'grabbing' / 'move'.
   */
  setHoverTarget(overSelectable: boolean): void;
  /** Constraints applied to every change. Pass null when no model is loaded. */
  setLimits(limits: OrbitLimits | null): void;
  /** Set the camera immediately. */
  jumpTo(state: OrbitState): void;
  /** Move there smoothly (instantly if the user prefers reduced motion). */
  animateTo(state: OrbitState, durationMs?: number): void;
  subscribe(listener: (state: OrbitState) => void): () => void;
  dispose(): void;
}

type DragMode = 'orbit' | 'pan';

const DEFAULT_ANIMATION_MS = 380;
/** A left press that moves no more than this many pixels is a click, not an orbit. */
const TAP_SLOP_PX = 4;
/** Fingers and pens jitter more than a mouse. */
const TOUCH_TAP_SLOP_PX = 10;

export function createOrbitController(
  host: HTMLElement,
  rig: CameraRig,
  initial: OrbitState,
  handlers: PointerHandlers = {},
): OrbitController {
  const { onTap, onHover } = handlers;
  let state = initial;
  let limits: OrbitLimits | null = null;
  let drag: {
    pointerId: number;
    mode: DragMode;
    x: number;
    y: number;
    startX: number;
    startY: number;
    moved: boolean;
    slop: number;
  } | null = null;
  let overSelectable = false;
  let animationFrame = 0;
  const listeners = new Set<(s: OrbitState) => void>();

  host.style.touchAction = 'none';

  function applyCursor() {
    host.style.cursor = drag ? (drag.mode === 'pan' ? 'move' : 'grabbing') : overSelectable ? 'pointer' : 'grab';
  }
  applyCursor();

  /** Mice hover; touch and pen have no hover. An absent pointerType (older events/tests) counts as mouse. */
  const isMouse = (e: PointerEvent) => !e.pointerType || e.pointerType === 'mouse';

  function constrain(s: OrbitState): OrbitState {
    const next: OrbitState = { ...s, azimuth: wrapAngle(s.azimuth), elevation: clampElevation(s.elevation) };
    if (!limits) return next;
    return {
      ...next,
      target: clampVec(next.target, limits.targetMin, limits.targetMax),
      distance: Math.min(limits.maxDistance, Math.max(limits.minDistance, next.distance)),
    };
  }

  function set(next: OrbitState) {
    state = constrain(next);
    rig.apply(state);
    listeners.forEach((l) => l(state));
  }

  function cancelAnimation() {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }

  const prefersReducedMotion = () =>
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function onPointerDown(e: PointerEvent) {
    // A second press for the pointer we think is still down means its release was lost
    // (released outside the window, capture stolen...): drop the stale drag and start fresh.
    if (drag && drag.pointerId === e.pointerId) abandonDrag();
    if (drag) return; // another pointer (multi-touch) is already dragging
    let mode: DragMode | null = null;
    if (e.button === 0) mode = e.shiftKey ? 'pan' : 'orbit';
    else if (e.button === 1 || e.button === 2) mode = 'pan';
    if (!mode) return;

    e.preventDefault();
    cancelAnimation();
    host.setPointerCapture(e.pointerId);
    drag = {
      pointerId: e.pointerId,
      mode,
      x: e.clientX,
      y: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      slop: isMouse(e) ? TAP_SLOP_PX : TOUCH_TAP_SLOP_PX,
    };
    applyCursor();
  }

  /** Ends the drag without a tap or hover (cancel, lost capture, missed release). */
  function abandonDrag() {
    if (!drag) return;
    if (host.hasPointerCapture?.(drag.pointerId)) host.releasePointerCapture(drag.pointerId);
    drag = null;
    applyCursor();
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag) {
      if (onHover && isMouse(e)) onHover({ x: e.clientX, y: e.clientY });
      return;
    }
    if (e.pointerId !== drag.pointerId) return;
    // Buttons are all up but we never saw the release: self-heal instead of orbiting forever.
    if (e.buttons === 0) {
      abandonDrag();
      if (onHover && isMouse(e)) onHover({ x: e.clientX, y: e.clientY });
      return;
    }
    if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > drag.slop) drag.moved = true;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (dx === 0 && dy === 0) return;

    if (drag.mode === 'orbit') {
      set(orbitBy(state, dx, dy));
    } else {
      set(panBy(state, dx, dy, rig.viewportSize().height, rig.viewAngleRad));
    }
  }

  function endDrag(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (host.hasPointerCapture?.(e.pointerId)) host.releasePointerCapture(e.pointerId);
    const isTap = e.type === 'pointerup' && drag.mode === 'orbit' && !drag.moved;
    drag = null;
    applyCursor();
    if (isTap) onTap?.({ x: e.clientX, y: e.clientY });
    if (onHover && isMouse(e) && e.type === 'pointerup') onHover({ x: e.clientX, y: e.clientY });
  }

  function onLostCapture(e: PointerEvent) {
    if (drag && e.pointerId === drag.pointerId) abandonDrag();
  }

  const onPointerLeave = (e: PointerEvent) => {
    if (!drag && onHover && isMouse(e)) onHover(null);
  };

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    cancelAnimation();
    // deltaMode: 0 pixels, 1 lines, 2 pages.
    const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
    const min = limits?.minDistance ?? 0;
    const max = limits?.maxDistance ?? Infinity;
    set(dollyBy(state, delta, min, max));
    if (!drag) onHover?.({ x: e.clientX, y: e.clientY }); // geometry moved under a still cursor
  }

  const onContextMenu = (e: Event) => e.preventDefault();

  host.addEventListener('pointerdown', onPointerDown);
  host.addEventListener('pointermove', onPointerMove);
  host.addEventListener('pointerup', endDrag);
  host.addEventListener('pointercancel', endDrag);
  host.addEventListener('lostpointercapture', onLostCapture);
  host.addEventListener('pointerleave', onPointerLeave);
  host.addEventListener('wheel', onWheel, { passive: false });
  host.addEventListener('contextmenu', onContextMenu);

  return {
    getState: () => state,
    setHoverTarget(over) {
      if (over === overSelectable) return;
      overSelectable = over;
      applyCursor();
    },
    setLimits(next) {
      limits = next;
    },
    jumpTo(next) {
      cancelAnimation();
      set(next);
    },
    animateTo(target, durationMs = DEFAULT_ANIMATION_MS) {
      cancelAnimation();
      if (durationMs <= 0 || prefersReducedMotion()) {
        set(target);
        return;
      }
      const from = state;
      const startedAt = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - startedAt) / durationMs);
        set(interpolateState(from, target, easeOutCubic(t)));
        animationFrame = t < 1 ? requestAnimationFrame(step) : 0;
      };
      animationFrame = requestAnimationFrame(step);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      cancelAnimation();
      listeners.clear();
      host.removeEventListener('pointerdown', onPointerDown);
      host.removeEventListener('pointermove', onPointerMove);
      host.removeEventListener('pointerup', endDrag);
      host.removeEventListener('pointercancel', endDrag);
      host.removeEventListener('lostpointercapture', onLostCapture);
      host.removeEventListener('pointerleave', onPointerLeave);
      host.removeEventListener('wheel', onWheel);
      host.removeEventListener('contextmenu', onContextMenu);
      host.style.cursor = '';
      host.style.touchAction = '';
    },
  };
}
