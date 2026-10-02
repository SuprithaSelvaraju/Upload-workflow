import { useCallback, useMemo, useRef, useState, type DragEvent } from 'react';
import { ErrorCard } from './features/errors/ErrorCard';
import { AppHeader } from './features/header/AppHeader';
import { useModelLoader } from './features/loader/useModelLoader';
import { DropCard, LoadingCard } from './features/upload/StateCards';
import { AxisTriad } from './features/viewer-hud/AxisTriad';
import { ModelInfoPanel } from './features/viewer-hud/ModelInfoPanel';
import { NavigationHints, ViewControls } from './features/viewer-hud/ViewControls';
import { acceptAttribute } from './importers/registry';
import { readViewerTheme } from './theme/readTheme';
import { ViewerCanvas, type CameraListener, type ViewerHandle } from './viewer/ViewerCanvas';

export default function App() {
  const viewerRef = useRef<ViewerHandle>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { state, loadFile, cancel, dismissError } = useModelLoader(viewerRef);
  const [dragging, setDragging] = useState(false);

  // Read once: a new object would make the viewer tear down and rebuild.
  const theme = useMemo(() => readViewerTheme(), []);

  const chooseFile = () => inputRef.current?.click();
  const subscribeCamera = useCallback(
    (listener: CameraListener) => viewerRef.current?.subscribeCamera(listener) ?? (() => {}),
    [],
  );

  const hasModel = state.loaded !== null;
  const showHud = hasModel && !state.loading;

  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    setDragging(true);
  };
  const onDragLeave = (e: DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void loadFile(file);
  };

  return (
    <div className="flex h-full flex-col bg-app text-ink">
      <AppHeader state={state} onOpen={chooseFile} />

      <main className="relative min-h-0 flex-1" onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
        <ViewerCanvas ref={viewerRef} theme={theme} />

        {showHud && state.loaded && (
          <>
            <ModelInfoPanel info={state.loaded} />
            <ViewControls
              onView={(view) => viewerRef.current?.setStandardView(view)}
              onFit={() => viewerRef.current?.fit()}
            />
            <AxisTriad subscribe={subscribeCamera} />
            <NavigationHints />
          </>
        )}

        {!hasModel && !state.loading && !state.error && <DropCard onChoose={chooseFile} />}
        {state.loading && (
          <LoadingCard fileName={state.loading.fileName} stage={state.loading.stage} onCancel={cancel} />
        )}
        {state.error && !state.loading && (
          <ErrorCard error={state.error} hasModel={hasModel} onChooseAnother={chooseFile} onDismiss={dismissError} />
        )}

        {dragging && (
          <div className="pointer-events-none absolute inset-3 flex items-center justify-center rounded-lg border-2 border-dashed border-brand-on-dark bg-brand/10">
            <p className="rounded-md bg-surface px-4 py-2 text-sm font-medium">Drop to open</p>
          </div>
        )}
      </main>

      <input
        ref={inputRef}
        type="file"
        accept={acceptAttribute}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ''; // allow choosing the same file again
          if (file) void loadFile(file);
        }}
      />
    </div>
  );
}
