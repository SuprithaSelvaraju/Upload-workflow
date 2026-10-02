import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { SceneModel } from '../domain/sceneModel';
import { createViewer, type SceneInfo, type ViewerEngine, type ViewerTheme } from './engine/createViewer';
import type { StandardView, ViewAngles } from './engine/orbitMath';

export type CameraListener = (angles: ViewAngles) => void;

export interface ViewerHandle {
  setModel(model: SceneModel): SceneInfo | null;
  clearModel(): void;
  fit(): void;
  setStandardView(view: StandardView): void;
  /** Subscribe to camera changes. Survives the engine being re-created (StrictMode). */
  subscribeCamera(listener: CameraListener): () => void;
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
  const lastAnglesRef = useRef<ViewAngles | null>(null);

  useEffect(() => {
    const engine = createViewer(hostRef.current!, theme);
    engineRef.current = engine;
    const detach = engine.onCameraChange((angles) => {
      lastAnglesRef.current = angles;
      listenersRef.current.forEach((listener) => listener(angles));
    });
    return () => {
      detach();
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
