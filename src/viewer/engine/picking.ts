/**
 * Ray picking against the SceneModel's own triangle arrays. Pure maths: no vtk.js,
 * no DOM. The ray is built from the same OrbitState that positions the vtk.js
 * camera, so what you click is what the camera renders.
 *
 * Mesh index == SceneModel.meshes index == actor index in buildScene.
 */
import type { MeshData, Vec3 } from '../../domain/sceneModel';
import { cameraBasis, cameraPosition, type OrbitState } from './orbitMath';

export interface PickIndex {
  meshes: readonly MeshData[];
  /** Per mesh: min xyz / max xyz, double precision. */
  boxMin: Float64Array;
  boxMax: Float64Array;
}

export interface Ray {
  origin: Vec3;
  /** Unit length. */
  dir: Vec3;
}

export interface PickHit {
  meshId: number;
  distance: number;
}

const EPSILON = 1e-12;
const MIN_HIT_DISTANCE = 1e-9;

export function buildPickIndex(meshes: readonly MeshData[]): PickIndex {
  const boxMin = new Float64Array(meshes.length * 3);
  const boxMax = new Float64Array(meshes.length * 3);
  meshes.forEach((m, i) => {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    const p = m.positions;
    for (let k = 0; k < p.length; k += 3) {
      if (p[k] < minX) minX = p[k];
      if (p[k] > maxX) maxX = p[k];
      if (p[k + 1] < minY) minY = p[k + 1];
      if (p[k + 1] > maxY) maxY = p[k + 1];
      if (p[k + 2] < minZ) minZ = p[k + 2];
      if (p[k + 2] > maxZ) maxZ = p[k + 2];
    }
    boxMin.set([minX, minY, minZ], i * 3);
    boxMax.set([maxX, maxY, maxZ], i * 3);
  });
  return { meshes, boxMin, boxMax };
}

/** World-space ray through a pixel (measured from the viewport's top-left); vertical view angle. */
export function rayFromPixel(
  state: OrbitState,
  viewAngleRad: number,
  width: number,
  height: number,
  px: number,
  py: number,
): Ray {
  const { right, up, forward } = cameraBasis(state.azimuth, state.elevation);
  const tanHalf = Math.tan(viewAngleRad / 2);
  const aspect = width / Math.max(height, 1);
  const ndcX = (px / Math.max(width, 1)) * 2 - 1;
  const ndcY = 1 - (py / Math.max(height, 1)) * 2;
  const dx = forward[0] + right[0] * ndcX * tanHalf * aspect + up[0] * ndcY * tanHalf;
  const dy = forward[1] + right[1] * ndcX * tanHalf * aspect + up[1] * ndcY * tanHalf;
  const dz = forward[2] + right[2] * ndcX * tanHalf * aspect + up[2] * ndcY * tanHalf;
  const len = Math.hypot(dx, dy, dz);
  return { origin: cameraPosition(state), dir: [dx / len, dy / len, dz / len] };
}

/** Distance at which the ray enters the box, or -1 on a miss. */
function enterBox(o: Vec3, d: Vec3, min: Float64Array, max: Float64Array, i: number): number {
  let tNear = 0;
  let tFar = Infinity;
  for (let a = 0; a < 3; a++) {
    const lo = min[i * 3 + a];
    const hi = max[i * 3 + a];
    if (Math.abs(d[a]) < EPSILON) {
      if (o[a] < lo || o[a] > hi) return -1;
      continue;
    }
    let t1 = (lo - o[a]) / d[a];
    let t2 = (hi - o[a]) / d[a];
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tNear) tNear = t1;
    if (t2 < tFar) tFar = t2;
    if (tNear > tFar) return -1;
  }
  return tNear;
}

/** Nearest triangle distance on one mesh (double-sided, Moller-Trumbore), or `limit` if none is nearer. */
function nearestOnMesh(mesh: MeshData, o: Vec3, d: Vec3, limit: number): number {
  const p = mesh.positions;
  const idx = mesh.indices;
  let best = limit;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const e1x = p[b] - p[a], e1y = p[b + 1] - p[a + 1], e1z = p[b + 2] - p[a + 2];
    const e2x = p[c] - p[a], e2y = p[c + 1] - p[a + 1], e2z = p[c + 2] - p[a + 2];
    const hx = d[1] * e2z - d[2] * e2y;
    const hy = d[2] * e2x - d[0] * e2z;
    const hz = d[0] * e2y - d[1] * e2x;
    const det = e1x * hx + e1y * hy + e1z * hz;
    if (Math.abs(det) < EPSILON) continue;
    const f = 1 / det;
    const sx = o[0] - p[a], sy = o[1] - p[a + 1], sz = o[2] - p[a + 2];
    const u = f * (sx * hx + sy * hy + sz * hz);
    if (u < 0 || u > 1) continue;
    const qx = sy * e1z - sz * e1y;
    const qy = sz * e1x - sx * e1z;
    const qz = sx * e1y - sy * e1x;
    const v = f * (d[0] * qx + d[1] * qy + d[2] * qz);
    if (v < 0 || u + v > 1) continue;
    const dist = f * (e2x * qx + e2y * qy + e2z * qz);
    if (dist > MIN_HIT_DISTANCE && dist < best) best = dist;
  }
  return best;
}

/**
 * Nearest mesh under the ray. Boxes are tested first, nearest-entry first; triangle
 * tests run only for meshes whose box starts before the best hit found so far.
 */
export function pickRay(index: PickIndex, ray: Ray): PickHit | null {
  const candidates: { id: number; enter: number }[] = [];
  for (let i = 0; i < index.meshes.length; i++) {
    const enter = enterBox(ray.origin, ray.dir, index.boxMin, index.boxMax, i);
    if (enter >= 0) candidates.push({ id: i, enter });
  }
  candidates.sort((a, b) => a.enter - b.enter);

  let best = Infinity;
  let bestId = -1;
  for (const c of candidates) {
    if (c.enter > best) break;
    const hit = nearestOnMesh(index.meshes[c.id], ray.origin, ray.dir, best);
    if (hit < best) {
      best = hit;
      bestId = c.id;
    }
  }
  return bestId >= 0 ? { meshId: bestId, distance: best } : null;
}
