import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { SceneModel } from '../domain/sceneModel';
import { createViewer, type SceneInfo, type ViewerEngine, type ViewerTheme } from './engine/createViewer';
import type { StandardView, ViewAngles } from './engine/orbitMath';

export type CameraListener = (angles: ViewAngles) => void;
/** Mesh id picked by a click, or null for empty space. */
export type PickListener = (meshId: number | null) => void;

export interface ViewerHandle {
  setModel(model: SceneModel): SceneInfo | null;
  clearModel(): void;
  fit(): void;
  setStandardView(view: StandardView): void;
  /** Subscribe to camera changes. Survives the engine being re-created (StrictMode). */
  subscribeCamera(listener: CameraListener): () => void;
  /** Highlight exactly these meshes (SceneModel.meshes ids). The viewer owns no selection state. */
  setHighlightedMeshes(meshIds: readonly number[]): void;
  /** One byte per mesh, 1 = hidden: not drawn, not pickable. */
  setHiddenMeshes(mask: Uint8Array): void;
  /** Fires on a click with the picked mesh id (null = empty space). Survives engine re-creation (StrictMode). */
  subscribePick(listener: PickListener): () => void;
}

interface Props {
  theme: ViewerTheme;
}

/**
 * React owns only the host <div>. vtk.js owns everything inside it, and no
 * vtk.js object ever enters React state. The effect creates and disposes the
 * engine, which also makes StrictMode's mount/unmount/mount cycle safe.
 */
export const ViewerCanvas = forwardRef<ViewerHandle, Props>(function ViewerCanvas({ theme }, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ViewerEngine | null>(null);
  // Listeners live here, not in the engine, so they outlive an engine re-creation.
  const listenersRef = useRef(new Set<CameraListener>());
  const pickListenersRef = useRef(new Set<PickListener>());
  const lastAnglesRef = useRef<ViewAngles | null>(null);

  useEffect(() => {
    const engine = createViewer(hostRef.current!, theme);
    engineRef.current = engine;
    const detach = engine.onCameraChange((angles) => {
      lastAnglesRef.current = angles;
      listenersRef.current.forEach((listener) => listener(angles));
    });
    const detachPick = engine.onPick((meshId) => {
      pickListenersRef.current.forEach((listener) => listener(meshId));
    });
    return () => {
      detach();
      detachPick();
      engine.dispose();
      engineRef.current = null;
    };
  }, [theme]);

  useImperativeHandle(
    ref,
    () => ({
      setModel: (model) => engineRef.current?.setModel(model) ?? null,
      clearModel: () => engineRef.current?.clearModel(),
      fit: () => engineRef.current?.fit(),
      setStandardView: (view) => engineRef.current?.setStandardView(view),
      setHighlightedMeshes: (meshIds) => engineRef.current?.setHighlightedMeshes(meshIds),
      setHiddenMeshes: (mask) => engineRef.current?.setHiddenMeshes(mask),
      subscribePick: (listener) => {
        pickListenersRef.current.add(listener);
        return () => pickListenersRef.current.delete(listener);
      },
      subscribeCamera: (listener) => {
        listenersRef.current.add(listener);
        if (lastAnglesRef.current) listener(lastAnglesRef.current);
        return () => listenersRef.current.delete(listener);
      },
    }),
    [],
  );

  return <div ref={hostRef} className="relative h-full w-full overflow-hidden bg-canvas" />;
});
