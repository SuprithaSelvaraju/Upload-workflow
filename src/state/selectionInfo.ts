/**
 * What the inspector and status bar say about the current selection. Pure and derived:
 * every field comes from ModelIndex, nothing is estimated or invented.
 */
import { sizeOf, unionBounds, type MeshInfo, type ModelIndex, type NodeInfo } from '../domain/modelIndex';
import type { Vec3 } from '../domain/sceneModel';
import { meshDisplayName } from './explorerRows';
import { visibilityOf, type SelectionTarget, type Visibility } from './modelWorkspace';

export interface SelectionDescription {
  kind: 'part' | 'group';
  title: string;
  meshIds: readonly number[];
  /** Node ids from the root down to the selected item's parent (names resolved for display). */
  pathNames: readonly string[];
  triangleCount: number;
  vertexCount: number;
  /** Overall extents in model units; null if there is no geometry. */
  size: Vec3 | null;
  visibility: Visibility;
  // part only
  mesh: MeshInfo | null;
  /** Nodes that reference the mesh (length > 1 means the part is instanced). */
  ownerCount: number;
  // group only
  node: NodeInfo | null;
  /** Source attributes of the owning node, if the file had any. */
  attributes: Readonly<Record<string, string>> | null;
}

export function describeSelection(
  index: ModelIndex,
  target: SelectionTarget,
  hidden: Uint8Array,
): SelectionDescription | null {
  if (target.kind === 'mesh') {
    const mesh = index.meshes[target.meshId];
    if (!mesh) return null;
    const owners = index.ownerNodes(mesh.id);
    const owner = owners[0] !== undefined ? index.node(owners[0]) ?? null : null;
    const path = owner ? index.pathToNode(owner.id).map((id) => index.node(id)!.name) : [];
    return {
      kind: 'part',
      title: meshDisplayName(index, mesh.id),
      meshIds: [mesh.id],
      pathNames: path,
      triangleCount: mesh.triangleCount,
      vertexCount: mesh.vertexCount,
      size: sizeOf(mesh.bounds),
      visibility: visibilityOf(hidden, [mesh.id]),
      mesh,
      ownerCount: owners.length,
      node: null,
      attributes: owner?.attributes ?? null,
    };
  }

  const node = index.node(target.nodeId);
  if (!node) return null;
  const ids = index.subtreeMeshIds(node.id);
  let tris = 0;
  let verts = 0;
  for (const id of ids) {
    tris += index.meshes[id].triangleCount;
    verts += index.meshes[id].vertexCount;
  }
  const box = unionBounds(index, ids);
  return {
    kind: 'group',
    title: node.name || 'Unnamed',
    meshIds: ids,
    pathNames: index.pathToNode(node.id).slice(0, -1).map((id) => index.node(id)!.name),
    triangleCount: tris,
    vertexCount: verts,
    size: box ? sizeOf(box) : null,
    visibility: visibilityOf(hidden, ids),
    mesh: null,
    ownerCount: 0,
    node,
    attributes: node.attributes,
  };
}

export function rgbToHex(rgb: readonly [number, number, number]): string {
  return (
    '#' +
    rgb
      .map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0'))
      .join('')
  );
}
