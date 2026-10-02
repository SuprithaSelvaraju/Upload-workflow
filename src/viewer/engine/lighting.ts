import vtkLight from '@kitware/vtk.js/Rendering/Core/Light';
import type vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';

/**
 * Three-light industrial rig, replacing vtk.js's automatic headlight.
 * All values are first-pass and meant to be tuned by eye on real models.
 *
 *  key   directional, fixed in the WORLD (front-left, high). It gives the model
 *        a consistent light/shade direction while the camera orbits, so form
 *        reads the same from every side and the model stays visually upright.
 *  fill  directional, fixed in the world from the opposite, lower side. Lifts
 *        faces the key leaves dark, so nothing goes black.
 *  head  weak light attached to the camera. Keeps whatever faces you readable
 *        from any angle, including from behind the key.
 *
 * Ambient comes from each part's material (see buildScene), not from a light.
 * The intensities are kept modest so the plant reads as calm steel, not glare.
 */
const KEY = { direction: [-0.45, -0.55, 0.85], intensity: 0.6 } as const;
const FILL = { direction: [0.65, 0.5, 0.3], intensity: 0.25 } as const;
const HEAD = { intensity: 0.18 } as const;

export interface Lighting {
  dispose(): void;
}

export function createLighting(renderer: vtkRenderer): Lighting {
  // Without this, vtk.js adds its own headlight on top of ours.
  renderer.setAutomaticLightCreation(false);
  renderer.removeAllLights();

  const lights = [
    sceneLight(KEY.direction, KEY.intensity),
    sceneLight(FILL.direction, FILL.intensity),
    headLight(HEAD.intensity),
  ];
  lights.forEach((light) => renderer.addLight(light));

  return {
    dispose() {
      lights.forEach((light) => {
        renderer.removeLight(light);
        light.delete();
      });
    },
  };
}

/** Directional light: only the direction from `position` to the focal point matters. */
function sceneLight(direction: readonly [number, number, number], intensity: number) {
  const light = vtkLight.newInstance();
  light.setLightTypeToSceneLight();
  light.setPositional(false);
  light.setFocalPoint(0, 0, 0);
  light.setPosition(direction[0], direction[1], direction[2]);
  light.setIntensity(intensity);
  return light;
}

function headLight(intensity: number) {
  const light = vtkLight.newInstance();
  light.setLightTypeToHeadLight();
  light.setIntensity(intensity);
  return light;
}
