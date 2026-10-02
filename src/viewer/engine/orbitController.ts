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

export interface OrbitLimits {
  targetMin: Vec3;
  targetMax: Vec3;
  minDistance: number;
  maxDistance: number;
}

export interface OrbitController {
  getState(): OrbitState;
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

export function createOrbitController(host: HTMLElement, rig: CameraRig, initial: OrbitState): OrbitController {
  let state = initial;
  let limits: OrbitLimits | null = null;
  let drag: { pointerId: number; mode: DragMode; x: number; y: number } | null = null;
  let animationFrame = 0;
  const listeners = new Set<(s: OrbitState) => void>();

  host.style.touchAction = 'none';
  host.style.cursor = 'grab';

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
    if (drag) return;
    let mode: DragMode | null = null;
    if (e.button === 0) mode = e.shiftKey ? 'pan' : 'orbit';
    else if (e.button === 1 || e.button === 2) mode = 'pan';
    if (!mode) return;

    e.preventDefault();
    cancelAnimation();
    host.setPointerCapture(e.pointerId);
    drag = { pointerId: e.pointerId, mode, x: e.clientX, y: e.clientY };
    host.style.cursor = mode === 'pan' ? 'move' : 'grabbing';
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
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
    drag = null;
    host.style.cursor = 'grab';
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    cancelAnimation();
    // deltaMode: 0 pixels, 1 lines, 2 pages.
    const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
    const min = limits?.minDistance ?? 0;
    const max = limits?.maxDistance ?? Infinity;
    set(dollyBy(state, delta, min, max));
  }

  const onContextMenu = (e: Event) => e.preventDefault();

  host.addEventListener('pointerdown', onPointerDown);
  host.addEventListener('pointermove', onPointerMove);
  host.addEventListener('pointerup', endDrag);
  host.addEventListener('pointercancel', endDrag);
  host.addEventListener('wheel', onWheel, { passive: false });
  host.addEventListener('contextmenu', onContextMenu);

  return {
    getState: () => state,
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
      host.removeEventListener('wheel', onWheel);
      host.removeEventListener('contextmenu', onContextMenu);
      host.style.cursor = '';
      host.style.touchAction = '';
    },
  };
}
