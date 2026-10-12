/** Rough picker timings on a synthetic model shaped like the real one (362 parts, ~194k triangles). Run: npx tsx scripts/picking.bench.ts */
import type { MeshData } from '../src/domain/sceneModel';
import { buildPickIndex, createRay, pickRay, rayFromPixelInto, rayHitsAny } from '../src/viewer/engine/picking';
import { STANDARD_VIEWS, type OrbitState } from '../src/viewer/engine/orbitMath';

let seed = 3; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
function blob(id: number, c: number[], r: number, seg: number): MeshData {
  const p: number[] = [], ix: number[] = [];
  for (let i = 0; i <= seg; i++) for (let j = 0; j <= seg; j++) {
    const th = (i / seg) * Math.PI, ph = (j / seg) * 2 * Math.PI;
    p.push(c[0] + r * Math.sin(th) * Math.cos(ph), c[1] + r * Math.sin(th) * Math.sin(ph), c[2] + r * Math.cos(th));
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < seg; j++) { const a = i * (seg + 1) + j, d = a + seg + 1; ix.push(a, d, a + 1, a + 1, d, d + 1); }
  return { id, name: `P${id}`, positions: new Float32Array(p), normals: new Float32Array(p.length), indices: new Uint32Array(ix), color: null };
}
const meshes: MeshData[] = [];
// 6 heavy parts (~12k tris each) + 356 light ones (~340 tris each) ~= 194k triangles
for (let i = 0; i < 6; i++) meshes.push(blob(i, [(rnd() - .5) * 40, (rnd() - .5) * 40, rnd() * 10], 3, 78));
for (let i = 6; i < 362; i++) meshes.push(blob(i, [(rnd() - .5) * 40, (rnd() - .5) * 40, rnd() * 10], 0.5 + rnd(), 13));
const tris = meshes.reduce((n, m) => n + m.indices.length / 3, 0);

let t = performance.now();
const index = buildPickIndex(meshes);
const tIndex = performance.now() - t;
const st: OrbitState = { target: [0, 0, 5], ...STANDARD_VIEWS.iso, distance: 90 };
const ray = createRay();
const N = 2000;
const run = (fn: () => void) => { const t0 = performance.now(); for (let i = 0; i < N; i++) { rayFromPixelInto(ray, st, 0.61, 1600, 900, rnd() * 1600, rnd() * 900, 0.5, 400); fn(); } return (performance.now() - t0) / N; };
t = performance.now(); run(() => pickRay(index, ray)); const cold = (performance.now() - t) / N; // includes lazy BVH builds
const tBvh = performance.now() - t;
const pick = run(() => pickRay(index, ray));
const any = run(() => rayHitsAny(index, ray));
console.log(`${meshes.length} meshes, ${tris} triangles`);
console.log(`buildPickIndex (boxes only): ${tIndex.toFixed(1)} ms`);
console.log(`first ${N} picks incl. lazy BVH builds: ${tBvh.toFixed(0)} ms total`);
console.log(`warm pickRay: ${pick.toFixed(4)} ms/query   rayHitsAny (hover): ${any.toFixed(4)} ms/query   (cold avg ${cold.toFixed(3)})`);
