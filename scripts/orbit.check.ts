/**
 * Offline checks for the navigation maths and controller (no browser, no vtk.js).
 * Run:  npx tsx scripts/orbit.check.ts
 */
import assert from 'node:assert/strict';
import {
  ELEVATION_MAX, ELEVATION_MIN, STANDARD_VIEWS, cameraBasis, cameraPosition, clippingRange,
  fitDistance, lerpAngle, niceStep, orbitBy, panBy, projectAxis, wrapAngle, type OrbitState,
} from '../src/viewer/engine/orbitMath';
import { createOrbitController, type CameraRig } from '../src/viewer/engine/orbitController';

const close = (a: number, b: number, eps = 1e-9, msg = '') => assert.ok(Math.abs(a - b) < eps, `${msg} ${a} vs ${b}`);
const DEG = Math.PI / 180;
const base: OrbitState = { target: [0, 0, 0], ...STANDARD_VIEWS.iso, distance: 10 };

// ---- invariants: Z stays up, no roll, no flip, for 20k random states ----
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
for (let i = 0; i < 20000; i++) {
  const s = orbitBy(base, (rnd() - 0.5) * 20000, (rnd() - 0.5) * 20000);
  assert.ok(s.elevation >= ELEVATION_MIN && s.elevation <= ELEVATION_MAX, 'elevation clamped');
  assert.ok(s.azimuth > -Math.PI - 1e-12 && s.azimuth <= Math.PI + 1e-12, 'azimuth wrapped');
  const { right, up } = cameraBasis(s.azimuth, s.elevation);
  close(right[2], 0, 1e-12, 'camera right stays horizontal (no roll)');
  assert.ok(up[2] > 0, 'camera up always has +Z component (never upside down)');
}
// iso position: front-right corner, above ground
const p = cameraPosition(base);
assert.ok(p[0] > 0 && p[1] < 0 && p[2] > 0); close(p[0], -p[1]);
close(Math.hypot(...p), 10);

// ---- orbit semantics ----
assert.equal(orbitBy(base, 0, 1e6).elevation, ELEVATION_MAX);
assert.equal(orbitBy(base, 0, -1e6).elevation, ELEVATION_MIN);
close(orbitBy(base, 0, 0).azimuth, base.azimuth);
const turn = orbitBy(base, (2 * Math.PI) / 0.006, 0);                 // exactly one full turn of drag
close(wrapAngle(turn.azimuth - base.azimuth), 0, 1e-9, 'full horizontal rotation is unrestricted');
assert.ok(orbitBy(base, 100, 0).azimuth < base.azimuth, 'drag right -> azimuth decreases (model turns right)');

// ---- pan: point under cursor follows cursor ----
const panned = panBy(base, 50, 0, 800, 35 * DEG);
const { right } = cameraBasis(base.azimuth, base.elevation);
const moved = [panned.target[0], panned.target[1], panned.target[2]];
assert.ok(moved[0] * right[0] + moved[1] * right[1] < 0, 'drag right moves target left along camera-right');
close(panned.target[2], 0, 1e-12, 'horizontal pan has no vertical drift');
const wpp = (2 * 10 * Math.tan((35 * DEG) / 2)) / 800;
close(Math.hypot(...moved), 50 * wpp, 1e-9, 'pan distance = pixels * world-per-pixel');

// ---- fit: the sphere really fits, in landscape and portrait ----
for (const aspect of [0.5, 1, 1.78, 3]) {
  const R = 40, va = 35 * DEG, d = fitDistance(R, va, aspect, 1);
  const halfV = va / 2, halfH = Math.atan(Math.tan(halfV) * aspect);
  assert.ok(Math.asin(R / d) <= Math.min(halfV, halfH) + 1e-9, `fits at aspect ${aspect}`);
}

// ---- clipping range always valid ----
for (let i = 0; i < 2000; i++) {
  const s = orbitBy({ ...base, distance: 0.01 + rnd() * 500, target: [rnd() * 100, rnd() * 100, rnd() * 20] }, (rnd() - 0.5) * 9000, (rnd() - 0.5) * 9000);
  const [n, f] = clippingRange(s, [0, 0, 5], 150);
  assert.ok(n > 0 && f > n && Number.isFinite(f), 'valid near/far');
}

// ---- axis triad projection (standard isometric: X right-down, Y right-up, Z up) ----
const iso = STANDARD_VIEWS.iso;
const [xx, xy] = projectAxis([1, 0, 0], iso.azimuth, iso.elevation);
const [yx, yy] = projectAxis([0, 1, 0], iso.azimuth, iso.elevation);
const [zx, zy] = projectAxis([0, 0, 1], iso.azimuth, iso.elevation);
assert.ok(xx > 0 && xy < 0 && yx > 0 && yy > 0); close(zx, 0, 1e-12); assert.ok(zy > 0);
// standard views: top = plan (X right, Y up), front = X right, right = Y right
const t = STANDARD_VIEWS.top, f = STANDARD_VIEWS.front, r = STANDARD_VIEWS.right;
let [a, b] = projectAxis([1, 0, 0], t.azimuth, t.elevation); assert.ok(a > 0.99 && Math.abs(b) < 1e-6);
[a, b] = projectAxis([0, 1, 0], t.azimuth, t.elevation); assert.ok(Math.abs(a) < 1e-6 && b > 0.99);
[a, b] = projectAxis([1, 0, 0], f.azimuth, f.elevation); assert.ok(a > 0.99 && Math.abs(b) < 1e-6);
[a, b] = projectAxis([0, 0, 1], f.azimuth, f.elevation); assert.ok(Math.abs(a) < 1e-6 && b > 0.99);
[a, b] = projectAxis([0, 1, 0], r.azimuth, r.elevation); assert.ok(a > 0.99 && Math.abs(b) < 1e-6);

// ---- helpers ----
assert.equal(niceStep(6.25), 5); assert.equal(niceStep(0.9), 1); assert.equal(niceStep(130), 100);
assert.equal(niceStep(0.016), 0.02); assert.equal(niceStep(-3), 1); assert.equal(niceStep(NaN), 1);
close(lerpAngle(170 * DEG, -170 * DEG, 0.5), Math.PI, 1e-9, 'lerpAngle takes the short way round');

// ---- controller with simulated pointer/wheel events ----
class FakeHost extends EventTarget {
  style: Record<string, string> = {};
  captured = new Set<number>();
  setPointerCapture(id: number) { this.captured.add(id); }
  releasePointerCapture(id: number) { this.captured.delete(id); }
  hasPointerCapture(id: number) { return this.captured.has(id); }
}
function fire(host: FakeHost, type: string, props: Record<string, unknown> = {}) {
  const e = Object.assign(new Event(type, { cancelable: true }), { pointerId: 1, button: 0, shiftKey: false, clientX: 0, clientY: 0, deltaY: 0, deltaMode: 0 }, props);
  host.dispatchEvent(e);
  return e;
}
let applied = 0, last: OrbitState | null = null;
const rig: CameraRig = { viewAngleRad: 35 * DEG, viewportSize: () => ({ width: 1200, height: 800 }), apply: (s) => { applied++; last = s; } };
const host = new FakeHost();
const ctl = createOrbitController(host as unknown as HTMLElement, rig, base);
ctl.setLimits({ targetMin: [-100, -100, 0], targetMax: [100, 100, 60], minDistance: 1, maxDistance: 500 });

const down = fire(host, 'pointerdown', { clientX: 100, clientY: 100 });
assert.ok(down.defaultPrevented); assert.equal(host.style.cursor, 'grabbing');
fire(host, 'pointermove', { clientX: 160, clientY: 100 });                  // drag right
assert.ok(ctl.getState().azimuth < base.azimuth);
fire(host, 'pointermove', { clientX: 160, clientY: 100 + 100000 });         // absurd drag down
assert.equal(ctl.getState().elevation, ELEVATION_MAX, 'cannot orbit over the pole');
fire(host, 'pointermove', { clientX: 160, clientY: -100000 });              // absurd drag up
assert.equal(ctl.getState().elevation, ELEVATION_MIN, 'cannot orbit under the horizon');
fire(host, 'pointerup'); assert.equal(host.style.cursor, 'grab'); assert.equal(host.captured.size, 0);
const afterUp = applied; fire(host, 'pointermove', { clientX: 5, clientY: 5 }); assert.equal(applied, afterUp, 'no movement after release');

const before = ctl.getState().target;
fire(host, 'pointerdown', { button: 2, clientX: 0, clientY: 0 }); fire(host, 'pointermove', { clientX: 40, clientY: 30 }); fire(host, 'pointerup', { button: 2 });
assert.notDeepEqual(ctl.getState().target, before, 'right-drag pans');
const before2 = ctl.getState().target;
fire(host, 'pointerdown', { shiftKey: true }); fire(host, 'pointermove', { clientX: -40, clientY: 0 }); fire(host, 'pointerup');
assert.notDeepEqual(ctl.getState().target, before2, 'shift+left-drag pans');
// panning cannot lose the scene
fire(host, 'pointerdown', { button: 1 }); fire(host, 'pointermove', { clientX: 9e7, clientY: 9e7 }); fire(host, 'pointerup', { button: 1 });
const tg = ctl.getState().target; assert.ok(tg[0] >= -100 && tg[0] <= 100 && tg[1] >= -100 && tg[1] <= 100 && tg[2] >= 0 && tg[2] <= 60, 'target stays in limits');

const d0 = ctl.getState().distance; const w = fire(host, 'wheel', { deltaY: 120 });
assert.ok(w.defaultPrevented && ctl.getState().distance > d0, 'wheel down zooms out');
fire(host, 'wheel', { deltaY: -1e7 }); assert.equal(ctl.getState().distance, 1, 'zoom-in clamps at min distance');
fire(host, 'wheel', { deltaY: 1e7 }); assert.equal(ctl.getState().distance, 500, 'zoom-out clamps at max distance');
assert.ok(fire(host, 'contextmenu').defaultPrevented, 'context menu suppressed for right-drag pan');

ctl.jumpTo({ ...base, azimuth: 99, elevation: 99 });                         // out-of-range input is constrained too
assert.equal(ctl.getState().elevation, ELEVATION_MAX); assert.ok(Math.abs(ctl.getState().azimuth) <= Math.PI);

// animation reaches its goal exactly and takes the short way round
let now = 0; const g = globalThis as Record<string, unknown>;
g.requestAnimationFrame = (cb: (t: number) => void) => setTimeout(() => cb((now += 20)), 0) as unknown as number;
g.cancelAnimationFrame = (id: number) => clearTimeout(id);
const origPerf = performance.now.bind(performance); performance.now = () => 0;
ctl.jumpTo({ ...base, azimuth: 170 * DEG });
const goal: OrbitState = { target: [5, 5, 5], azimuth: -170 * DEG, elevation: 20 * DEG, distance: 40 };
let minAbsAz = Infinity;
ctl.subscribe((s) => { minAbsAz = Math.min(minAbsAz, Math.abs(s.azimuth)); });
ctl.animateTo(goal, 200);
await new Promise((r) => setTimeout(r, 400)); performance.now = origPerf;
const end = ctl.getState();
close(end.azimuth, goal.azimuth, 1e-9); close(end.distance, 40, 1e-9); close(end.elevation, goal.elevation, 1e-9);
assert.ok(minAbsAz > 170 * DEG - 1e-6, 'animation went through ±180°, not through 0°');

// dispose removes every listener
ctl.dispose(); const n = applied; fire(host, 'pointerdown'); fire(host, 'pointermove', { clientX: 50 }); fire(host, 'wheel', { deltaY: 100 });
assert.equal(applied, n, 'no events handled after dispose');
void last;
console.log('orbit math + controller: all checks passed');

// ================= environment geometry =================
import { buildGridLines, buildGroundMesh, planEnvironment, type EnvironmentColors } from '../src/viewer/engine/environmentGeometry';
const colors: EnvironmentColors = { background: [0.09, 0.09, 0.1], ground: [0.12, 0.12, 0.13], grid: [0.16, 0.16, 0.18], gridMajor: [0.23, 0.23, 0.26] };
const toRgb = (c: readonly number[]) => c.map((v) => Math.round(v * 255));

// a plant-sized model (metres), a tiny part, and a degenerate flat one
for (const [min, max] of [
  [[-37, 12, 0.3], [88, 140, 31]],
  [[0, 0, 0], [0.4, 0.3, 0.2]],
  [[5, 5, 5], [5, 5, 5]],
  [[-2000, -2000, -10], [2000, 2000, 90]],
] as const) {
  const plan = planEnvironment({ min, max });
  // spacing is a round 1/2/5 value, ground is a whole number of steps, lines are capped
  const m = plan.step / Math.pow(10, Math.floor(Math.log10(plan.step)));
  assert.ok([1, 2, 5].includes(Math.round(m)), `round step ${plan.step}`);
  close(plan.half / plan.step, Math.round(plan.half / plan.step), 1e-9, 'whole steps');
  assert.ok(plan.half / plan.step <= 150, 'line count capped');
  assert.ok(plan.half >= plan.modelRadius * 3 - 1e-9, 'ground reaches 3 model radii');
  close(plan.centerX / plan.step, Math.round(plan.centerX / plan.step), 1e-9, 'centre snapped to a round coordinate');
  assert.ok(plan.groundZ < plan.gridZ && plan.gridZ < min[2], 'ground below grid below the model: no z-fighting with its base');
  assert.ok(plan.targetMin[2] === min[2] && plan.targetMax[2] > max[2]);

  const ground = buildGroundMesh(plan, colors);
  const verts = ground.positions.length / 3;
  assert.equal(ground.colors.length, verts * 3);
  for (let i = 0; i < ground.cells.length; i += 4) {
    assert.equal(ground.cells[i], 3);
    for (let k = 1; k <= 3; k++) assert.ok(ground.cells[i + k] < verts, 'ground index in range');
  }
  // centre = ground colour, corner = background exactly (no visible edge)
  const mid = Math.floor(verts / 2);
  assert.deepEqual([...ground.colors.slice(mid * 3, mid * 3 + 3)], toRgb(colors.ground));
  assert.deepEqual([...ground.colors.slice(0, 3)], toRgb(colors.background));
  assert.deepEqual([...ground.colors.slice(-3)], toRgb(colors.background));

  const grid = buildGridLines(plan, colors);
  const gverts = grid.positions.length / 3;
  assert.equal(grid.colors.length, gverts * 3);
  for (let i = 0; i < grid.cells.length; i += 3) {
    assert.equal(grid.cells[i], 2);
    assert.ok(grid.cells[i + 1] < gverts && grid.cells[i + 2] < gverts, 'grid index in range');
  }
  // every grid vertex lies on the floor, within the ground square, and every colour is finite
  for (let i = 0; i < gverts; i++) {
    close(grid.positions[i * 3 + 2], plan.gridZ, 1e-3);
    assert.ok(Math.abs(grid.positions[i * 3] - plan.centerX) <= plan.half + 1e-3);
  }
  // line ends at the far edge are blended fully into the ground (= background there)
  const bg = toRgb(colors.background);
  assert.deepEqual([...grid.colors.slice(0, 3)], bg, 'grid fades out at the edge');
  // major lines land on round WORLD coordinates (multiples of 5 steps): every unfaded major-coloured
  // vertex lies on a line, so at least one of its x / y must be a multiple of 5 steps.
  const majorR = Math.round(colors.gridMajor[0] * 255);
  // positions are Float32, so allow for float32 rounding relative to the line spacing
  const isRound = (v: number) => {
    const unit = plan.step * plan.majorEvery;
    return Math.abs(v / unit - Math.round(v / unit)) < 1e-4 + (Math.abs(v) * 2.4e-7) / unit;
  };
  let majorVertices = 0;
  for (let i = 0; i < gverts; i++) {
    if (grid.colors[i * 3] !== majorR) continue;
    majorVertices++;
    assert.ok(isRound(grid.positions[i * 3]) || isRound(grid.positions[i * 3 + 1]), `major vertex off the round grid at ${grid.positions[i * 3]}, ${grid.positions[i * 3 + 1]}`);
  }
  assert.ok(majorVertices > 0, 'there are major lines');
}
console.log('environment geometry: all checks passed');
