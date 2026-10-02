// Registers the rendering classes vtk.js needs for polygonal geometry. Without it, nothing draws.
import '@kitware/vtk.js/Rendering/Profiles/Geometry';
import vtkFullScreenRenderWindow from '@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow';
import type { Rgb, SceneModel, Vec3 } from '../../domain/sceneModel';
import { buildScene, type SceneHandle } from './buildScene';
import { buildEnvironment, type Environment } from './sceneEnvironment';
import { createLighting } from './lighting';
import { createOrbitController, type CameraRig } from './orbitController';
import {
  STANDARD_VIEWS,
  cameraPosition,
  clippingRange,
  fitDistance,
  type OrbitState,
  type StandardView,
  type ViewAngles,
} from './orbitMath';

export interface ViewerTheme {
  background: Rgb;
  defaultPartColor: Rgb;
  ground: Rgb;
  grid: Rgb;
  gridMajor: Rgb;
}

/** What the viewer tells the UI about the scene it just built. */
export interface SceneInfo {
  /** Minor grid spacing, in the model's units. */
  gridSpacing: number;
}

export interface ViewerEngine {
  setModel(model: SceneModel): SceneInfo;
  clearModel(): void;
  /** Frame the whole model, keeping the current viewing direction. */
  fit(): void;
  /** Frame the whole model from a standard direction. 'iso' is the default view. */
  setStandardView(view: StandardView): void;
  /** Called on every camera change, with the angles the axis triad needs. */
  onCameraChange(listener: (angles: ViewAngles) => void): () => void;
  dispose(): void;
}

/** A little wider than vtk.js's 30° default: more perspective depth, still no fisheye. */
const VIEW_ANGLE_DEG = 35;
/** Orbit distance limits, relative to the model size and to the distance that fits it. */
const MIN_DISTANCE_PER_RADIUS = 0.002;
const MAX_DISTANCE_PER_FIT = 4;

/**
 * Imperative vtk.js wrapper. `host` must be a positioned, sized element.
 *
 * vtk.js renders; it does NOT handle input here. Its interactor is detached and
 * orbitController drives the camera, so the constrained Z-up orbit is ours and
 * does not depend on vtk.js interactor-style behaviour.
 */
export function createViewer(host: HTMLElement, theme: ViewerTheme): ViewerEngine {
  const fullScreen = vtkFullScreenRenderWindow.newInstance({
    // `container` (not `rootContainer`): render straight into the host element.
    container: host,
    background: [...theme.background],
  });
  const renderer = fullScreen.getRenderer();
  const renderWindow = fullScreen.getRenderWindow();
  fullScreen.getInteractor().unbindEvents();

  const camera = renderer.getActiveCamera();
  camera.setViewAngle(VIEW_ANGLE_DEG);
  camera.setParallelProjection(false);

  const lighting = createLighting(renderer);

  // vtk.js only listens to window resizes; the viewport also changes with layout.
  const resizeObserver = new ResizeObserver(() => fullScreen.resize());
  resizeObserver.observe(host);

  let disposed = false;
  let renderQueued = false;
  const requestRender = () => {
    if (renderQueued || disposed) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      if (!disposed) renderWindow.render();
    });
  };

  // Sphere that covers the model and the visible floor; sets the clipping planes.
  let clipSphere: { center: Vec3; radius: number } = { center: [0, 0, 0], radius: 1 };

  const rig: CameraRig = {
    viewAngleRad: (VIEW_ANGLE_DEG * Math.PI) / 180,
    viewportSize: () => {
      const { width, height } = host.getBoundingClientRect();
      return { width, height };
    },
    apply(state: OrbitState) {
      const position = cameraPosition(state);
      camera.setFocalPoint(state.target[0], state.target[1], state.target[2]);
      camera.setPosition(position[0], position[1], position[2]);
      camera.setViewUp(0, 0, 1); // world up never changes: the model stays upright
      const [near, far] = clippingRange(state, clipSphere.center, clipSphere.radius);
      camera.setClippingRange(near, far);
      requestRender();
    },
  };

  const controller = createOrbitController(host, rig, {
    target: [0, 0, 0],
    ...STANDARD_VIEWS.iso,
    distance: 10,
  });

  let scene: SceneHandle | null = null;
  let environment: Environment | null = null;
  let model: { center: Vec3; radius: number } | null = null;

  const fitDistanceNow = (radius: number) => {
    const { width, height } = rig.viewportSize();
    return fitDistance(radius, rig.viewAngleRad, width / Math.max(height, 1));
  };

  function frame(angles: ViewAngles, animate: boolean) {
    if (!model) return;
    const goal: OrbitState = { target: model.center, ...angles, distance: fitDistanceNow(model.radius) };
    if (animate) controller.animateTo(goal);
    else controller.jumpTo(goal);
  }

  function disposeContent() {
    scene?.dispose();
    environment?.dispose();
    scene = null;
    environment = null;
    model = null;
    controller.setLimits(null);
  }

  return {
    setModel(next) {
      disposeContent();
      scene = buildScene(next, renderer, theme.defaultPartColor);
      environment = buildEnvironment(next.bounds, renderer, theme);

      const { plan } = environment;
      model = { center: plan.modelCenter, radius: plan.modelRadius };
      clipSphere = plan.sphere;

      controller.setLimits({
        targetMin: plan.targetMin,
        targetMax: plan.targetMax,
        minDistance: plan.modelRadius * MIN_DISTANCE_PER_RADIUS,
        maxDistance: fitDistanceNow(plan.modelRadius) * MAX_DISTANCE_PER_FIT,
      });
      frame(STANDARD_VIEWS.iso, false);
      return { gridSpacing: plan.step };
    },

    clearModel() {
      disposeContent();
      requestRender();
    },

    fit() {
      const { azimuth, elevation } = controller.getState();
      frame({ azimuth, elevation }, true);
    },

    setStandardView(view) {
      frame(STANDARD_VIEWS[view], true);
    },

    onCameraChange(listener) {
      return controller.subscribe((s) => listener({ azimuth: s.azimuth, elevation: s.elevation }));
    },

    dispose() {
      disposed = true;
      resizeObserver.disconnect();
      controller.dispose();
      disposeContent();
      lighting.dispose();

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
