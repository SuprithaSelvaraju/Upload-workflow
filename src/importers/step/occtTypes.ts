/**
 * Shapes returned by occt-import-js, transcribed from its README
 * ("Processing the result"). Fields are optional/loose on purpose: the mapper
 * validates them rather than trusting them.
 */

export interface OcctParams {
  linearUnit: 'millimeter' | 'centimeter' | 'meter' | 'inch' | 'foot';
  linearDeflectionType: 'bounding_box_ratio' | 'absolute_value';
  linearDeflection: number;
  angularDeflection: number;
}

export interface OcctNode {
  name?: string;
  /** Indices into OcctImportResult.meshes. */
  meshes?: number[];
  children?: OcctNode[];
}

export interface OcctMesh {
  name?: string;
  /** r, g, b. The README does not state the range; the mapper accepts 0..1 or 0..255. */
  color?: ArrayLike<number> | null;
  brep_faces?: { first: number; last: number; color: ArrayLike<number> | null }[];
  attributes?: {
    position?: { array: ArrayLike<number> };
    normal?: { array: ArrayLike<number> };
  };
  index?: { array: ArrayLike<number> };
}

export interface OcctImportResult {
  success: boolean;
  root?: OcctNode;
  meshes?: OcctMesh[];
}
