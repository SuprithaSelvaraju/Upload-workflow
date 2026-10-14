import { useCallback, useReducer, useRef, type RefObject } from 'react';
import { buildModelIndex } from '../../domain/modelIndex';
import type { LinearUnit, ModelStats } from '../../domain/sceneModel';
import { ImportError, isAbortError, throwIfAborted, type ImportErrorPayload } from '../../importers/errors';
import { findImporter, supportedFormatsDescription } from '../../importers/registry';
import type { ImportStage } from '../../importers/types';
import { validateFile } from '../../importers/validate';
import type { ViewerHandle } from '../../viewer/ViewerCanvas';
import type { ModelWorkspace } from '../../state/modelWorkspace';

export type LoadStage = ImportStage | 'rendering';

export interface LoadedInfo {
  fileName: string;
  /** Human label of the source format ("STEP"), from the importer registry. */
  formatLabel: string;
  stats: ModelStats;
  warnings: string[];
  loadMs: number;
  /** Minor grid spacing in `units`; 0 if the viewer did not report one. */
  gridSpacing: number;
  units: LinearUnit;
}

/** Plain data only: no SceneModel, no vtk.js or OCCT objects. */
export interface LoaderState {
  loaded: LoadedInfo | null;
  loading: { fileName: string; stage: LoadStage } | null;
  error: ImportErrorPayload | null;
}

type Action =
  | { type: 'start'; fileName: string }
  | { type: 'stage'; stage: LoadStage }
  | { type: 'ready'; info: LoadedInfo }
  | { type: 'fail'; error: ImportErrorPayload }
  | { type: 'cancel' }
  | { type: 'dismissError' };

const initial: LoaderState = { loaded: null, loading: null, error: null };

function reducer(state: LoaderState, action: Action): LoaderState {
  switch (action.type) {
    case 'start':
      return { ...state, error: null, loading: { fileName: action.fileName, stage: 'reading' } };
    case 'stage':
      return state.loading ? { ...state, loading: { ...state.loading, stage: action.stage } } : state;
    case 'ready':
      return { loaded: action.info, loading: null, error: null };
    case 'fail':
      // A failed open never discards the model already on screen.
      return { ...state, loading: null, error: action.error };
    case 'cancel':
      return { ...state, loading: null };
    case 'dismissError':
      return { ...state, error: null };
  }
}

const nextPaint = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

function toPayload(e: unknown): ImportErrorPayload {
  if (e instanceof ImportError) return e.toPayload();
  console.error(e); // anything that is not an ImportError is a bug worth seeing
  return {
    code: 'UNEXPECTED',
    message: 'Something went wrong while opening this file.',
    hint: 'Try again. If it keeps happening, report it with the file that caused it.',
    detail: e instanceof Error ? e.message : String(e),
  };
}

export function useModelLoader(viewerRef: RefObject<ViewerHandle | null>, workspace: ModelWorkspace) {
  const [state, dispatch] = useReducer(reducer, initial);
  const abortRef = useRef<AbortController | null>(null);

  const loadFile = useCallback(
    async (file: File) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const { signal } = controller;
      const startedAt = performance.now();

      let sceneReplaced = false; // true once the viewer's old scene has been torn down
      dispatch({ type: 'start', fileName: file.name });
      try {
        const descriptor = findImporter(file.name);
        if (!descriptor) {
          throw new ImportError(
            'UNSUPPORTED_FORMAT',
            `${file.name} is not a file type this viewer opens yet.`,
            `Choose one of: ${supportedFormatsDescription}.`,
          );
        }
        await validateFile(file, descriptor);
        throwIfAborted(signal);

        const importer = await descriptor.load();
        const model = await importer.import(file, {
          signal,
          onStage: (stage) => dispatch({ type: 'stage', stage }),
        });
        throwIfAborted(signal);

        dispatch({ type: 'stage', stage: 'rendering' });
        await nextPaint(); // let the "preparing" state paint before the synchronous scene build
        throwIfAborted(signal);

        // Derive the explorer data first: if it fails, the model already on screen is untouched.
        const index = buildModelIndex(model);
        sceneReplaced = true;
        const sceneInfo = viewerRef.current?.setModel(model);
        // The new scene starts with nothing selected and everything visible; the workspace now
        // matches, so no selection or visibility from the previous model can survive.
        workspace.load(index);
        dispatch({
          type: 'ready',
          info: {
            fileName: file.name,
            formatLabel: descriptor.label,
            stats: model.stats,
            warnings: model.warnings,
            loadMs: performance.now() - startedAt,
            gridSpacing: sceneInfo?.gridSpacing ?? 0,
            units: model.units,
          },
        });
      } catch (e) {
        if (isAbortError(e)) return; // cancelled, or superseded by a newer file
        if (sceneReplaced) workspace.clear(); // the old scene is gone: do not keep a tree for it
        dispatch({ type: 'fail', error: toPayload(e) });
      }
    },
    [viewerRef, workspace],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: 'cancel' });
  }, []);

  const dismissError = useCallback(() => dispatch({ type: 'dismissError' }), []);

  return { state, loadFile, cancel, dismissError };
}
