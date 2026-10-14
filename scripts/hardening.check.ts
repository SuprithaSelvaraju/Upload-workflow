/** Offline checks for Slice 1.2 hardening. Run: npx tsx scripts/hardening.check.ts */
import assert from 'node:assert/strict';
import type { MeshData } from '../src/domain/sceneModel';
import { BVH_MIN_TRIANGLES, buildPickIndex, createRay, pickRay, rayFromPixelInto, rayHitsAny, setPickHidden, type Ray } from '../src/viewer/engine/picking';
import { STANDARD_VIEWS, type OrbitState } from '../src/viewer/engine/orbitMath';
import { createOrbitController, type CameraRig } from '../src/viewer/engine/orbitController';
import { createHoverProbe } from '../src/viewer/engine/hoverProbe';
import { createSelectionHighlighter } from '../src/viewer/engine/selectionHighlighter';

let seed = 11; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

/** Triangulated UV sphere: lots of triangles in one mesh, to force the BVH path. */
function sphere(id: number, c: [number, number, number], r: number, seg: number): MeshData {
  const p: number[] = []; const idx: number[] = [];
  for (let i = 0; i <= seg; i++) for (let j = 0; j <= seg; j++) {
    const th = (i / seg) * Math.PI, ph = (j / seg) * 2 * Math.PI;
    p.push(c[0] + r * Math.sin(th) * Math.cos(ph), c[1] + r * Math.sin(th) * Math.sin(ph), c[2] + r * Math.cos(th));
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < seg; j++) {
    const a = i * (seg + 1) + j, b = a + 1, d = a + seg + 1, e = d + 1;
    idx.push(a, d, b, b, d, e);
  }
  return { id, name: `S${id}`, positions: new Float32Array(p), normals: new Float32Array(p.length), indices: new Uint32Array(idx), color: null };
}
const quad = (id: number, z: number, h = 1): MeshData => ({
  id, name: `Q${id}`, positions: new Float32Array([-h, -h, z, h, -h, z, h, h, z, -h, h, z]), normals: new Float32Array(12),
  indices: new Uint32Array([0, 1, 2, 0, 2, 3]), color: null,
});
const ray = (o: [number, number, number], d: [number, number, number], tMin?: number, tMax?: number): Ray => ({ origin: o, dir: d, tMin, tMax });

// ---- BVH path agrees with brute force ----
const big = [sphere(0, [0, 0, 0], 5, 60), sphere(1, [3, 1, 0], 4, 40), sphere(2, [-6, 0, 2], 2, 8)];
assert.ok(big[0].indices.length / 3 > BVH_MIN_TRIANGLES * 4, 'test mesh is big enough for BVH');
const bigIdx = buildPickIndex(big);
const brute = (r: Ray) => {
  let best = Infinity, id = -1;
  // truth: plain O(all triangles) loop, independent of the BVH code
  for (const m of big) {
    const p = m.positions, ix = m.indices;
    for (let t = 0; t < ix.length; t += 3) {
      const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
      const e1 = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]], e2 = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
      const d = r.dir, h = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
      const det = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2];
      if (Math.abs(det) < 1e-12) continue;
      const f = 1 / det, s = [r.origin[0] - p[a], r.origin[1] - p[a + 1], r.origin[2] - p[a + 2]];
      const u = f * (s[0] * h[0] + s[1] * h[1] + s[2] * h[2]); if (u < 0 || u > 1) continue;
      const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
      const v = f * (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]); if (v < 0 || u + v > 1) continue;
      const t0 = f * (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]);
      if (t0 > 1e-9 && t0 < best) { best = t0; id = m.id; }
    }
  }
  return { best, id };
};
let hits = 0;
for (let n = 0; n < 400; n++) {
  const o: [number, number, number] = [(rnd() - 0.5) * 40, (rnd() - 0.5) * 40, 30];
  const tgt = [(rnd() - 0.5) * 16, (rnd() - 0.5) * 16, 0];
  const dd = [tgt[0] - o[0], tgt[1] - o[1], tgt[2] - o[2]]; const L = Math.hypot(...dd);
  const r = ray(o, dd.map((v) => v / L) as [number, number, number]);
  const truth = brute(r), got = pickRay(bigIdx, r);
  assert.equal(got?.meshId ?? -1, truth.id, `bvh ray ${n}`);
  if (got) { hits++; assert.ok(Math.abs(got.distance - truth.best) < 1e-6, `distance ${n}`); }
  assert.equal(rayHitsAny(bigIdx, r), truth.id >= 0, `any-hit agrees ${n}`);
}
assert.ok(hits > 100, `enough rays actually hit (${hits})`);

// ---- near / far clipping ----
const two = buildPickIndex([quad(0, 0), quad(1, -10)]);
assert.equal(pickRay(two, ray([0, 0, 10], [0, 0, -1]))?.meshId, 0, 'nearest wins');
assert.equal(pickRay(two, ray([0, 0, 10], [0, 0, -1], 11))?.meshId, 1, 'hit nearer than tMin is clipped away');
assert.equal(pickRay(two, ray([0, 0, 10], [0, 0, -1], 0, 15))?.meshId, 0, 'tMax keeps near hit');
assert.equal(pickRay(two, ray([0, 0, 10], [0, 0, -1], 11, 15)), null, 'both hits outside [tMin,tMax]');
assert.equal(rayHitsAny(two, ray([0, 0, 10], [0, 0, -1], 11, 15)), false, 'any-hit honours range');
assert.equal(rayHitsAny(two, ray([0, 0, 10], [0, 0, -1])), true);

// clipping inside one mesh (small linear path and BVH path): near surface clipped, far surface still hit
for (const seg of [6, 60]) {
  const sp = buildPickIndex([sphere(0, [0, 0, 0], 5, seg)]);
  const full = pickRay(sp, ray([0, 0.01, 20], [0, 0, -1]))!;
  const clipped = pickRay(sp, ray([0, 0.01, 20], [0, 0, -1], 20))!; // camera "near plane" 20 units out: inside the sphere
  assert.ok(full.distance < 16 && clipped.distance > 20 && clipped.distance < 31, `seg ${seg}: near hit clipped, far hit found (${full.distance} / ${clipped.distance})`);
}

// ray built from the camera: tMin/tMax come from near/far along the VIEW axis, so off-axis rays scale by 1/cos
const st: OrbitState = { target: [0, 0, 0], ...STANDARD_VIEWS.iso, distance: 30 };
const centre = rayFromPixelInto(createRay(), st, 0.6, 1200, 800, 600, 400, 5, 100);
assert.ok(Math.abs(centre.tMin! - 5) < 1e-9 && Math.abs(centre.tMax! - 100) < 1e-9, 'centre ray: tMin=near');
const edge = rayFromPixelInto(createRay(), st, 0.6, 1200, 800, 0, 0, 5, 100);
assert.ok(edge.tMin! > 5, 'off-axis ray: larger distance for same depth');
const reused = createRay();
assert.equal(rayFromPixelInto(reused, st, 0.6, 1200, 800, 10, 10), reused, 'fills the ray it is given');

// padding: a ray grazing exactly along a flat quad's plane edge still reaches the mesh box
assert.equal(pickRay(buildPickIndex([quad(0, 0)]), ray([0.5, -5, 0], [0, 1, 0])), null, 'edge-on ray through a flat quad has no area to hit (no false positive)');
assert.equal(pickRay(buildPickIndex([quad(0, 0)]), ray([0.5, 0.5, 5], [0, 0, -1]))?.meshId, 0, 'flat (zero-thickness) box is still hittable');

// empty mesh never hit
const withEmpty = buildPickIndex([{ id: 0, name: 'e', positions: new Float32Array(0), normals: new Float32Array(0), indices: new Uint32Array(0), color: null }, quad(1, 0)]);
assert.equal(pickRay(withEmpty, ray([0, 0, 5], [0, 0, -1]))?.meshId, 1, 'empty mesh ignored');

// ---- hover probe ----
function harness(cost: () => number) {
  let t = 0; let nextFrame = 0; const frames = new Map<number, () => void>();
  const probes: [number, number][] = []; const results: boolean[] = [];
  const probe = createHoverProbe({
    probe: (x, y) => { probes.push([x, y]); t += cost(); return x > 0; },
    onResult: (o) => results.push(o),
    requestFrame: (cb) => { frames.set(++nextFrame, cb); return nextFrame; },
    cancelFrame: (h) => frames.delete(h),
    now: () => t,
  });
  const tick = (dt = 16) => { t += dt; const f = [...frames]; frames.clear(); f.forEach(([, cb]) => cb()); };
  return { probe, probes, results, tick, pending: () => frames.size };
}
{
  const h = harness(() => 0.1);
  for (let i = 1; i <= 50; i++) h.probe.move({ x: i, y: 0 });
  assert.equal(h.pending(), 1, '50 moves -> one scheduled frame');
  h.tick();
  assert.deepEqual(h.probes, [[50, 0]], 'only the newest point is probed');
  assert.deepEqual(h.results, [true]);
  h.probe.move({ x: 0, y: 0 }); h.tick();
  assert.deepEqual(h.results, [true, false], 'result only reported on change');
  h.probe.move({ x: 5, y: 5 }); h.probe.move(null);
  assert.equal(h.pending(), 0, 'leaving cancels pending work'); h.tick();
  assert.equal(h.probes.length, 2);
  h.probe.move({ x: 7, y: 0 }); h.tick(); h.probe.reset();
  assert.equal(h.results.at(-1), false, 'reset reports not-over');
  h.probe.dispose(); h.probe.move({ x: 9, y: 0 }); assert.equal(h.pending(), 0, 'no work after dispose');
}
{
  const h = harness(() => 20); // slow probe -> backoff
  h.probe.move({ x: 1, y: 0 }); h.tick(); // probe 1 (cost 20ms -> interval 80ms)
  h.probe.move({ x: 2, y: 0 }); h.tick(16);
  assert.equal(h.probes.length, 1, 'backed off: too soon');
  assert.equal(h.pending(), 1, 'but a trailing probe stays scheduled');
  for (let i = 0; i < 10 && h.probes.length < 2; i++) h.tick(16);
  assert.deepEqual(h.probes.at(-1), [2, 0], 'trailing probe lands on the last point');
}

// ---- highlighter: reversible, no accumulation ----
{
  const painted = new Map<number, boolean>(); let paints = 0;
  const hl = createSelectionHighlighter(5, (i, on) => { paints++; painted.set(i, on); });
  assert.equal(hl.set(2), true); assert.equal(hl.set(2), false, 'same id is a no-op');
  assert.equal(hl.set(4), true);
  assert.equal(painted.get(2), false, 'previous selection restored'); assert.equal(painted.get(4), true);
  for (let k = 0; k < 1000; k++) hl.set(k % 5);
  const on = [...painted].filter(([, v]) => v).map(([i]) => i);
  assert.equal(on.length, 1, 'exactly one painted-on mesh after 1000 selections'); assert.deepEqual(on, [...hl.selected]);
  hl.set(99); assert.equal(hl.selected.size, 0, 'out of range clears');
  hl.set(1.5 as number); assert.equal(hl.selected.size, 0, 'non-integer ignored');
  // multi-mesh (group selection): only the difference is repainted
  hl.setMany([0, 1, 2]); paints = 0;
  assert.equal(hl.setMany([1, 2, 3]), true); assert.equal(paints, 2, 'moving a selection repaints only what changed (0 off, 3 on)');
  assert.deepEqual([...painted].filter(([, v]) => v).map(([i]) => i).sort(), [1, 2, 3]);
  assert.equal(hl.setMany([3, 2, 1, 1]), false, 'same set in a different order is a no-op');
  hl.setMany([]); assert.ok([...painted.values()].every((v) => !v), 'clearing restores every mesh');
  hl.set(3); hl.dispose(); assert.equal(hl.set(1), false, 'inert after dispose');
}

// ---- hidden meshes are not pickable or hoverable ----
{
  const front = quad(0, 0), back = quad(1, -10);
  const idx = buildPickIndex([front, back]);
  const r = ray([0, 0, 10], [0, 0, -1]);
  assert.equal(pickRay(idx, r)?.meshId, 0);
  setPickHidden(idx, new Uint8Array([1, 0]));
  assert.equal(pickRay(idx, r)?.meshId, 1, 'ray passes through a hidden mesh to the one behind');
  assert.equal(rayHitsAny(idx, r), true);
  setPickHidden(idx, new Uint8Array([1, 1]));
  assert.equal(pickRay(idx, r), null, 'all hidden: nothing to pick'); assert.equal(rayHitsAny(idx, r), false, 'and nothing to hover');
  setPickHidden(idx, new Uint8Array([0]));  // wrong length: ignored
  assert.equal(pickRay(idx, r), null, 'a mask for a different mesh count is ignored');
  setPickHidden(idx, new Uint8Array([0, 0]));
  assert.equal(pickRay(idx, r)?.meshId, 0, 'showing again makes it pickable');
  // BVH path honours the mask as well
  const sph = buildPickIndex([sphere(0, [0, 0, 0], 5, 60), sphere(1, [0, 0, 0], 3, 30)]);
  const sr = ray([0, 0.01, 20], [0, 0, -1]);
  assert.equal(pickRay(sph, sr)?.meshId, 0); setPickHidden(sph, new Uint8Array([1, 0]));
  assert.equal(pickRay(sph, sr)?.meshId, 1, 'large (BVH) mesh can be hidden too');
}

// ---- controller: hover, cursor, stale drag, touch slop ----
class FakeHost extends EventTarget {
  style: Record<string, string> = {}; captured = new Set<number>();
  setPointerCapture(i: number) { this.captured.add(i); } releasePointerCapture(i: number) { this.captured.delete(i); } hasPointerCapture(i: number) { return this.captured.has(i); }
}
const fire = (h: FakeHost, type: string, p: Record<string, unknown> = {}) =>
  h.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { pointerId: 1, button: 0, shiftKey: false, clientX: 0, clientY: 0, deltaY: 0, deltaMode: 0 }, p));
const rig: CameraRig = { viewAngleRad: 0.6, viewportSize: () => ({ width: 1200, height: 800 }), apply: () => {} };
{
  const host = new FakeHost(); const taps: unknown[] = []; const hovers: unknown[] = [];
  const ctl = createOrbitController(host as unknown as HTMLElement, rig, st, { onTap: (p) => taps.push(p), onHover: (p) => hovers.push(p) });
  assert.equal(host.style.cursor, 'grab', 'idle: navigation cursor');
  fire(host, 'pointermove', { clientX: 10, clientY: 10, pointerType: 'mouse', buttons: 0 });
  assert.deepEqual(hovers, [{ x: 10, y: 10 }], 'idle move -> hover');
  ctl.setHoverTarget(true); assert.equal(host.style.cursor, 'pointer', 'over geometry: pointer');
  fire(host, 'pointermove', { clientX: 10, clientY: 10, pointerType: 'touch' });
  assert.equal(hovers.length, 1, 'touch never hovers');
  fire(host, 'pointerdown', { clientX: 10, clientY: 10, pointerType: 'mouse', buttons: 1 });
  assert.equal(host.style.cursor, 'grabbing', 'drag overrides pointer');
  fire(host, 'pointermove', { clientX: 60, clientY: 10, pointerType: 'mouse', buttons: 1 });
  assert.equal(hovers.length, 1, 'no hover while dragging');
  fire(host, 'pointerup', { clientX: 60, clientY: 10, pointerType: 'mouse' });
  assert.equal(taps.length, 0, 'drag is not a tap'); assert.equal(host.style.cursor, 'pointer', 'cursor returns to hover state');
  assert.equal(hovers.length, 2, 'hover re-evaluated after the drag ends');
  ctl.setHoverTarget(false); assert.equal(host.style.cursor, 'grab');
  fire(host, 'pointerdown', { clientX: 5, clientY: 5, button: 2, pointerType: 'mouse', buttons: 2 });
  assert.equal(host.style.cursor, 'move', 'right drag = pan cursor'); fire(host, 'pointerup', { clientX: 5, clientY: 5, button: 2, pointerType: 'mouse' });
  assert.equal(taps.length, 0, 'right click never taps');
  fire(host, 'pointerleave', { pointerType: 'mouse' }); assert.equal(hovers.at(-1), null, 'leave -> null');
  fire(host, 'wheel', { deltaY: 100, clientX: 30, clientY: 40 });
  assert.deepEqual(hovers.at(-1), { x: 30, y: 40 }, 'wheel re-probes the hover');

  // stale drag: release never delivered, buttons now 0 -> self-heals, does NOT orbit or tap
  const az = ctl.getState().azimuth;
  fire(host, 'pointerdown', { clientX: 100, clientY: 100, pointerType: 'mouse', buttons: 1 });
  fire(host, 'pointermove', { clientX: 140, clientY: 100, pointerType: 'mouse', buttons: 0 });
  assert.equal(ctl.getState().azimuth, az, 'no orbit once buttons are up');
  assert.equal(host.style.cursor, 'grab'); assert.equal(taps.length, 0);
  // lost capture ends a drag
  fire(host, 'pointerdown', { clientX: 100, clientY: 100, pointerType: 'mouse', buttons: 1 });
  fire(host, 'lostpointercapture', { pointerType: 'mouse' }); assert.equal(host.style.cursor, 'grab', 'lost capture ends drag');
  // a new press after a missed release works
  fire(host, 'pointerdown', { clientX: 100, clientY: 100, pointerType: 'mouse', buttons: 1 });
  fire(host, 'pointerdown', { clientX: 100, clientY: 100, pointerType: 'mouse', buttons: 1 });
  fire(host, 'pointerup', { clientX: 100, clientY: 100, pointerType: 'mouse' });
  assert.equal(taps.length, 1, 'press after a missed release still taps');
  // touch slop is wider than mouse slop
  fire(host, 'pointerdown', { clientX: 0, clientY: 0, pointerType: 'touch', buttons: 1 });
  fire(host, 'pointermove', { clientX: 8, clientY: 0, pointerType: 'touch', buttons: 1 });
  fire(host, 'pointerup', { clientX: 8, clientY: 0, pointerType: 'touch' });
  assert.equal(taps.length, 2, '8px touch jitter is still a tap');
  fire(host, 'pointerdown', { clientX: 0, clientY: 0, pointerType: 'mouse', buttons: 1 });
  fire(host, 'pointermove', { clientX: 8, clientY: 0, pointerType: 'mouse', buttons: 1 });
  fire(host, 'pointerup', { clientX: 8, clientY: 0, pointerType: 'mouse' });
  assert.equal(taps.length, 2, '8px mouse move is a drag');
  ctl.dispose(); assert.equal(host.style.cursor, '', 'dispose releases the cursor');
}
console.log('hardening: all checks passed');
