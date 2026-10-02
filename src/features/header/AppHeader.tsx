import { primaryButton, secondaryButton } from '../upload/StateCards';
import type { LoaderState } from '../loader/useModelLoader';

function Mark() {
  return (
    <span
      aria-hidden="true"
      className="grid h-6 w-6 place-items-center rounded-md bg-brand text-[10px] font-bold tracking-tight text-white"
    >
      AK
    </span>
  );
}

function ReadyStatus() {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-ink-muted" role="status">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="text-brand">
        <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5.4 8.2l1.9 1.9 3.3-3.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Model ready
    </span>
  );
}

/** Platform-style header: identity, where you are, and the one primary action. */
export function AppHeader({ state, onOpen }: { state: LoaderState; onOpen: () => void }) {
  const fileName = state.loaded?.fileName;

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line bg-surface px-5">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex items-center gap-2.5">
          <Mark />
          <span className="text-[15px] font-semibold tracking-tight">AgniKawach</span>
        </div>
        <span className="h-5 w-px bg-line" aria-hidden="true" />
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
          <span className="text-ink-muted">Geometry</span>
          <span className="text-ink-muted" aria-hidden="true">/</span>
          <span className="truncate font-medium" title={fileName}>
            {fileName ?? 'No model open'}
          </span>
        </nav>
      </div>

      <div className="flex shrink-0 items-center gap-4">
        {state.loading ? (
          <span className="text-sm text-ink-muted" role="status">Opening model…</span>
        ) : state.loaded ? (
          <ReadyStatus />
        ) : null}
        <button type="button" className={state.loaded ? secondaryButton : primaryButton} onClick={onOpen}>
          {state.loaded ? 'Open another file' : 'Open STEP file'}
        </button>
      </div>
    </header>
  );
}
