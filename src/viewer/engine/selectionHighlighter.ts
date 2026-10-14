/**
 * Reversible highlight of a set of meshes, independent of vtk.js.
 *
 * The highlighter tracks *which* meshes are highlighted; the caller supplies how a mesh is
 * painted (`paint(meshId, highlighted)`). Painting always recomputes from the mesh's
 * immutable base colour, so any number of select/clear cycles leaves nothing behind:
 * there is no accumulated blend and no state to unwind. Only meshes whose state changes
 * are repainted, so moving a selection costs O(old + new), not O(all meshes).
 */
export interface SelectionHighlighter {
  /** Highlight exactly these meshes. Invalid ids are ignored. Returns true if anything changed. */
  setMany(meshIds: readonly number[]): boolean;
  /** Convenience for one mesh (null clears). */
  set(meshId: number | null): boolean;
  readonly selected: ReadonlySet<number>;
  /** Drop all state without painting (the meshes themselves are being destroyed). */
  dispose(): void;
}

export function createSelectionHighlighter(
  meshCount: number,
  paint: (meshId: number, highlighted: boolean) => void,
): SelectionHighlighter {
  let current = new Set<number>();
  let disposed = false;

  function setMany(meshIds: readonly number[]): boolean {
    if (disposed) return false;
    const next = new Set<number>();
    for (const id of meshIds) if (Number.isInteger(id) && id >= 0 && id < meshCount) next.add(id);
    let changed = false;
    for (const id of current) {
      if (!next.has(id)) {
        paint(id, false);
        changed = true;
      }
    }
    for (const id of next) {
      if (!current.has(id)) {
        paint(id, true);
        changed = true;
      }
    }
    current = next;
    return changed;
  }

  return {
    setMany,
    set: (meshId) => setMany(meshId === null ? [] : [meshId]),
    get selected() {
      return current;
    },
    dispose() {
      disposed = true;
      current = new Set();
    },
  };
}
