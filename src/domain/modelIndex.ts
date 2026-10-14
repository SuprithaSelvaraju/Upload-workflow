/**
 * Plain-data view of a SceneModel for the UI: the assembly tree, per-mesh facts and the
 * mesh <-> node relations. Derived once per loaded model by `buildModelIndex`.
 *
 * It holds NO typed arrays or vtk.js objects (so it is cheap to keep in UI state) and
 * invents nothing: the hierarchy is exactly `SceneModel.root`. Meshes that no node
 * references are reported in `unassignedMeshIds` instead of being attached anywhere.
 *
 * Identity: mesh ids are `SceneModel.meshes[i].id` (== index, enforced by buildScene);
 * node ids are `PartNode.id` from the importer.
 */
import type { Bounds, LinearUnit, Rgb, SceneModel, SourceFormat, Vec3 } from './sceneModel';

export interface MeshInfo {
  id: number;
  name: string;
  triangleCount: number;
  vertexCount: number;
  bounds: Bounds;
  /** Colour from the source file, or null when the file gave none. */
  color: Rgb | null;
}

export interface NodeInfo {
  id: number;
  name: string;
  parentId: number | null;
  depth: number;
  childIds: readonly number[];
  /** Meshes attached directly to this node (deduplicated, valid ids only). */
  meshIds: readonly number[];
  /** Source attributes, or null if the importer provided none (always null for STEP today). */
  attributes: Readonly<Record<string, string>> | null;
}

export interface ModelIndex {
  format: SourceFormat;
  sourceName: string;
  units: LinearUnit;
  rootId: number;
  meshes: readonly MeshInfo[];
  /** Pre-order (parents before children, siblings in source order). */
  nodeOrder: readonly number[];
  node(id: number): NodeInfo | undefined;
  /** For each mesh id: the nodes that reference it directly (more than one = an instanced part). */
  ownerNodes(meshId: number): readonly number[];
  /** Meshes referenced by no node. Not part of the source hierarchy. */
  unassignedMeshIds: readonly number[];
  /** Every mesh in the node's subtree, each once, in tree order. Cached. */
  subtreeMeshIds(nodeId: number): readonly number[];
  /** Node ids from the root down to `nodeId` (inclusive); empty if unknown. */
  pathToNode(nodeId: number): readonly number[];
}

export function buildModelIndex(model: SceneModel): ModelIndex {
  const meshes: MeshInfo[] = model.meshes.map((m) => ({
    id: m.id,
    name: m.name,
    triangleCount: m.indices.length / 3,
    vertexCount: m.positions.length / 3,
    bounds: boundsOf(m.positions),
    color: m.color,
  }));
  const meshCount = meshes.length;

  const nodes = new Map<number, NodeInfo>();
  const order: number[] = [];
  const owners: number[][] = Array.from({ length: meshCount }, () => []);

  // A defensive fresh-id counter: importers should give unique ids, but one bad file must not
  // corrupt selection, so a repeated id is re-issued rather than trusted.
  let freshId = maxNodeId(model.root) + 1;

  const visit = (src: SceneModel['root'], parentId: number | null, depth: number): number => {
    const id = nodes.has(src.id) ? freshId++ : src.id;
    const seen = new Set<number>();
    const meshIds: number[] = [];
    for (const m of src.meshIds) {
      if (Number.isInteger(m) && m >= 0 && m < meshCount && !seen.has(m)) {
        seen.add(m);
        meshIds.push(m);
        owners[m].push(id);
      }
    }
    const info: NodeInfo = {
      id,
      name: src.name,
      parentId,
      depth,
      childIds: [],
      meshIds,
      attributes: src.attributes && Object.keys(src.attributes).length > 0 ? src.attributes : null,
    };
    nodes.set(id, info);
    order.push(id);
    const childIds: number[] = [];
    for (const child of src.children) childIds.push(visit(child, id, depth + 1));
    (info as { childIds: readonly number[] }).childIds = childIds;
    return id;
  };
  const rootId = visit(model.root, null, 0);

  const unassignedMeshIds: number[] = [];
  owners.forEach((o, m) => {
    if (o.length === 0) unassignedMeshIds.push(m);
  });

  const subtreeCache = new Map<number, readonly number[]>();
  const subtreeMeshIds = (nodeId: number): readonly number[] => {
    const cached = subtreeCache.get(nodeId);
    if (cached) return cached;
    const start = nodes.get(nodeId);
    if (!start) return [];
    const seen = new Set<number>();
    const out: number[] = [];
    const stack = [nodeId];
    while (stack.length > 0) {
      const n = nodes.get(stack.pop()!)!;
      for (const m of n.meshIds) {
        if (!seen.has(m)) {
          seen.add(m);
          out.push(m);
        }
      }
      for (let i = n.childIds.length - 1; i >= 0; i--) stack.push(n.childIds[i]); // keeps tree order
    }
    subtreeCache.set(nodeId, out);
    return out;
  };

  return {
    format: model.format,
    sourceName: model.sourceName,
    units: model.units,
    rootId,
    meshes,
    nodeOrder: order,
    node: (id) => nodes.get(id),
    ownerNodes: (meshId) => owners[meshId] ?? [],
    unassignedMeshIds,
    subtreeMeshIds,
    pathToNode(nodeId) {
      const path: number[] = [];
      for (let n = nodes.get(nodeId); n; n = n.parentId === null ? undefined : nodes.get(n.parentId)) path.push(n.id);
      return path.reverse();
    },
  };
}

function maxNodeId(root: SceneModel['root']): number {
  let max = root.id;
  const stack = [root];
  while (stack.length > 0) {
    const n = stack.pop()!;
    if (n.id > max) max = n.id;
    for (const c of n.children) stack.push(c);
  }
  return max;
}

function boundsOf(p: Float32Array): Bounds {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    if (p[i] < minX) minX = p[i];
    if (p[i] > maxX) maxX = p[i];
    if (p[i + 1] < minY) minY = p[i + 1];
    if (p[i + 1] > maxY) maxY = p[i + 1];
    if (p[i + 2] < minZ) minZ = p[i + 2];
    if (p[i + 2] > maxZ) maxZ = p[i + 2];
  }
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

/** Union of several mesh boxes (for a group's overall size). Null when `ids` is empty. */
export function unionBounds(index: ModelIndex, ids: readonly number[]): Bounds | null {
  if (ids.length === 0) return null;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const id of ids) {
    const b = index.meshes[id]?.bounds;
    if (!b) continue;
    for (let k = 0; k < 3; k++) {
      if (b.min[k] < min[k]) min[k] = b.min[k];
      if (b.max[k] > max[k]) max[k] = b.max[k];
    }
  }
  return { min, max };
}

export function sizeOf(b: Bounds): Vec3 {
  return [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
}
