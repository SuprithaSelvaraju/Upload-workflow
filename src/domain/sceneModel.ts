/**
 * The neutral contract between importers and the viewer.
 * Importers produce a SceneModel; the viewer consumes one. Neither side knows
 * about the other's library (OCCT / VTK), only about this file.
 */

/** Extend as importers are added: 'iges' | 'ifc' | 'rvm' … */
export type SourceFormat = 'step';

export type LinearUnit = 'millimeter' | 'centimeter' | 'meter' | 'inch' | 'foot';

export type Vec3 = readonly [number, number, number];
export type Rgb = readonly [number, number, number];

export interface Bounds {
  min: Vec3;
  max: Vec3;
}

/** One indexed triangle mesh. Typed arrays own their buffers, so they can be transferred between threads. */
export interface MeshData {
  id: number;
  name: string;
  /** xyz triplets, in the model's `units`. */
  positions: Float32Array;
  /** xyz triplets, one per vertex, always present. */
  normals: Float32Array;
  /** Three vertex indices per triangle. */
  indices: Uint32Array;
  /** RGB in 0..1 when the source file provides one. */
  color: Rgb | null;
}

/** Assembly hierarchy node. Unused by the viewer in Slice 1; kept so a part tree needs no importer change. */
export interface PartNode {
  id: number;
  name: string;
  meshIds: number[];
  children: PartNode[];
  /** Free-form tags (IFC properties, RVM+ATT attributes, …). Empty for STEP today. */
  attributes?: Record<string, string>;
}

export interface ModelStats {
  /** Number of renderable meshes. This is what the status bar calls "parts". */
  partCount: number;
  triangleCount: number;
  vertexCount: number;
}

export interface SceneModel {
  format: SourceFormat;
  sourceName: string;
  units: LinearUnit;
  bounds: Bounds;
  root: PartNode;
  meshes: MeshData[];
  stats: ModelStats;
  /** Non-fatal problems the user should know about (for example skipped meshes). */
  warnings: string[];
}

/** Every ArrayBuffer in the model, for use as a postMessage transfer list. */
export function collectTransferables(model: SceneModel): ArrayBuffer[] {
  const buffers: ArrayBuffer[] = [];
  for (const mesh of model.meshes) {
    buffers.push(
      mesh.positions.buffer as ArrayBuffer,
      mesh.normals.buffer as ArrayBuffer,
      mesh.indices.buffer as ArrayBuffer,
    );
  }
  return buffers;
}
