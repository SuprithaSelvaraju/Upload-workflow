import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { SceneModel } from '../domain/sceneModel';
import { createViewer, type ViewerEngine, type ViewerTheme } from './engine/createViewer';

export interface ViewerHandle {
  setModel(model: SceneModel): void;
  clearModel(): void;
  resetView(): void;
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

  useEffect(() => {
    const engine = createViewer(hostRef.current!, theme);
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [theme]);

  useImperativeHandle(
    ref,
    () => ({
      setModel: (model) => engineRef.current?.setModel(model),
      clearModel: () => engineRef.current?.clearModel(),
      resetView: () => engineRef.current?.resetView(),
    }),
    [],
  );

  return <div ref={hostRef} className="relative h-full w-full overflow-hidden bg-canvas" />;
});
