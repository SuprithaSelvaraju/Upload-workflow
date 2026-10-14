/**
 * The single authority for "what is selected" and "what is visible".
 *
 * Framework-neutral on purpose: React reads it through `useSyncExternalStore`, the viewer
 * is driven from it by an adapter, and it is unit-tested offline. Nothing else keeps a copy
 * of selection or visibility: the tree, the inspector and the 3D view are all projections
 * of the snapshot below.
 *
 * Invariants (enforced here, so no UI has to remember them):
 *  - a selected mesh is never hidden; a selected group has at least one visible mesh
 *    (or contains no meshes at all);
 *  - hiding the selection's last visible geometry clears the selection;
 *  - loading or clearing a model resets selection, visibility and isolation;
 *  - ids are stable: mesh ids from SceneModel.meshes, node ids from PartNode.id.
 */
import type { ModelIndex } from '../domain/modelIndex';

export type SelectionTarget =
  | { readonly kind: 'mesh'; readonly meshId: number }
  | { readonly kind: 'node'; readonly nodeId: number };

export type Visibility = 'visible' | 'hidden' | 'mixed';

export interface WorkspaceSnapshot {
  readonly index: ModelIndex | null;
  readonly selection: SelectionTarget | null;
  /** One byte per mesh id: 1 = hidden. Replaced (never mutated) on every visibility change. */
  readonly hidden: Uint8Array;
  readonly hiddenCount: number;
  /** True while a previous visibility state is stored and `restoreIsolation` can bring it back. */
  readonly isolated: boolean;
  /** The meshes to highlight in the viewport: the selection's visible meshes. */
  readonly highlightedMeshIds: readonly number[];
}

export interface ModelWorkspace {
  getSnapshot(): WorkspaceSnapshot;
  subscribe(listener: () => void): () => void;

  /** Replace the model: selection, visibility and isolation start from scratch. */
  load(index: ModelIndex): void;
  clear(): void;

  /** Select one mesh (a viewport click, or a part row). null clears. Returns false if refused. */
  selectMesh(meshId: number | null): boolean;
  /** Select an assembly/group node: all its visible meshes highlight. Returns false if refused. */
  selectNode(nodeId: number): boolean;
  clearSelection(): void;

  toggleMesh(meshId: number): void;
  /** Hides the node's meshes, or shows them all if none is visible. */
  toggleNode(nodeId: number): void;
  /** Same rule as toggleNode for an arbitrary mesh set (for example the unassigned group). */
  toggleMeshes(meshIds: readonly number[]): void;
  isolate(target: SelectionTarget): void;
  restoreIsolation(): void;
  /** Show every mesh and drop any stored isolation state. */
  showAll(): void;
}

/** Visibility of a set of meshes under a hidden mask. An empty set counts as visible. */
export function visibilityOf(hidden: Uint8Array, meshIds: readonly number[]): Visibility {
  let hiddenN = 0;
  for (const id of meshIds) if (hidden[id] === 1) hiddenN++;
  if (hiddenN === 0) return 'visible';
  return hiddenN === meshIds.length ? 'hidden' : 'mixed';
}

/** The meshes a selection target refers to (before visibility is considered). */
export function targetMeshIds(index: ModelIndex, target: SelectionTarget): readonly number[] {
  return target.kind === 'mesh' ? [target.meshId] : index.subtreeMeshIds(target.nodeId);
}

export function createModelWorkspace(): ModelWorkspace {
  let index: ModelIndex | null = null;
  let selection: SelectionTarget | null = null;
  let hidden: Uint8Array = new Uint8Array(0);
  let saved: Uint8Array | null = null;
  const listeners = new Set<() => void>();

  const countHidden = (mask: Uint8Array) => {
    let n = 0;
    for (let i = 0; i < mask.length; i++) n += mask[i];
    return n;
  };

  function compute(): WorkspaceSnapshot {
    const highlighted: number[] = [];
    if (index && selection) {
      for (const id of targetMeshIds(index, selection)) if (hidden[id] !== 1) highlighted.push(id);
    }
    return {
      index,
      selection,
      hidden,
      hiddenCount: countHidden(hidden),
      isolated: saved !== null,
      highlightedMeshIds: highlighted,
    };
  }

  let snapshot = compute();

  function commit() {
    snapshot = compute();
    // A failing subscriber must not stop the others, nor leave the store half-updated.
    for (const l of [...listeners]) {
      try {
        l();
      } catch (error) {
        console.error('workspace listener failed', error);
      }
    }
  }

  /** After any visibility change: drop a selection that no longer has anything visible. */
  function reconcileSelection() {
    if (!index || !selection) return;
    const ids = targetMeshIds(index, selection);
    if (ids.length > 0 && visibilityOf(hidden, ids) === 'hidden') selection = null;
  }

  function setHidden(ids: readonly number[], value: 0 | 1) {
    const next = hidden.slice();
    for (const id of ids) if (id >= 0 && id < next.length) next[id] = value;
    hidden = next;
    reconcileSelection();
    commit();
  }

  function clearSelection() {
    if (!selection) return;
    selection = null;
    commit();
  }

  function toggleMeshes(ids: readonly number[]) {
    if (ids.length === 0) return;
    setHidden(ids, visibilityOf(hidden, ids) === 'hidden' ? 0 : 1);
  }

  const validMesh = (id: number) => index !== null && Number.isInteger(id) && id >= 0 && id < hidden.length;

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    load(next) {
      index = next;
      selection = null;
      hidden = new Uint8Array(next.meshes.length);
      saved = null;
      commit();
    },

    clear() {
      if (!index && !selection && saved === null) return;
      index = null;
      selection = null;
      hidden = new Uint8Array(0);
      saved = null;
      commit();
    },

    selectMesh(meshId) {
      if (meshId === null) {
        clearSelection();
        return true;
      }
      if (!validMesh(meshId) || hidden[meshId] === 1) return false; // hidden geometry is not selectable
      if (selection?.kind === 'mesh' && selection.meshId === meshId) return true;
      selection = { kind: 'mesh', meshId };
      commit();
      return true;
    },

    selectNode(nodeId) {
      if (!index || !index.node(nodeId)) return false;
      const ids = index.subtreeMeshIds(nodeId);
      if (ids.length > 0 && visibilityOf(hidden, ids) === 'hidden') return false;
      if (selection?.kind === 'node' && selection.nodeId === nodeId) return true;
      selection = { kind: 'node', nodeId };
      commit();
      return true;
    },

    clearSelection,

    toggleMesh(meshId) {
      if (!validMesh(meshId)) return;
      setHidden([meshId], hidden[meshId] === 1 ? 0 : 1);
    },

    toggleNode(nodeId) {
      if (!index) return;
      toggleMeshes(index.subtreeMeshIds(nodeId));
    },

    toggleMeshes,

    isolate(target) {
      if (!index) return;
      if (target.kind === 'mesh' ? !validMesh(target.meshId) : !index.node(target.nodeId)) return;
      const keep = targetMeshIds(index, target);
      if (keep.length === 0) return; // isolating nothing would just blank the view
      if (saved === null) saved = hidden.slice(); // first isolate remembers the real prior state
      const next = new Uint8Array(hidden.length).fill(1);
      for (const id of keep) next[id] = 0;
      hidden = next;
      reconcileSelection();
      commit();
    },

    restoreIsolation() {
      if (saved === null) return;
      hidden = saved;
      saved = null;
      reconcileSelection();
      commit();
    },

    showAll() {
      if (countHidden(hidden) === 0 && saved === null) return;
      hidden = new Uint8Array(hidden.length);
      saved = null;
      commit();
    },
  };
}
