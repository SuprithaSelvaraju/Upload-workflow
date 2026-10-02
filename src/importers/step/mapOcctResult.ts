import type { Bounds, LinearUnit, MeshData, PartNode, Rgb, SceneModel } from '../../domain/sceneModel';
import { ImportError } from '../errors';
import { computeVertexNormals } from './computeNormals';
import type { OcctImportResult, OcctNode } from './occtTypes';

export interface MapContext {
  sourceName: string;
  units: LinearUnit;
}

/**
 * OCCT result -> neutral SceneModel. Pure function (no OCCT, no DOM), so it can
 * run in the worker and be unit-tested on its own.
 *
 * Every array is COPIED into a fresh typed array. occt-import-js is an
 * Emscripten module; if it hands back views onto the WebAssembly heap,
 * transferring those buffers would detach the whole heap.
 */
export function mapOcctResult(result: OcctImportResult | null | undefined, ctx: MapContext): SceneModel {
  if (!result || !result.success) {
    throw new ImportError(
      'PARSE_FAILED',
      `${ctx.sourceName} could not be read as a STEP model.`,
      'The file may be damaged or use STEP features this reader does not support. Re-export it from the source tool, or try a different STEP schema (AP203, AP214 or AP242).',
    );
  }

  const meshes: MeshData[] = [];
  const meshIdByOcctIndex = new Map<number, number>();
  let skipped = 0;

  (result.meshes ?? []).forEach((m, occtIndex) => {
    const pos = m.attributes?.position?.array;
    const idx = m.index?.array;
    if (!pos || !idx || pos.length < 9 || idx.length < 3 || pos.length % 3 !== 0 || idx.length % 3 !== 0) {
      skipped++;
      return;
    }

    const positions = new Float32Array(pos);
    const indices = new Uint32Array(idx);
    if (!indicesInRange(indices, positions.length / 3)) {
      skipped++;
      return;
    }

    const nrm = m.attributes?.normal?.array;
    const normals = nrm && nrm.length === pos.length ? new Float32Array(nrm) : computeVertexNormals(positions, indices);

    const id = meshes.length;
    meshes.push({
      id,
      name: m.name || `Part ${id + 1}`,
      positions,
      normals,
      indices,
      color: normalizeColor(m.color),
    });
    meshIdByOcctIndex.set(occtIndex, id);
  });

  if (meshes.length === 0) {
    throw new ImportError(
      'EMPTY_MODEL',
      `${ctx.sourceName} was read successfully but contains no solid geometry to display.`,
      'Check that the export includes 3D solids or surfaces, not only drawings, annotations or point data.',
    );
  }

  let nextNodeId = 0;
  const mapNode = (n: OcctNode): PartNode => ({
    id: nextNodeId++,
    name: n.name || 'Unnamed',
    meshIds: (n.meshes ?? []).map((i) => meshIdByOcctIndex.get(i)).filter((v): v is number => v !== undefined),
    children: (n.children ?? []).map(mapNode),
  });
  const root: PartNode = result.root
    ? mapNode(result.root)
    : { id: 0, name: ctx.sourceName, meshIds: meshes.map((m) => m.id), children: [] };

  let triangleCount = 0;
  let vertexCount = 0;
  for (const m of meshes) {
    triangleCount += m.indices.length / 3;
    vertexCount += m.positions.length / 3;
  }

  const warnings: string[] = [];
  if (skipped > 0) {
    warnings.push(
      `${skipped} ${skipped === 1 ? 'mesh' : 'meshes'} had no usable triangles and ${skipped === 1 ? 'was' : 'were'} skipped.`,
    );
  }

  return {
    format: 'step',
    sourceName: ctx.sourceName,
    units: ctx.units,
    bounds: computeBounds(meshes),
    root,
    meshes,
    stats: { partCount: meshes.length, triangleCount, vertexCount },
    warnings,
  };
}

function indicesInRange(indices: Uint32Array, vertexCount: number): boolean {
  for (let i = 0; i < indices.length; i++) {
    if (indices[i] >= vertexCount) return false;
  }
  return true;
}

/** Accepts 0..1 (three.js style, what the README implies) or 0..255, and rejects anything non-finite. */
function normalizeColor(c: ArrayLike<number> | null | undefined): Rgb | null {
  if (!c || c.length < 3) return null;
  let r = c[0];
  let g = c[1];
  let b = c[2];
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null;
  if (r > 1 || g > 1 || b > 1) {
    r /= 255;
    g /= 255;
    b /= 255;
  }
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return [clamp(r), clamp(g), clamp(b)];
}

function computeBounds(meshes: MeshData[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const m of meshes) {
    const p = m.positions;
    for (let i = 0; i < p.length; i += 3) {
      if (p[i] < minX) minX = p[i];
      if (p[i] > maxX) maxX = p[i];
      if (p[i + 1] < minY) minY = p[i + 1];
      if (p[i + 1] > maxY) maxY = p[i + 1];
      if (p[i + 2] < minZ) minZ = p[i + 2];
      if (p[i + 2] > maxZ) maxZ = p[i + 2];
    }
  }
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}
