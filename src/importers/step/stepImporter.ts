import { config } from '../../config';
import type { SceneModel } from '../../domain/sceneModel';
import { ImportError, abortError, throwIfAborted } from '../errors';
import type { Importer } from '../types';
import type { WorkerRequest, WorkerResponse } from './workerProtocol';

export const stepImporter: Importer = {
  async import(file, options = {}) {
    const { signal, onStage } = options;

    onStage?.('reading');
    const buffer = await file.arrayBuffer();
    throwIfAborted(signal);

    onStage?.('processing');
    return runInWorker(file.name, buffer, signal);
  },
};

function runInWorker(fileName: string, buffer: ArrayBuffer, signal?: AbortSignal): Promise<SceneModel> {
  return new Promise<SceneModel>((resolve, reject) => {
    // The literal `new URL(..., import.meta.url)` form is what lets Vite bundle the worker.
    const worker = new Worker(new URL('./occt.worker.ts', import.meta.url), { type: 'module' });

    const finish = () => {
      worker.terminate();
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      finish();
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      finish();
      if (msg.type === 'result') resolve(msg.model);
      else reject(ImportError.fromPayload(msg.error));
    };

    worker.onerror = (event) => {
      finish();
      reject(
        new ImportError(
          'WORKER_FAILED',
          'The CAD processor stopped unexpectedly.',
          'Reload the page and try again. If it keeps happening, the file may be too large for browser preview.',
          event.message || undefined,
        ),
      );
    };

    const request: WorkerRequest = {
      type: 'import',
      fileName,
      buffer,
      params: { ...config.tessellation },
    };
    worker.postMessage(request, [buffer]); // transfer, do not copy
  });
}
