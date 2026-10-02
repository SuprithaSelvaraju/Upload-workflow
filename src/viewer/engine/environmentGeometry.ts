/**
 * Pure geometry for the reference floor: a ground disc and a metric grid that
 * both fade into the canvas background, so the model sits on a floor with no
 * hard edge. No vtk.js here, so it can be tested without a browser.
 */
import type { Bounds, Rgb, Vec3 } from '../../domain/sceneModel';
import { niceStep } from './orbitMath';

export interface EnvironmentColors {
  background: Rgb;
  ground: Rgb;
  grid: Rgb;
  gridMajor: Rgb;
}

export interface EnvironmentPlan {
  /** Minor grid spacing, in model units (a 1/2/5 x 10^n value). */
  step: number;
  /** Every Nth line is drawn as a major line. */
  majorEvery: number;
  /** Half the side length of the ground square; a whole number of steps. */
  half: number;
  /** Grid centre on the ground, snapped to a step so lines fall on round coordinates. */
  centerX: number;
  centerY: number;
  groundZ: number;
  gridZ: number;
  /** Sphere that covers the model and the visible ground: used for clipping planes. */
  sphere: { center: Vec3; radius: number };
  /** Where the orbit target may go: keeps the scene from being panned out of reach. */
  targetMin: Vec3;
  targetMax: Vec3;
  /** Radius of the model's own bounding sphere. */
  modelRadius: number;
  modelCenter: Vec3;
}

export interface MeshArrays {
  positions: Float32Array;
  /** RGB, 0..255, one per vertex. */
  colors: Uint8Array;
  /** vtk.js cell-array layout: [n, i0, i1, ...] repeated. */
  cells: Uint32Array;
}

/** Floor for the model radius (model units), so a degenerate model cannot produce a microscopic grid. */
const MIN_MODEL_RADIUS = 1e-3;
const MAX_LINES_PER_AXIS = 150;
const GROUND_SUBDIVISIONS = 48;
const LINE_SEGMENTS = 24;
/** Grid reaches this many model-radii from the model before fading out. */
const REACH_IN_MODEL_RADII = 3;
const MINOR_CELLS_ACROSS_MODEL = 16;
const MAJOR_EVERY = 5;
/** Separation below the model's lowest point, relative to the model radius. */
const GROUND_DROP = 0.002;
const GRID_DROP = 0.001;

/** Normalised radius (0 centre .. 1 edge of the ground square) at which each layer starts to fade. */
const GROUND_FADE: [number, number] = [0.45, 1];
const GRID_FADE: [number, number] = [0.25, 0.95];

export function planEnvironment(bounds: Bounds): EnvironmentPlan {
  const [minX, minY, minZ] = bounds.min;
  const [maxX, maxY, maxZ] = bounds.max;
  const dx = maxX - minX;
  const dy = maxY - minY;
  const dz = maxZ - minZ;
  const modelRadius = Math.max(0.5 * Math.hypot(dx, dy, dz), MIN_MODEL_RADIUS);
  const footprint = Math.max(dx, dy, modelRadius * 0.5);

  let step = niceStep(footprint / MINOR_CELLS_ACROSS_MODEL);
  let half = Math.ceil((modelRadius * REACH_IN_MODEL_RADII) / step) * step;
  while (half / step > MAX_LINES_PER_AXIS) {
    step = niceStep(step * 2.01);
    half = Math.ceil((modelRadius * REACH_IN_MODEL_RADII) / step) * step;
  }

  const modelCenter: Vec3 = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
  const centerX = Math.round(modelCenter[0] / step) * step;
  const centerY = Math.round(modelCenter[1] / step) * step;

  return {
    step,
    majorEvery: MAJOR_EVERY,
    half,
    centerX,
    centerY,
    groundZ: minZ - modelRadius * GROUND_DROP,
    gridZ: minZ - modelRadius * GRID_DROP,
    sphere: { center: [centerX, centerY, modelCenter[2]], radius: Math.hypot(half, dz / 2) },
    targetMin: [centerX - half, centerY - half, minZ],
    targetMax: [centerX + half, centerY + half, maxZ + modelRadius],
    modelRadius,
    modelCenter,
  };
}

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

function mix(a: Rgb, b: Rgb, t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function groundColorAt(r: number, c: EnvironmentColors): [number, number, number] {
  return mix(c.ground, c.background, smoothstep(GROUND_FADE[0], GROUND_FADE[1], r));
}

function writeColor(out: Uint8Array, index: number, rgb: readonly [number, number, number]) {
  out[index * 3] = Math.round(rgb[0] * 255);
  out[index * 3 + 1] = Math.round(rgb[1] * 255);
  out[index * 3 + 2] = Math.round(rgb[2] * 255);
}

/** A flat square of triangles whose colour fades from ground to background with distance. */
export function buildGroundMesh(plan: EnvironmentPlan, colors: EnvironmentColors): MeshArrays {
  const n = GROUND_SUBDIVISIONS;
  const side = n + 1;
  const positions = new Float32Array(side * side * 3);
  const rgb = new Uint8Array(side * side * 3);

  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const u = (i / n) * 2 - 1;
      const v = (j / n) * 2 - 1;
      const k = j * side + i;
      positions[k * 3] = plan.centerX + u * plan.half;
      positions[k * 3 + 1] = plan.centerY + v * plan.half;
      positions[k * 3 + 2] = plan.groundZ;
      writeColor(rgb, k, groundColorAt(Math.hypot(u, v), colors));
    }
  }

  const cells = new Uint32Array(n * n * 2 * 4);
  let o = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * side + i;
      const b = a + 1;
      const c = a + side;
      const d = c + 1;
      cells.set([3, a, b, d, 3, a, d, c], o);
      o += 8;
    }
  }
  return { positions, colors: rgb, cells };
}

/**
 * Grid lines along X and Y. Each line is split into short segments so its
 * colour can fade smoothly with distance from the centre.
 */
export function buildGridLines(plan: EnvironmentPlan, colors: EnvironmentColors): MeshArrays {
  const linesPerAxis = Math.round((plan.half * 2) / plan.step) + 1;
  const pointsPerLine = LINE_SEGMENTS + 1;
  const totalLines = linesPerAxis * 2;
  const positions = new Float32Array(totalLines * pointsPerLine * 3);
  const rgb = new Uint8Array(totalLines * pointsPerLine * 3);
  const cells = new Uint32Array(totalLines * LINE_SEGMENTS * 3);

  let point = 0;
  let cell = 0;
  for (let axis = 0; axis < 2; axis++) {
    for (let li = 0; li < linesPerAxis; li++) {
      const offset = -plan.half + li * plan.step;
      // Major lines fall on round WORLD coordinates (multiples of 5 steps), not relative to the grid centre.
      const worldCoordinate = (axis === 0 ? plan.centerY : plan.centerX) + offset;
      const major = Math.round(worldCoordinate / plan.step) % plan.majorEvery === 0;
      const base = major ? colors.gridMajor : colors.grid;
      const first = point;

      for (let s = 0; s <= LINE_SEGMENTS; s++) {
        const along = -plan.half + (s / LINE_SEGMENTS) * plan.half * 2;
        const x = axis === 0 ? along : offset;
        const y = axis === 0 ? offset : along;
        positions[point * 3] = plan.centerX + x;
        positions[point * 3 + 1] = plan.centerY + y;
        positions[point * 3 + 2] = plan.gridZ;

        const r = Math.hypot(x, y) / plan.half;
        const lineColor = mix(base, groundColorAt(r, colors), smoothstep(GRID_FADE[0], GRID_FADE[1], r));
        writeColor(rgb, point, lineColor);
        point++;
      }
      for (let s = 0; s < LINE_SEGMENTS; s++) {
        cells[cell++] = 2;
        cells[cell++] = first + s;
        cells[cell++] = first + s + 1;
      }
    }
  }
  return { positions, colors: rgb, cells };
}
