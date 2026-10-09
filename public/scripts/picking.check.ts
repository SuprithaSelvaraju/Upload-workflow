/** Offline checks for ray picking and tap detection. Run: npx tsx scripts/picking.check.ts */
import assert from 'node:assert/strict';
import type { MeshData } from '../src/domain/sceneModel';
import { buildPickIndex, pickRay, rayFromPixel } from '../src/viewer/engine/picking';
import { STANDARD_VIEWS, cameraBasis, cameraPosition, type OrbitState } from '../src/viewer/engine/orbitMath';
import { createOrbitController, type CameraRig } from '../src/viewer/engine/orbitController';

const DEG = Math.PI / 180;
const close = (a: number, b: number, eps = 1e-6, m = '') => assert.ok(Math.abs(a - b) < eps, `${m} ${a} vs ${b}`);

function box(id: number, c: [number, number, number], h: number): MeshData {
  const p: number[] = [];
  for (const dz of [-1, 1]) for (const dy of [-1, 1]) for (const dx of [-1, 1]) p.push(c[0] + dx * h, c[1] + dy * h, c[2] + dz * h);
  const q = (a: number, b: number, cc: number, d: number) => [a, b, cc, a, cc, d];
  const idx = [...q(0,1,3,2), ...q(4,6,7,5), ...q(0,4,5,1), ...q(2,3,7,6), ...q(0,2,6,4), ...q(1,5,7,3)];
  return { id, name: `Box ${id}`, positions: new Float32Array(p), normals: new Float32Array(p.length), indices: new Uint32Array(idx), color: null };
}

const W = 1200, H = 800, VA = 35 * DEG, tanHalf = Math.tan(VA / 2), aspect = W / H;
const state: OrbitState = { target: [0, 0, 0], ...STANDARD_VIEWS.iso, distance: 30 };
const { right, up, forward } = cameraBasis(state.azimuth, state.elevation);
const cam = cameraPosition(state);
const along = (t: number, r = 0, u = 0): [number, number, number] =>
  [0, 1, 2].map((k) => cam[k] + forward[k] * t + right[k] * r + up[k] * u) as [number, number, number];

// near box, far box directly behind it, side box off-axis to the right and above centre
const meshes = [box(0, along(30), 1), box(1, along(45), 1), box(2, along(30, 6, 3), 1)];
const index = buildPickIndex(meshes);

// centre pixel -> ray along the view direction, from the camera
const centre = rayFromPixel(state, VA, W, H, W / 2, H / 2);
for (let k = 0; k < 3; k++) { close(centre.dir[k], forward[k], 1e-9); close(centre.origin[k], cam[k], 1e-9); }

// occlusion: the NEAR box wins, even though the far box is also on the ray
assert.equal(pickRay(index, centre)?.meshId, 0, 'nearest part is picked');
const d0 = pickRay(index, centre)!.distance;
assert.ok(d0 >= 30 - Math.sqrt(3) - 1e-3 && d0 <= 29 + 1e-3, `hit lies on the near surface of the cube (got ${d0})`); // iso view: nearest corner, not a flat face

// pixel convention: project the side box centre by hand, click that pixel -> that box (right = +x px, up = -y px)
const depth = 30, rr = 6, uu = 3;
const px = W / 2 + (rr / (depth * tanHalf * aspect)) * (W / 2);
const py = H / 2 - (uu / (depth * tanHalf)) * (H / 2);
assert.equal(pickRay(index, rayFromPixel(state, VA, W, H, px, py))?.meshId, 2, 'pixel->ray convention matches projection');
// mirrored pixel (wrong side) misses everything
assert.equal(pickRay(index, rayFromPixel(state, VA, W, H, W - px, py)), null, 'empty space misses');
assert.equal(pickRay(index, rayFromPixel(state, VA, W, H, 5, 5)), null, 'corner misses');

// a ray starting INSIDE nothing, pointing away, misses
assert.equal(pickRay(index, { origin: cam, dir: forward.map((v) => -v) as [number, number, number] }), null, 'nothing behind the camera');
assert.equal(pickRay(buildPickIndex([]), centre), null, 'empty model');

// many meshes: result equals brute force over all triangles
let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const many = Array.from({ length: 200 }, (_, i) => box(i, [(rnd() - 0.5) * 60, (rnd() - 0.5) * 60, (rnd() - 0.5) * 20], 0.5 + rnd()));
const mi = buildPickIndex(many);
for (let n = 0; n < 300; n++) {
  const ray = rayFromPixel(state, VA, W, H, rnd() * W, rnd() * H);
  const fast = pickRay(mi, ray);
  // brute force: per-mesh nearest, no box culling
  let best = Infinity, id = -1;
  for (const m of many) {
    const single = pickRay(buildPickIndex([m]), ray);
    if (single && single.distance < best) { best = single.distance; id = m.id; }
  }
  assert.equal(fast?.meshId ?? -1, id, `ray ${n}`);
}

// ---- tap vs drag in the controller ----
class FakeHost extends EventTarget {
  style: Record<string, string> = {}; captured = new Set<number>();
  setPointerCapture(i: number) { this.captured.add(i); } releasePointerCapture(i: number) { this.captured.delete(i); } hasPointerCapture(i: number) { return this.captured.has(i); }
}
const fire = (h: FakeHost, type: string, p: Record<string, unknown> = {}) =>
  h.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { pointerId: 1, button: 0, shiftKey: false, clientX: 0, clientY: 0, deltaY: 0, deltaMode: 0 }, p));
const rig: CameraRig = { viewAngleRad: VA, viewportSize: () => ({ width: W, height: H }), apply: () => {} };
const taps: { x: number; y: number }[] = [];
const host = new FakeHost();
const ctl = createOrbitController(host as unknown as HTMLElement, rig, state, (pt) => taps.push(pt));

fire(host, 'pointerdown', { clientX: 100, clientY: 100 }); fire(host, 'pointerup', { clientX: 100, clientY: 100 });
assert.deepEqual(taps, [{ x: 100, y: 100 }], 'press+release without movement = tap');
fire(host, 'pointerdown', { clientX: 100, clientY: 100 }); fire(host, 'pointermove', { clientX: 102, clientY: 101 }); fire(host, 'pointerup', { clientX: 102, clientY: 101 });
assert.equal(taps.length, 2, 'jitter within slop still a tap');
const az = ctl.getState().azimuth;
fire(host, 'pointerdown', { clientX: 100, clientY: 100 }); fire(host, 'pointermove', { clientX: 160, clientY: 100 }); fire(host, 'pointerup', { clientX: 160, clientY: 100 });
assert.equal(taps.length, 2, 'an orbit drag is NOT a tap'); assert.notEqual(ctl.getState().azimuth, az, 'and it still orbits');
fire(host, 'pointerdown', { clientX: 5, clientY: 5, button: 2 }); fire(host, 'pointerup', { clientX: 5, clientY: 5, button: 2 });
fire(host, 'pointerdown', { clientX: 5, clientY: 5, shiftKey: true }); fire(host, 'pointerup', { clientX: 5, clientY: 5, shiftKey: true });
assert.equal(taps.length, 2, 'right / shift clicks (pan) are not taps');
fire(host, 'pointerdown', { clientX: 5, clientY: 5 }); fire(host, 'pointercancel', { clientX: 5, clientY: 5 });
assert.equal(taps.length, 2, 'cancelled press is not a tap');
ctl.dispose();
console.log('picking + tap detection: all checks passed');
