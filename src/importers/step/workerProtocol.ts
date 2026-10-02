import type { SceneModel } from '../../domain/sceneModel';
import type { ImportErrorPayload } from '../errors';
import type { OcctParams } from './occtTypes';

/** Main thread -> worker. `buffer` is transferred, not copied. */
export interface WorkerRequest {
  type: 'import';
  fileName: string;
  buffer: ArrayBuffer;
  params: OcctParams;
}

/** Worker -> main thread. The model's typed-array buffers are transferred, not copied. */
export type WorkerResponse =
  | { type: 'result'; model: SceneModel }
  | { type: 'error'; error: ImportErrorPayload };
