import { formatCount, formatDuration } from '../../lib/format';
import type { LoaderState } from '../loader/useModelLoader';

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="font-mono text-ink">{value}</span>
      <span>{label}</span>
    </span>
  );
}

export function StatusBar({ state }: { state: LoaderState }) {
  const { loaded, loading } = state;

  return (
    <footer className="flex h-9 shrink-0 items-center justify-between gap-6 border-t border-line bg-surface px-4 text-xs text-ink-muted">
      <div className="min-w-0 truncate">
        {loading ? (
          <span>Opening {loading.fileName}</span>
        ) : loaded ? (
          <span className="font-medium text-ink" title={loaded.fileName}>
            {loaded.fileName}
          </span>
        ) : (
          <span>No model loaded</span>
        )}
      </div>

      {loaded && !loading && (
        <div className="flex shrink-0 items-center gap-5">
          {loaded.warnings.length > 0 && (
            <span className="text-danger-ink" title={loaded.warnings.join('\n')}>
              {loaded.warnings.length} {loaded.warnings.length === 1 ? 'warning' : 'warnings'}
            </span>
          )}
          <Stat value={formatCount(loaded.stats.partCount)} label={loaded.stats.partCount === 1 ? 'part' : 'parts'} />
          <Stat
            value={formatCount(loaded.stats.triangleCount)}
            label={loaded.stats.triangleCount === 1 ? 'triangle' : 'triangles'}
          />
          <Stat value={formatDuration(loaded.loadMs)} label="load time" />
        </div>
      )}
    </footer>
  );
}
