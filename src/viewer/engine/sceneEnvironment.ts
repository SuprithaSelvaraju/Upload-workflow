import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkPoints from '@kitware/vtk.js/Common/Core/Points';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import type vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import type { Bounds } from '../../domain/sceneModel';
import {
  buildGridLines,
  buildGroundMesh,
  planEnvironment,
  type EnvironmentColors,
  type EnvironmentPlan,
  type MeshArrays,
} from './environmentGeometry';

export interface Environment {
  plan: EnvironmentPlan;
  dispose(): void;
}

/**
 * The reference floor under the model: a ground square and a metric grid.
 * Both are unlit and carry per-vertex colours that fade into the canvas
 * background, so they give spatial grounding without a visible edge.
 */
export function buildEnvironment(bounds: Bounds, renderer: vtkRenderer, colors: EnvironmentColors): Environment {
  const plan = planEnvironment(bounds);

  const ground = makeLayer(buildGroundMesh(plan, colors), 'polys');
  const grid = makeLayer(buildGridLines(plan, colors), 'lines');
  const layers = [ground, grid];
  layers.forEach((layer) => renderer.addActor(layer.actor));

  return {
    plan,
    dispose() {
      layers.forEach((layer) => renderer.removeActor(layer.actor));
      layers.forEach((layer) => {
        layer.actor.delete();
        layer.mapper.delete();
        layer.polyData.delete();
      });
    },
  };
}

function makeLayer(mesh: MeshArrays, kind: 'polys' | 'lines') {
  const polyData = vtkPolyData.newInstance();

  const points = vtkPoints.newInstance();
  points.setData(mesh.positions, 3);
  polyData.setPoints(points);

  if (kind === 'polys') polyData.getPolys().setData(mesh.cells);
  else polyData.getLines().setData(mesh.cells);

  polyData
    .getPointData()
    .setScalars(vtkDataArray.newInstance({ name: 'colors', values: mesh.colors, numberOfComponents: 3 }));

  const mapper = vtkMapper.newInstance();
  mapper.setInputData(polyData);
  mapper.setScalarVisibility(true);
  mapper.setScalarModeToUsePointData();
  mapper.setColorModeToDirectScalars(); // the Uint8 RGB values ARE the colours

  const actor = vtkActor.newInstance();
  actor.setMapper(mapper);
  actor.getProperty().setLighting(false); // floor colours must not change with the lights

  return { polyData, mapper, actor };
}
