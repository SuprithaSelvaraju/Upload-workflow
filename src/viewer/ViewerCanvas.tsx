import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { SceneModel } from '../domain/sceneModel';
import { createViewer, type PartSelection, type SceneInfo, type ViewerEngine, type ViewerTheme } from './engine/createViewer';
import type { StandardView, ViewAngles } from './engine/orbitMath';

export type CameraListener = (angles: ViewAngles) => void;
export type SelectionListener = (selection: PartSelection | null) => void;
export type { PartSelection };

export interface ViewerHandle {
  setModel(model: SceneModel): SceneInfo | null;
  clearModel(): void;
  fit(): void;
  setStandardView(view: StandardView): void;
  /** Subscribe to camera changes. Survives the engine being re-created (StrictMode). */
  subscribeCamera(listener: CameraListener): () => void;
  /** The currently selected part, or null. */
  getSelection(): PartSelection | null;
  /** Select a part by mesh index (SceneModel.meshes), or null to clear. */
  selectMesh(meshId: number | null): void;
  /** Fires when the selection changes. Survives the engine being re-created (StrictMode). */
  subscribeSelection(listener: SelectionListener): () => void;
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
  const selectionListenersRef = useRef(new Set<SelectionListener>());
  const selectionRef = useRef<PartSelection | null>(null);
  const lastAnglesRef = useRef<ViewAngles | null>(null);

  useEffect(() => {
    const engine = createViewer(hostRef.current!, theme);
    engineRef.current = engine;
    const detach = engine.onCameraChange((angles) => {
      lastAnglesRef.current = angles;
      listenersRef.current.forEach((listener) => listener(angles));
    });
    const detachSelection = engine.onSelectionChange((selection) => {
      selectionRef.current = selection;
      selectionListenersRef.current.forEach((listener) => listener(selection));
    });
    return () => {
      detach();
      detachSelection();
      selectionRef.current = null; // a new engine starts with nothing selected
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
      getSelection: () => selectionRef.current,
      selectMesh: (meshId) => engineRef.current?.selectMesh(meshId),
      subscribeSelection: (listener) => {
        selectionListenersRef.current.add(listener);
        return () => selectionListenersRef.current.delete(listener);
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
