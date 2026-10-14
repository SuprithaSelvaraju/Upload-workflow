import { describeSelection } from '../../state/selectionInfo';
import { formatCount, formatDuration, unitSymbol } from '../../lib/format';
import type { ModelWorkspace } from '../../state/modelWorkspace';
import type { LoaderState } from '../loader/useModelLoader';
import { useWorkspaceSnapshot } from './useWorkspace';

/** Unobtrusive strip under the workspace: units, selection, visibility and model status. */
export function StatusBar({ workspace, loader }: { workspace: ModelWorkspace; loader: LoaderState }) {
  const snap = useWorkspaceSnapshot(workspace);
  const { index, selection } = snap;
  const described = index && selection ? describeSelection(index, selection, snap.hidden) : null;
  const total = index?.meshes.length ?? 0;

  const status = loader.loading ? 'Opening model…' : loader.error && !loader.loaded ? 'Could not open the file' : loader.loaded ? 'Model ready' : 'No model open';

  return (
    <footer className="flex h-8 shrink-0 items-center justify-between gap-4 rounded-lg border border-hud-line bg-hud px-3 text-xs text-hud-muted" aria-label="Status">
      <span className="min-w-0 truncate" aria-live="polite">
        Selection:{' '}
        <span className="text-hud-ink">{described ? `${described.title}${described.kind === 'group' ? ` (${formatCount(described.meshIds.length)} parts)` : ''}` : 'none'}</span>
      </span>
      <span className="flex shrink-0 items-center gap-4">
        {index && <span>Units: <span className="text-hud-ink">{unitSymbol(index.units)}</span></span>}
        {index && (
          <span>
            Shown: <span className="font-mono text-hud-ink">{formatCount(total - snap.hiddenCount)}/{formatCount(total)}</span>
            {snap.isolated ? <span className="text-brand-on-dark"> · isolated</span> : null}
          </span>
        )}
        {loader.loaded && <span className="hidden sm:inline">Loaded in <span className="font-mono text-hud-ink">{formatDuration(loader.loaded.loadMs)}</span></span>}
        <span className="text-hud-ink">{status}</span>
      </span>
    </footer>
  );
}
