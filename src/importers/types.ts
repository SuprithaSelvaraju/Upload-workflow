import type { SceneModel, SourceFormat } from '../domain/sceneModel';

/** Coarse stages an importer reports so the UI can say what is happening. */
export type ImportStage = 'reading' | 'processing';

export interface ImportOptions {
  signal?: AbortSignal;
  onStage?: (stage: ImportStage) => void;
}

/** Turns one file into a SceneModel. Knows nothing about rendering. */
export interface Importer {
  import(file: File, options?: ImportOptions): Promise<SceneModel>;
}

/**
 * Cheap, always-loaded description of a format. The heavy importer (and its
 * WebAssembly) is only fetched by `load()` when a file of that format is opened.
 */
export interface ImporterDescriptor {
  id: SourceFormat;
  label: string;
  /** Lower-case, with the dot. */
  extensions: readonly string[];
  /** True when the first bytes of the file look like this format. */
  sniff(head: Uint8Array): boolean;
  load(): Promise<Importer>;
}
