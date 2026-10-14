/**
 * Ray picking against the SceneModel's own triangle arrays. Pure maths: no vtk.js,
 * no DOM. The ray is built from the same OrbitState that positions the vtk.js
 * camera, so what you click is what the camera renders.
 *
 * Mesh index == SceneModel.meshes index == actor index in buildScene.
 *
 * Cost model (the picker runs on click and, throttled, on hover):
 *   1. broad phase  - one padded AABB slab test per mesh (linear, no allocation);
 *   2. ordering     - surviving meshes go through a binary heap in typed arrays, so
 *                     triangle work starts at the nearest box and stops as soon as a
 *                     box begins behind the best hit found;
 *   3. narrow phase - meshes up to BVH_MIN_TRIANGLES are scanned directly; larger ones
 *                     get a triangle BVH, built lazily the first time a ray reaches them.
 * `rayHitsAny` is the cheaper "is anything here?" query hover uses: no ordering, first hit wins.
 *
 * Nothing here allocates per query except the returned PickHit.
 */
import type { MeshData, Vec3 } from '../../domain/sceneModel';
import { cameraBasis, cameraPosition, type OrbitState } from './orbitMath';

export interface Ray {
  origin: Vec3;
  /** Unit length. */
  dir: Vec3;
  /** Only hits at distance in (tMin, tMax) count. Defaults: tiny epsilon, Infinity. */
  tMin?: number;
  tMax?: number;
}

/** A ray whose components can be rewritten in place (see createRay / rayFromPixelInto). */
export interface MutableRay extends Ray {
  origin: [number, number, number];
  dir: [number, number, number];
}

export interface PickHit {
  meshId: number;
  distance: number;
}

export interface PickIndex {
  meshes: readonly MeshData[];
  /** Per mesh: min xyz / max xyz, double precision, padded so edge-on rays never slip through. */
  boxMin: Float64Array;
  boxMax: Float64Array;
  /** Lazy per-mesh triangle BVHs (null until needed, or for small meshes). */
  bvh: (Bvh | null | undefined)[];
  /** One byte per mesh: 1 = hidden, skipped by every query (hidden geometry cannot be picked or hovered). */
  hidden: Uint8Array;
  scratch: Scratch;
}

/** Meshes with more triangles than this get a BVH; fewer are scanned linearly. */
export const BVH_MIN_TRIANGLES = 256;
const BVH_LEAF_SIZE = 8;
const EPSILON = 1e-12;
const MIN_HIT_DISTANCE = 1e-9;
/** Box padding as a fraction of the box's largest side, plus a tiny absolute floor. */
const BOX_PAD_FRACTION = 1e-4;
const BOX_PAD_ABS = 1e-6;
const STACK_SIZE = 128;

interface Scratch {
  heapKey: Float64Array;
  heapId: Int32Array;
  heapSize: number;
  stack: Int32Array;
  stackKey: Float64Array;
}

interface Bvh {
  /** Triangle indices, reordered so every leaf is a contiguous range. */
  tri: Uint32Array;
  /** Per node: min xyz, max xyz (6 doubles). Left child of an inner node is node+1. */
  box: Float64Array;
  /** Inner: index of the right child. Leaf: first slot in `tri`. */
  a: Int32Array;
  /** Leaf: triangle count (> 0). Inner: 0. */
  n: Int32Array;
}

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
    if (p.length === 0) {
      // Empty mesh: an inverted box no ray can enter.
      minX = minY = minZ = Infinity;
      maxX = maxY = maxZ = -Infinity;
    } else {
      const pad = Math.max(maxX - minX, maxY - minY, maxZ - minZ) * BOX_PAD_FRACTION + BOX_PAD_ABS;
      minX -= pad; minY -= pad; minZ -= pad;
      maxX += pad; maxY += pad; maxZ += pad;
    }
    boxMin[i * 3] = minX; boxMin[i * 3 + 1] = minY; boxMin[i * 3 + 2] = minZ;
    boxMax[i * 3] = maxX; boxMax[i * 3 + 1] = maxY; boxMax[i * 3 + 2] = maxZ;
  });
  return {
    meshes,
    boxMin,
    boxMax,
    bvh: new Array(meshes.length),
    hidden: new Uint8Array(meshes.length),
    scratch: {
      heapKey: new Float64Array(Math.max(meshes.length, 1)),
      heapId: new Int32Array(Math.max(meshes.length, 1)),
      heapSize: 0,
      stack: new Int32Array(STACK_SIZE),
      stackKey: new Float64Array(STACK_SIZE),
    },
  };
}

/** Copies a hidden mask (1 = hidden) into the index. Ignores a mask for a different mesh count. */
export function setPickHidden(index: PickIndex, mask: Uint8Array): void {
  if (mask.length === index.hidden.length) index.hidden.set(mask);
}

/** Pre-allocated ray for hot paths: fill it with `rayFromPixelInto`, reuse it forever. */
export function createRay(): MutableRay {
  return { origin: [0, 0, 0], dir: [0, 0, 1], tMin: 0, tMax: Infinity };
}

/**
 * Writes the world-space ray through a pixel (from the viewport's top-left; vertical
 * view angle) into `out`. When `near`/`far` are given (the camera's clipping range,
 * measured along the view axis) the ray's tMin/tMax are set so geometry the camera
 * clips can't be picked.
 */
export function rayFromPixelInto(
  out: MutableRay,
  state: OrbitState,
  viewAngleRad: number,
  width: number,
  height: number,
  px: number,
  py: number,
  near = 0,
  far = Infinity,
): MutableRay {
  const { right, up, forward } = cameraBasis(state.azimuth, state.elevation);
  const tanHalf = Math.tan(viewAngleRad / 2);
  const aspect = width / Math.max(height, 1);
  const ndcX = (px / Math.max(width, 1)) * 2 - 1;
  const ndcY = 1 - (py / Math.max(height, 1)) * 2;
  const sx = ndcX * tanHalf * aspect;
  const sy = ndcY * tanHalf;
  const dx = forward[0] + right[0] * sx + up[0] * sy;
  const dy = forward[1] + right[1] * sx + up[1] * sy;
  const dz = forward[2] + right[2] * sx + up[2] * sy;
  const len = Math.hypot(dx, dy, dz);
  const o = cameraPosition(state);
  out.origin[0] = o[0]; out.origin[1] = o[1]; out.origin[2] = o[2];
  out.dir[0] = dx / len; out.dir[1] = dy / len; out.dir[2] = dz / len;
  // Depth along the view axis is distance * cos(angle) and cos(angle) = 1/len here.
  out.tMin = near * len;
  out.tMax = far * len;
  return out;
}

/** Allocating convenience wrapper (tests, one-off use). Unclipped. */
export function rayFromPixel(
  state: OrbitState,
  viewAngleRad: number,
  width: number,
  height: number,
  px: number,
  py: number,
): Ray {
  return rayFromPixelInto(createRay(), state, viewAngleRad, width, height, px, py);
}

/**
 * Distance at which the ray enters the box within [tLo, tHi], or -1 on a miss.
 * Plain scalar arguments so nothing is allocated.
 */
function slab(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  lox: number, loy: number, loz: number,
  hix: number, hiy: number, hiz: number,
  tLo: number, tHi: number,
): number {
  let tNear = tLo;
  let tFar = tHi;
  if (Math.abs(dx) < EPSILON) {
    if (ox < lox || ox > hix) return -1;
  } else {
    let t1 = (lox - ox) / dx, t2 = (hix - ox) / dx;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tNear) tNear = t1;
    if (t2 < tFar) tFar = t2;
    if (tNear > tFar) return -1;
  }
  if (Math.abs(dy) < EPSILON) {
    if (oy < loy || oy > hiy) return -1;
  } else {
    let t1 = (loy - oy) / dy, t2 = (hiy - oy) / dy;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tNear) tNear = t1;
    if (t2 < tFar) tFar = t2;
    if (tNear > tFar) return -1;
  }
  if (Math.abs(dz) < EPSILON) {
    if (oz < loz || oz > hiz) return -1;
  } else {
    let t1 = (loz - oz) / dz, t2 = (hiz - oz) / dz;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tNear) tNear = t1;
    if (t2 < tFar) tFar = t2;
    if (tNear > tFar) return -1;
  }
  return tNear;
}

/** Moller-Trumbore, double-sided. Hit distance, or -1 when the triangle is missed. */
function triangleDistance(
  p: Float32Array, ia: number, ib: number, ic: number,
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
): number {
  const a = ia * 3, b = ib * 3, c = ic * 3;
  const e1x = p[b] - p[a], e1y = p[b + 1] - p[a + 1], e1z = p[b + 2] - p[a + 2];
  const e2x = p[c] - p[a], e2y = p[c + 1] - p[a + 1], e2z = p[c + 2] - p[a + 2];
  const hx = dy * e2z - dz * e2y;
  const hy = dz * e2x - dx * e2z;
  const hz = dx * e2y - dy * e2x;
  const det = e1x * hx + e1y * hy + e1z * hz;
  if (Math.abs(det) < EPSILON) return -1;
  const f = 1 / det;
  const sx = ox - p[a], sy = oy - p[a + 1], sz = oz - p[a + 2];
  const u = f * (sx * hx + sy * hy + sz * hz);
  if (u < 0 || u > 1) return -1;
  const qx = sy * e1z - sz * e1y;
  const qy = sz * e1x - sx * e1z;
  const qz = sx * e1y - sy * e1x;
  const v = f * (dx * qx + dy * qy + dz * qz);
  if (v < 0 || u + v > 1) return -1;
  return f * (e2x * qx + e2y * qy + e2z * qz);
}

// ---- per-mesh triangle BVH (lazy) -------------------------------------------

function buildBvh(mesh: MeshData): Bvh {
  const p = mesh.positions;
  const idx = mesh.indices;
  const triCount = idx.length / 3;
  const tri = new Uint32Array(triCount);
  const cen = new Float64Array(triCount * 3);
  for (let t = 0; t < triCount; t++) {
    tri[t] = t;
    const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3;
    cen[t * 3] = (p[a] + p[b] + p[c]) / 3;
    cen[t * 3 + 1] = (p[a + 1] + p[b + 1] + p[c + 1]) / 3;
    cen[t * 3 + 2] = (p[a + 2] + p[b + 2] + p[c + 2]) / 3;
  }
  const maxNodes = Math.max(1, 2 * Math.ceil(triCount / BVH_LEAF_SIZE) * 2);
  const box = new Float64Array(maxNodes * 6);
  const a = new Int32Array(maxNodes);
  const n = new Int32Array(maxNodes);
  let nodeCount = 0;

  const ctri = (slot: number, axis: number) => cen[tri[slot] * 3 + axis];

  /** Rearranges tri[lo..hi) so slots below `k` have centroids <= those from `k` on (quickselect). */
  function select(lo: number, hi: number, k: number, axis: number) {
    let l = lo, r = hi - 1;
    while (l < r) {
      const pivot = ctri((l + r) >> 1, axis);
      let i = l, j = r;
      while (i <= j) {
        while (ctri(i, axis) < pivot) i++;
        while (ctri(j, axis) > pivot) j--;
        if (i <= j) {
          const s = tri[i]; tri[i] = tri[j]; tri[j] = s;
          i++; j--;
        }
      }
      if (k <= j) r = j;
      else if (k >= i) l = i;
      else return;
    }
  }

  function build(lo: number, hi: number): number {
    const node = nodeCount++;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    let cMinX = Infinity, cMinY = Infinity, cMinZ = Infinity;
    let cMaxX = -Infinity, cMaxY = -Infinity, cMaxZ = -Infinity;
    for (let s = lo; s < hi; s++) {
      const t = tri[s];
      for (let v = 0; v < 3; v++) {
        const q = idx[t * 3 + v] * 3;
        if (p[q] < minX) minX = p[q];
        if (p[q] > maxX) maxX = p[q];
        if (p[q + 1] < minY) minY = p[q + 1];
        if (p[q + 1] > maxY) maxY = p[q + 1];
        if (p[q + 2] < minZ) minZ = p[q + 2];
        if (p[q + 2] > maxZ) maxZ = p[q + 2];
      }
      const cx = cen[t * 3], cy = cen[t * 3 + 1], cz = cen[t * 3 + 2];
      if (cx < cMinX) cMinX = cx;
      if (cx > cMaxX) cMaxX = cx;
      if (cy < cMinY) cMinY = cy;
      if (cy > cMaxY) cMaxY = cy;
      if (cz < cMinZ) cMinZ = cz;
      if (cz > cMaxZ) cMaxZ = cz;
    }
    const pad = Math.max(maxX - minX, maxY - minY, maxZ - minZ) * BOX_PAD_FRACTION + BOX_PAD_ABS;
    const o = node * 6;
    box[o] = minX - pad; box[o + 1] = minY - pad; box[o + 2] = minZ - pad;
    box[o + 3] = maxX + pad; box[o + 4] = maxY + pad; box[o + 5] = maxZ + pad;

    const count = hi - lo;
    const ex = cMaxX - cMinX, ey = cMaxY - cMinY, ez = cMaxZ - cMinZ;
    if (count <= BVH_LEAF_SIZE || Math.max(ex, ey, ez) === 0) {
      a[node] = lo;
      n[node] = count;
      return node;
    }
    const axis = ex >= ey && ex >= ez ? 0 : ey >= ez ? 1 : 2;
    const mid = (lo + hi) >> 1;
    select(lo, hi, mid, axis);
    build(lo, mid); // left child is always node + 1
    a[node] = build(mid, hi);
    n[node] = 0;
    return node;
  }

  build(0, triCount);
  return { tri, box, a, n };
}

function bvhFor(index: PickIndex, i: number): Bvh | null {
  let b = index.bvh[i];
  if (b === undefined) {
    const m = index.meshes[i];
    b = m.indices.length / 3 > BVH_MIN_TRIANGLES ? buildBvh(m) : null;
    index.bvh[i] = b;
  }
  return b;
}

/**
 * Nearest hit on one mesh with distance in (tMin, limit); returns `limit` if none.
 * `anyHit` returns on the first triangle found (hover only needs a yes/no).
 */
function traceMesh(
  index: PickIndex, i: number,
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  tMin: number, limit: number, anyHit: boolean,
): number {
  const mesh = index.meshes[i];
  const p = mesh.positions;
  const idx = mesh.indices;
  const bvh = bvhFor(index, i);
  let best = limit;

  if (!bvh) {
    for (let t = 0; t < idx.length; t += 3) {
      const dist = triangleDistance(p, idx[t], idx[t + 1], idx[t + 2], ox, oy, oz, dx, dy, dz);
      if (dist > tMin && dist < best) {
        best = dist;
        if (anyHit) return best;
      }
    }
    return best;
  }

  const { stack, stackKey } = index.scratch;
  let sp = 0;
  stack[sp] = 0;
  stackKey[sp++] = tMin;
  while (sp > 0) {
    sp--;
    const node = stack[sp];
    if (stackKey[sp] >= best) continue; // popped box starts behind the best hit
    const cnt = bvh.n[node];
    if (cnt > 0) {
      const first = bvh.a[node];
      for (let s = first; s < first + cnt; s++) {
        const t = bvh.tri[s] * 3;
        const dist = triangleDistance(p, idx[t], idx[t + 1], idx[t + 2], ox, oy, oz, dx, dy, dz);
        if (dist > tMin && dist < best) {
          best = dist;
          if (anyHit) return best;
        }
      }
      continue;
    }
    const left = node + 1;
    const right = bvh.a[node];
    const bx = bvh.box;
    const lo = left * 6, ro = right * 6;
    const tl = slab(ox, oy, oz, dx, dy, dz, bx[lo], bx[lo + 1], bx[lo + 2], bx[lo + 3], bx[lo + 4], bx[lo + 5], tMin, best);
    const tr = slab(ox, oy, oz, dx, dy, dz, bx[ro], bx[ro + 1], bx[ro + 2], bx[ro + 3], bx[ro + 4], bx[ro + 5], tMin, best);
    // Push the farther child first so the nearer one is popped next.
    if (tl >= 0 && tr >= 0) {
      if (sp + 2 > STACK_SIZE) return best; // unreachable for sane depths (<= ~40)
      if (tl <= tr) {
        stack[sp] = right; stackKey[sp++] = tr;
        stack[sp] = left; stackKey[sp++] = tl;
      } else {
        stack[sp] = left; stackKey[sp++] = tl;
        stack[sp] = right; stackKey[sp++] = tr;
      }
    } else if (tl >= 0) {
      stack[sp] = left; stackKey[sp++] = tl;
    } else if (tr >= 0) {
      stack[sp] = right; stackKey[sp++] = tr;
    }
  }
  return best;
}

// ---- binary min-heap over (box entry distance, mesh id), typed arrays --------

function heapPush(s: Scratch, key: number, id: number) {
  let i = s.heapSize++;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (s.heapKey[parent] <= key) break;
    s.heapKey[i] = s.heapKey[parent];
    s.heapId[i] = s.heapId[parent];
    i = parent;
  }
  s.heapKey[i] = key;
  s.heapId[i] = id;
}

/** Removes the minimum; its key/id must be read BEFORE calling (heapKey[0] / heapId[0]). */
function heapPop(s: Scratch) {
  const size = --s.heapSize;
  if (size <= 0) return;
  const key = s.heapKey[size];
  const id = s.heapId[size];
  let i = 0;
  for (;;) {
    let child = 2 * i + 1;
    if (child >= size) break;
    if (child + 1 < size && s.heapKey[child + 1] < s.heapKey[child]) child++;
    if (s.heapKey[child] >= key) break;
    s.heapKey[i] = s.heapKey[child];
    s.heapId[i] = s.heapId[child];
    i = child;
  }
  s.heapKey[i] = key;
  s.heapId[i] = id;
}

/**
 * Nearest mesh under the ray (within the ray's tMin/tMax), or null.
 */
export function pickRay(index: PickIndex, ray: Ray): PickHit | null {
  const [ox, oy, oz] = ray.origin;
  const [dx, dy, dz] = ray.dir;
  const tMin = Math.max(ray.tMin ?? 0, MIN_HIT_DISTANCE);
  const tMax = ray.tMax ?? Infinity;
  const { boxMin, boxMax, scratch } = index;

  scratch.heapSize = 0;
  for (let i = 0; i < index.meshes.length; i++) {
    if (index.hidden[i] === 1) continue;
    const o = i * 3;
    const enter = slab(ox, oy, oz, dx, dy, dz, boxMin[o], boxMin[o + 1], boxMin[o + 2], boxMax[o], boxMax[o + 1], boxMax[o + 2], tMin, tMax);
    if (enter >= 0) heapPush(scratch, enter, i);
  }

  let best = tMax;
  let bestId = -1;
  while (scratch.heapSize > 0) {
    const enter = scratch.heapKey[0];
    const id = scratch.heapId[0];
    heapPop(scratch);
    if (enter >= best) break; // every remaining box starts behind the best hit
    const hit = traceMesh(index, id, ox, oy, oz, dx, dy, dz, tMin, best, false);
    if (hit < best) {
      best = hit;
      bestId = id;
    }
  }
  return bestId >= 0 ? { meshId: bestId, distance: best } : null;
}

/** True if the ray hits any triangle. Cheaper than pickRay: no ordering, stops at the first hit. */
export function rayHitsAny(index: PickIndex, ray: Ray): boolean {
  const [ox, oy, oz] = ray.origin;
  const [dx, dy, dz] = ray.dir;
  const tMin = Math.max(ray.tMin ?? 0, MIN_HIT_DISTANCE);
  const tMax = ray.tMax ?? Infinity;
  const { boxMin, boxMax } = index;
  for (let i = 0; i < index.meshes.length; i++) {
    if (index.hidden[i] === 1) continue;
    const o = i * 3;
    const enter = slab(ox, oy, oz, dx, dy, dz, boxMin[o], boxMin[o + 1], boxMin[o + 2], boxMax[o], boxMax[o + 1], boxMax[o + 2], tMin, tMax);
    if (enter < 0) continue;
    if (traceMesh(index, i, ox, oy, oz, dx, dy, dz, tMin, tMax, true) < tMax) return true;
  }
  return false;
}
