// Registers the rendering classes vtk.js needs for polygonal geometry. Without it, nothing draws.
import '@kitware/vtk.js/Rendering/Profiles/Geometry';
import vtkFullScreenRenderWindow from '@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow';
import type { Rgb, SceneModel } from '../../domain/sceneModel';
import { buildScene, type SceneHandle } from './buildScene';

export interface ViewerTheme {
  background: Rgb;
  defaultPartColor: Rgb;
}

export interface ViewerEngine {
  setModel(model: SceneModel): void;
  clearModel(): void;
  /** Fit the whole model in view from the home direction. */
  resetView(): void;
  dispose(): void;
}

/** Plant CAD is conventionally Z-up; look at it from a raised front-right corner. */
const HOME_DIRECTION = [1, -1, 0.75] as const;
const HOME_VIEW_UP = [0, 0, 1] as const;

/**
 * Imperative vtk.js wrapper. `host` must be a positioned, sized element
 * (vtk.js fills it). Orbit/pan/zoom come from vtk.js's default trackball-camera
 * interactor style.
 */
export function createViewer(host: HTMLElement, theme: ViewerTheme): ViewerEngine {
  const fullScreen = vtkFullScreenRenderWindow.newInstance({
    container: host,
    background: [...theme.background],
  });
  const renderer = fullScreen.getRenderer();
  const renderWindow = fullScreen.getRenderWindow();

  // vtk.js only listens to window resizes; the viewport also changes with layout.
  const resizeObserver = new ResizeObserver(() => fullScreen.resize());
  resizeObserver.observe(host);

  let scene: SceneHandle | null = null;

  function resetView() {
    if (!scene) return;
    const camera = renderer.getActiveCamera();
    camera.setFocalPoint(0, 0, 0);
    camera.setPosition(...HOME_DIRECTION);
    camera.setViewUp(...HOME_VIEW_UP);
    camera.orthogonalizeViewUp();
    // Keeps the view direction, moves the camera back until every visible actor fits.
    renderer.resetCamera();
    renderWindow.render();
  }

  function clearModel() {
    scene?.dispose();
    scene = null;
    renderWindow.render();
  }

  return {
    setModel(model) {
      scene?.dispose();
      scene = buildScene(model, renderer, theme.defaultPartColor);
      resetView();
    },
    clearModel,
    resetView,
    dispose() {
      resizeObserver.disconnect();
      scene?.dispose();
      scene = null;

      const canvas = host.querySelector('canvas');
      fullScreen.delete();
      host.replaceChildren(); // StrictMode remounts must not stack a second canvas

      // Free the GPU context now rather than waiting for GC; browsers cap live contexts (~16).
      try {
        const gl = canvas?.getContext('webgl2') as WebGL2RenderingContext | null | undefined;
        gl?.getExtension('WEBGL_lose_context')?.loseContext();
      } catch {
        /* context already gone */
      }
    },
  };
}
