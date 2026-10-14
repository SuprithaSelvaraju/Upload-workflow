/**
 * Model Explorer rows, derived from ModelIndex. Pure: no React, no DOM.
 *
 * What a row is:
 *  - 'node'  : a PartNode that groups something (children and/or several meshes);
 *  - 'part'  : a PartNode with no children and exactly one mesh, shown as ONE row bound to
 *              that mesh (a leaf part, the common case for plant models);
 *  - 'mesh'  : one mesh under a 'node' row, when that node has direct meshes;
 *  - 'group' : the single "Not in assembly tree" bucket for meshes no node references
 *              (only present when there are any; it is a view-level label, not source data).
 */
import type { ModelIndex } from '../domain/modelIndex';
import type { SelectionTarget } from './modelWorkspace';

export type RowKind = 'node' | 'part' | 'mesh' | 'group';

export interface ExplorerRow {
  key: string;
  kind: RowKind;
  depth: number;
  name: string;
  nodeId: number | null;
  meshId: number | null;
  /** Meshes this row stands for: what visibility, isolate and highlight act on. */
  meshIds: readonly number[];
  expandable: boolean;
  expanded: boolean;
}

export const GROUP_KEY = 'g:unassigned';
export const nodeKey = (nodeId: number) => `n:${nodeId}`;
export const meshKey = (parentKey: string, meshId: number) => `m:${parentKey}:${meshId}`;

const UNNAMED = 'Unnamed'; // the importer's placeholder for nameless nodes (mapOcctResult)

function isLeafPart(index: ModelIndex, nodeId: number): boolean {
  const n = index.node(nodeId)!;
  return n.childIds.length === 0 && n.meshIds.length === 1;
}

/**
 * The name shown for a mesh everywhere (tree, inspector, status bar). A leaf part is named after
 * its node (that is what the source calls the part); otherwise the mesh's own name is used.
 */
export function meshDisplayName(index: ModelIndex, meshId: number): string {
  const owner = index.ownerNodes(meshId)[0];
  if (owner !== undefined && isLeafPart(index, owner)) {
    const name = index.node(owner)!.name;
    if (name && name !== UNNAMED) return name;
  }
  return index.meshes[meshId]?.name ?? UNNAMED;
}

export function defaultExpanded(index: ModelIndex): Set<string> {
  return new Set([nodeKey(index.rootId)]);
}

export function buildRows(index: ModelIndex, expanded: ReadonlySet<string>): ExplorerRow[] {
  const rows: ExplorerRow[] = [];

  const pushNode = (nodeId: number, depth: number) => {
    const n = index.node(nodeId)!;
    const key = nodeKey(nodeId);
    if (isLeafPart(index, nodeId)) {
      const meshId = n.meshIds[0];
      rows.push({
        key,
        kind: 'part',
        depth,
        name: meshDisplayName(index, meshId),
        nodeId,
        meshId,
        meshIds: [meshId],
        expandable: false,
        expanded: false,
      });
      return;
    }
    const expandable = n.childIds.length > 0 || n.meshIds.length > 0;
    const isOpen = expandable && expanded.has(key);
    rows.push({
      key,
      kind: 'node',
      depth,
      name: n.name || UNNAMED,
      nodeId,
      meshId: null,
      meshIds: index.subtreeMeshIds(nodeId),
      expandable,
      expanded: isOpen,
    });
    if (!isOpen) return;
    for (const c of n.childIds) pushNode(c, depth + 1);
    for (const m of n.meshIds) pushMesh(key, m, depth + 1);
  };

  const pushMesh = (parentKey: string, meshId: number, depth: number) => {
    rows.push({
      key: meshKey(parentKey, meshId),
      kind: 'mesh',
      depth,
      name: index.meshes[meshId].name,
      nodeId: null,
      meshId,
      meshIds: [meshId],
      expandable: false,
      expanded: false,
    });
  };

  pushNode(index.rootId, 0);

  if (index.unassignedMeshIds.length > 0) {
    const open = expanded.has(GROUP_KEY);
    rows.push({
      key: GROUP_KEY,
      kind: 'group',
      depth: 0,
      name: 'Not in assembly tree',
      nodeId: null,
      meshId: null,
      meshIds: index.unassignedMeshIds,
      expandable: true,
      expanded: open,
    });
    if (open) for (const m of index.unassignedMeshIds) pushMesh(GROUP_KEY, m, 1);
  }
  return rows;
}

/** Is this row the current selection? (Rows that merely lie inside a selected group are not.) */
export function isRowSelected(row: ExplorerRow, selection: SelectionTarget | null): boolean {
  if (!selection) return false;
  if (selection.kind === 'mesh') return row.meshId === selection.meshId;
  return row.kind === 'node' && row.nodeId === selection.nodeId;
}

/** Expanded keys that must be added so the selection's row exists in the list. */
export function revealKeys(index: ModelIndex, selection: SelectionTarget | null): string[] {
  if (!selection) return [];
  if (selection.kind === 'node') {
    return index.pathToNode(selection.nodeId).slice(0, -1).map(nodeKey);
  }
  const owner = index.ownerNodes(selection.meshId)[0];
  if (owner === undefined) return index.unassignedMeshIds.includes(selection.meshId) ? [GROUP_KEY] : [];
  return index.pathToNode(owner).map(nodeKey); // includes the owner: its mesh row sits under it
}

/** Where is the selection in the row list (first match), or -1. */
export function selectedRowIndex(rows: readonly ExplorerRow[], selection: SelectionTarget | null): number {
  if (!selection) return -1;
  return rows.findIndex((r) => isRowSelected(r, selection));
}
