/**
 * Pure camera maths for a constrained, Z-up orbit. No DOM, no vtk.js.
 *
 * The camera is described by a target point, an azimuth (angle about +Z),
 * an elevation (angle above the horizon) and a distance. Because the view-up
 * is always +Z and elevation is clamped below 90°, the camera cannot roll or
 * flip, and the model always stays upright.
 */
import type { Vec3 } from '../../domain/sceneModel';

const DEG = Math.PI / 180;

/** Camera may sit on the horizon but never dip below it. */
export const ELEVATION_MIN = 0;
/** Just short of straight down, so view-up (+Z) is never parallel to the view direction. */
export const ELEVATION_MAX = 89.9 * DEG;

/** ~0.34° per pixel: a 300 px drag turns the model about 100°. */
export const ORBIT_RADIANS_PER_PIXEL = 0.006;
/** Wheel zoom rate; distance scales by exp(delta * rate). */
export const WHEEL_ZOOM_RATE = 0.0012;
/** Geometry closer to the camera than this fraction of the orbit distance is clipped. */
export const NEAR_CLIP_FRACTION = 0.02;

export interface OrbitState {
  target: Vec3;
  /** Radians, about +Z. 0 puts the camera on +X, -π/2 on -Y (the front). */
  azimuth: number;
  /** Radians above the horizon. */
  elevation: number;
  distance: number;
}

export interface ViewAngles {
  azimuth: number;
  elevation: number;
}

export type StandardView = 'iso' | 'top' | 'front' | 'right';

export const STANDARD_VIEWS: Record<StandardView, ViewAngles> = {
  /** True isometric: 45° round, 35.264° up. Camera on the front-right corner. */
  iso: { azimuth: -45 * DEG, elevation: Math.atan(1 / Math.SQRT2) },
  /** Plan view: +X right, +Y up the screen. */
  top: { azimuth: -90 * DEG, elevation: ELEVATION_MAX },
  /** Camera on -Y looking along +Y: +X right. */
  front: { azimuth: -90 * DEG, elevation: 0 },
  /** Camera on +X looking along -X: +Y right. */
  right: { azimuth: 0, elevation: 0 },
};

export function wrapAngle(a: number): number {
  const t = a % (2 * Math.PI);
  if (t > Math.PI) return t - 2 * Math.PI;
  if (t <= -Math.PI) return t + 2 * Math.PI;
  return t;
}

export function clampElevation(el: number): number {
  return Math.min(ELEVATION_MAX, Math.max(ELEVATION_MIN, el));
}

/** Unit vector from the target towards the camera. */
export function directionFromTarget(azimuth: number, elevation: number): Vec3 {
  const ce = Math.cos(elevation);
  return [ce * Math.cos(azimuth), ce * Math.sin(azimuth), Math.sin(elevation)];
}

export function cameraPosition(s: OrbitState): Vec3 {
  const d = directionFromTarget(s.azimuth, s.elevation);
  return [s.target[0] + d[0] * s.distance, s.target[1] + d[1] * s.distance, s.target[2] + d[2] * s.distance];
}

/** Camera axes in world space. `right` always lies in the horizontal plane: no roll. */
export function cameraBasis(azimuth: number, elevation: number): { right: Vec3; up: Vec3; forward: Vec3 } {
  const sa = Math.sin(azimuth);
  const ca = Math.cos(azimuth);
  const se = Math.sin(elevation);
  const ce = Math.cos(elevation);
  return {
    right: [-sa, ca, 0],
    up: [-se * ca, -se * sa, ce],
    forward: [-ce * ca, -ce * sa, -se],
  };
}

/** Drag right turns the model right (camera moves left); drag down looks from higher up. */
export function orbitBy(s: OrbitState, dxPx: number, dyPx: number, rate = ORBIT_RADIANS_PER_PIXEL): OrbitState {
  return {
    ...s,
    azimuth: wrapAngle(s.azimuth - dxPx * rate),
    elevation: clampElevation(s.elevation + dyPx * rate),
  };
}

/** Pan in the screen plane so the point under the cursor follows the cursor. */
export function panBy(s: OrbitState, dxPx: number, dyPx: number, viewportHeightPx: number, viewAngleRad: number): OrbitState {
  const worldPerPixel = (2 * s.distance * Math.tan(viewAngleRad / 2)) / Math.max(viewportHeightPx, 1);
  const { right, up } = cameraBasis(s.azimuth, s.elevation);
  return {
    ...s,
    target: [
      s.target[0] - right[0] * dxPx * worldPerPixel + up[0] * dyPx * worldPerPixel,
      s.target[1] - right[1] * dxPx * worldPerPixel + up[1] * dyPx * worldPerPixel,
      s.target[2] - right[2] * dxPx * worldPerPixel + up[2] * dyPx * worldPerPixel,
    ],
  };
}

/** Positive wheel delta (scroll down) zooms out. */
export function dollyBy(s: OrbitState, wheelDelta: number, minDistance: number, maxDistance: number): OrbitState {
  const distance = s.distance * Math.exp(wheelDelta * WHEEL_ZOOM_RATE);
  return { ...s, distance: Math.min(maxDistance, Math.max(minDistance, distance)) };
}

export function clampVec(v: Vec3, min: Vec3, max: Vec3): Vec3 {
  return [
    Math.min(max[0], Math.max(min[0], v[0])),
    Math.min(max[1], Math.max(min[1], v[1])),
    Math.min(max[2], Math.max(min[2], v[2])),
  ];
}

/** Distance at which a sphere of `radius` fits entirely in view, whatever the aspect ratio. */
export function fitDistance(radius: number, viewAngleRad: number, aspect: number, margin = 1.15): number {
  const halfV = viewAngleRad / 2;
  const halfH = Math.atan(Math.tan(halfV) * Math.max(aspect, 0.01));
  return (radius * margin) / Math.sin(Math.min(halfV, halfH));
}

/**
 * Near/far planes for the current camera. The far plane covers the scene sphere;
 * the near plane tracks the orbit distance so zooming in on a small part never
 * clips it, and depth precision stays high when zoomed out.
 */
export function clippingRange(s: OrbitState, sphereCenter: Vec3, sphereRadius: number): [number, number] {
  const pos = cameraPosition(s);
  const { forward } = cameraBasis(s.azimuth, s.elevation);
  const toCenter = [sphereCenter[0] - pos[0], sphereCenter[1] - pos[1], sphereCenter[2] - pos[2]];
  const along = toCenter[0] * forward[0] + toCenter[1] * forward[1] + toCenter[2] * forward[2];
  const near = s.distance * NEAR_CLIP_FRACTION;
  const far = Math.max(along + sphereRadius, near * 2);
  return [near, far];
}

/** World axis -> screen offset (x right, y UP, each in -1..1). Drives the axis triad. */
export function projectAxis(axis: Vec3, azimuth: number, elevation: number): [number, number] {
  const { right, up } = cameraBasis(azimuth, elevation);
  return [
    axis[0] * right[0] + axis[1] * right[1] + axis[2] * right[2],
    axis[0] * up[0] + axis[1] * up[1] + axis[2] * up[2],
  ];
}

/** Round a raw spacing to 1, 2, 5 or 10 times a power of ten. */
export function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  const n = m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10;
  return n * p;
}

/** Interpolate angles along the shortest way round. */
export function lerpAngle(a: number, b: number, t: number): number {
  return wrapAngle(a + wrapAngle(b - a) * t);
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function interpolateState(a: OrbitState, b: OrbitState, t: number): OrbitState {
  const lerp = (x: number, y: number) => x + (y - x) * t;
  return {
    target: [lerp(a.target[0], b.target[0]), lerp(a.target[1], b.target[1]), lerp(a.target[2], b.target[2])],
    azimuth: lerpAngle(a.azimuth, b.azimuth, t),
    elevation: lerp(a.elevation, b.elevation),
    // Geometric interpolation: equal-looking zoom speed whether near or far.
    distance: a.distance * Math.pow(b.distance / a.distance, t),
  };
}
