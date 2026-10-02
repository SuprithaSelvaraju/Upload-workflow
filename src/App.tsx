import { useMemo, useRef, useState, type DragEvent } from 'react';
import { ErrorCard } from './features/errors/ErrorCard';
import { useModelLoader } from './features/loader/useModelLoader';
import { StatusBar } from './features/status/StatusBar';
import { DropCard, LoadingCard, secondaryButton } from './features/upload/StateCards';
import { ViewerControls } from './features/viewer-hud/ViewerControls';
import { acceptAttribute } from './importers/registry';
import { readViewerTheme } from './theme/readTheme';
import { ViewerCanvas, type ViewerHandle } from './viewer/ViewerCanvas';

function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="text-brand">
        <path
          d="M10 2l6.5 2.5v5c0 4-2.7 6.7-6.5 8-3.8-1.3-6.5-4-6.5-8v-5L10 2z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
      <span className="text-sm font-semibold">AgniKawach</span>
      <span className="text-sm text-ink-muted">CAD viewer</span>
    </div>
  );
}

export default function App() {
  const viewerRef = useRef<ViewerHandle>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { state, loadFile, cancel, dismissError } = useModelLoader(viewerRef);
  const [dragging, setDragging] = useState(false);

  // Read once: a new object would make the viewer tear down and rebuild.
  const theme = useMemo(() => readViewerTheme(), []);

  const chooseFile = () => inputRef.current?.click();
  const hasModel = state.loaded !== null;

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
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-line bg-surface px-4">
        <Wordmark />
        {hasModel && (
          <button type="button" className={secondaryButton} onClick={chooseFile}>
            Open another file
          </button>
        )}
      </header>

      <main
        className="relative min-h-0 flex-1"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <ViewerCanvas ref={viewerRef} theme={theme} />

        {hasModel && !state.loading && <ViewerControls onResetView={() => viewerRef.current?.resetView()} />}

        {!hasModel && !state.loading && !state.error && <DropCard onChoose={chooseFile} />}
        {state.loading && (
          <LoadingCard fileName={state.loading.fileName} stage={state.loading.stage} onCancel={cancel} />
        )}
        {state.error && !state.loading && (
          <ErrorCard error={state.error} hasModel={hasModel} onChooseAnother={chooseFile} onDismiss={dismissError} />
        )}

        {dragging && (
          <div className="pointer-events-none absolute inset-3 flex items-center justify-center rounded-lg border-2 border-dashed border-brand bg-brand/10">
            <p className="rounded-md bg-surface px-4 py-2 text-sm font-medium">Drop to open</p>
          </div>
        )}
      </main>

      <StatusBar state={state} />

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
