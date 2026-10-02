import vtkPoints from '@kitware/vtk.js/Common/Core/Points';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import type vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import type { Rgb, SceneModel } from '../../domain/sceneModel';

export interface SceneHandle {
  /** Removes every actor from the renderer and frees all VTK objects. */
  dispose(): void;
}

/**
 * The only place a SceneModel becomes VTK objects.
 * One polydata + mapper + actor per mesh, so per-part colour (and, in later
 * slices, picking and visibility) needs no restructuring.
 */
export function buildScene(model: SceneModel, renderer: vtkRenderer, defaultColor: Rgb): SceneHandle {
  const actors: vtkActor[] = [];
  const mappers: vtkMapper[] = [];
  const polyDatas: vtkPolyData[] = [];

  for (const mesh of model.meshes) {
    const polyData = vtkPolyData.newInstance();

    const points = vtkPoints.newInstance();
    points.setData(mesh.positions, 3);
    polyData.setPoints(points);

    // vtk.js cell arrays are [nPoints, i0, i1, i2, nPoints, ...]; for triangles nPoints is always 3.
    polyData.getPolys().setData(toTriangleCells(mesh.indices));

    polyData.getPointData().setNormals(
      vtkDataArray.newInstance({ name: 'Normals', values: mesh.normals, numberOfComponents: 3 }),
    );

    const mapper = vtkMapper.newInstance();
    mapper.setInputData(polyData);
    mapper.setScalarVisibility(false);

    const actor = vtkActor.newInstance();
    actor.setMapper(mapper);
    const [r, g, b] = mesh.color ?? defaultColor;
    const property = actor.getProperty();
    property.setColor(r, g, b);
    property.setAmbient(0.2);
    property.setDiffuse(0.8);
    property.setSpecular(0.15);
    property.setSpecularPower(24);

    renderer.addActor(actor);
    actors.push(actor);
    mappers.push(mapper);
    polyDatas.push(polyData);
  }

  return {
    dispose() {
      for (const actor of actors) renderer.removeActor(actor);
      for (const actor of actors) actor.delete();
      for (const mapper of mappers) mapper.delete();
      for (const polyData of polyDatas) polyData.delete();
    },
  };
}

function toTriangleCells(indices: Uint32Array): Uint32Array {
  const triangleCount = indices.length / 3;
  const cells = new Uint32Array(triangleCount * 4);
  for (let t = 0, i = 0, o = 0; t < triangleCount; t++) {
    cells[o++] = 3;
    cells[o++] = indices[i++];
    cells[o++] = indices[i++];
    cells[o++] = indices[i++];
  }
  return cells;
}
