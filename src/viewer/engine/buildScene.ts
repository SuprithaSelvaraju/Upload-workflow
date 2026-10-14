import vtkPoints from '@kitware/vtk.js/Common/Core/Points';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import type vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import type { Rgb, SceneModel } from '../../domain/sceneModel';
import { createSelectionHighlighter } from './selectionHighlighter';

export interface SceneHandle {
  /** Removes every actor from the renderer and frees all VTK objects. */
  dispose(): void;
  /** Highlights exactly these meshes (ids = indices into SceneModel.meshes); [] clears the highlight. */
  setHighlighted(meshIds: readonly number[]): void;
  /** Shows/hides meshes: one byte per mesh, 1 = hidden. A mask of the wrong length is ignored. */
  setHidden(mask: Uint8Array): void;
}

/** How far a selected part's colour is blended towards the selection accent, and its ambient boost. */
const SELECTED_BLEND = 0.65;
const SELECTED_AMBIENT = 0.32;
const NORMAL_AMBIENT = 0.18;

/**
 * The only place a SceneModel becomes VTK objects.
 * One polydata + mapper + actor per mesh, so per-part colour (and, in later
 * slices, picking and visibility) needs no restructuring.
 */
export function buildScene(
  model: SceneModel,
  renderer: vtkRenderer,
  defaultColor: Rgb,
  selectionColor: Rgb,
): SceneHandle {
  // Selection, picking and actors are all keyed by position in SceneModel.meshes.
  // Checked up front so a bad model fails before any VTK object exists.
  model.meshes.forEach((mesh, i) => {
    if (mesh.id !== i) throw new Error(`SceneModel.meshes[${i}].id is ${mesh.id}; mesh ids must equal their index`);
  });

  const baseColors: Rgb[] = [];
  const actors: vtkActor[] = [];
  const mappers: vtkMapper[] = [];
  const polyDatas: vtkPolyData[] = [];

  model.meshes.forEach((mesh) => {
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
    const base: Rgb = mesh.color ?? defaultColor;
    baseColors.push(base);
    const [r, g, b] = base;
    const property = actor.getProperty();
    property.setColor(r, g, b);
    // Ambient is the "fill from everywhere" term (there is no ambient light); see lighting.ts.
    // Specular stays low: industrial paint and steel, not chrome.
    property.setAmbient(NORMAL_AMBIENT);
    property.setDiffuse(0.8);
    property.setSpecular(0.1);
    property.setSpecularPower(20);

    renderer.addActor(actor);
    actors.push(actor);
    mappers.push(mapper);
    polyDatas.push(polyData);
  });

  /** Always derived from the immutable base colour, so highlighting is fully reversible. */
  function paint(i: number, isSelected: boolean) {
    const base = baseColors[i];
    const t = isSelected ? SELECTED_BLEND : 0;
    const property = actors[i].getProperty();
    property.setColor(
      base[0] + (selectionColor[0] - base[0]) * t,
      base[1] + (selectionColor[1] - base[1]) * t,
      base[2] + (selectionColor[2] - base[2]) * t,
    );
    property.setAmbient(isSelected ? SELECTED_AMBIENT : NORMAL_AMBIENT);
  }

  const highlighter = createSelectionHighlighter(actors.length, paint);
  const hiddenNow = new Uint8Array(actors.length); // what the actors currently show
  let disposed = false;

  return {
    setHighlighted(meshIds) {
      if (!disposed) highlighter.setMany(meshIds);
    },
    setHidden(mask) {
      if (disposed || mask.length !== hiddenNow.length) return;
      for (let i = 0; i < mask.length; i++) {
        if (mask[i] !== hiddenNow[i]) {
          hiddenNow[i] = mask[i];
          actors[i].setVisibility(mask[i] !== 1);
        }
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      highlighter.dispose();
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