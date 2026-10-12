/**
 * Reversible single-selection highlight, independent of vtk.js.
 *
 * The highlighter owns *which* mesh is highlighted; the caller supplies how a mesh is
 * painted (`paint(meshId, highlighted)`). Painting always recomputes from the mesh's
 * immutable base colour, so any number of select/clear cycles leaves nothing behind:
 * there is no accumulated blend and no state to unwind.
 */
export interface SelectionHighlighter {
  /** Highlight one mesh (null clears). Out-of-range or non-integer ids clear. Returns true if anything changed. */
  set(meshId: number | null): boolean;
  readonly current: number | null;
  /** Drop all state without painting (the meshes themselves are being destroyed). */
  dispose(): void;
}

export function createSelectionHighlighter(
  meshCount: number,
  paint: (meshId: number, highlighted: boolean) => void,
): SelectionHighlighter {
  let current: number | null = null;
  let disposed = false;
  return {
    get current() {
      return current;
    },
    set(meshId) {
      if (disposed) return false;
      const next = meshId !== null && Number.isInteger(meshId) && meshId >= 0 && meshId < meshCount ? meshId : null;
      if (next === current) return false;
      if (current !== null) paint(current, false);
      if (next !== null) paint(next, true);
      current = next;
      return true;
    },
    dispose() {
      disposed = true;
      current = null;
    },
  };
}
