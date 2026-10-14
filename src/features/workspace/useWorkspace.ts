import { useEffect, useSyncExternalStore, type RefObject } from 'react';
import type { ModelWorkspace, WorkspaceSnapshot } from '../../state/modelWorkspace';
import type { ViewerHandle } from '../../viewer/ViewerCanvas';

/** Subscribe a component to the workspace store. Re-renders only when a snapshot is replaced. */
export function useWorkspaceSnapshot(workspace: ModelWorkspace): WorkspaceSnapshot {
  return useSyncExternalStore(workspace.subscribe, workspace.getSnapshot, workspace.getSnapshot);
}

/**
 * The only bridge between the workspace store and the 3D viewer:
 *   store -> viewer : the hidden mask and the highlighted meshes (the viewer draws what it is told);
 *   viewer -> store : a click becomes `selectMesh(id | null)` (empty space clears).
 * Neither side keeps a second copy of selection or visibility.
 */
export function useWorkspaceViewerSync(viewerRef: RefObject<ViewerHandle | null>, workspace: ModelWorkspace): void {
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const offPick = viewer.subscribePick((meshId) => {
      workspace.selectMesh(meshId);
    });

    let lastHidden: Uint8Array | null = null;
    let lastHighlight: readonly number[] | null = null;
    const push = () => {
      const s = workspace.getSnapshot();
      if (s.hidden !== lastHidden) {
        lastHidden = s.hidden;
        viewer.setHiddenMeshes(s.hidden);
      }
      if (s.highlightedMeshIds !== lastHighlight) {
        lastHighlight = s.highlightedMeshIds;
        viewer.setHighlightedMeshes(s.highlightedMeshIds);
      }
    };
    const offStore = workspace.subscribe(push);
    push();

    return () => {
      offStore();
      offPick();
    };
  }, [viewerRef, workspace]);
}
