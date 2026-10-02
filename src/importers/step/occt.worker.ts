/**
 * Runs occt-import-js off the main thread. One worker per import; the main
 * thread terminates it afterwards, because WebAssembly memory never shrinks.
 */
import occtimportjs from 'occt-import-js';
// Path is relative on purpose: it works whether or not the package defines an "exports" map.
import wasmUrl from '../../../node_modules/occt-import-js/dist/occt-import-js.wasm?url';
import { collectTransferables } from '../../domain/sceneModel';
import { ImportError } from '../errors';
import { mapOcctResult } from './mapOcctResult';
import type { WorkerRequest, WorkerResponse } from './workerProtocol';

// The app tsconfig uses the DOM lib, so describe the tiny part of the worker scope we use.
interface WorkerScope {
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
}
const scope = self as unknown as WorkerScope;

scope.onmessage = async (event) => {
  const req = event.data;
  if (req.type !== 'import') return;

  try {
    const occt = await occtimportjs({
      locateFile: (path) => (path.endsWith('.wasm') ? wasmUrl : path),
    });
    const result = occt.ReadStepFile(new Uint8Array(req.buffer), req.params);
    const model = mapOcctResult(result, { sourceName: req.fileName, units: req.params.linearUnit });
    scope.postMessage({ type: 'result', model }, collectTransferables(model));
  } catch (e) {
    scope.postMessage({ type: 'error', error: classify(e, req.fileName).toPayload() });
  }
};

function classify(e: unknown, fileName: string): ImportError {
  if (e instanceof ImportError) return e;

  // Emscripten can throw a bare number (a C++ exception pointer) instead of an Error.
  const raw = e instanceof Error ? e.message : typeof e === 'number' ? `OCCT internal error (${e})` : String(e);

  if (/out of memory|oom|cannot enlarge memory|memory access out of bounds/i.test(raw)) {
    return new ImportError(
      'OUT_OF_MEMORY',
      `The browser ran out of memory while processing ${fileName}.`,
      'Export a smaller part of the plant, or close other tabs and try again.',
      raw,
    );
  }
  return new ImportError(
    'PARSE_FAILED',
    `${fileName} could not be processed.`,
    'The file may be damaged or use STEP features this reader does not support. Re-export it from the source tool and try again.',
    raw,
  );
}
