import { formatCount, formatDuration, formatLength } from '../../lib/format';
import type { LoadedInfo } from '../loader/useModelLoader';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-hud-muted">{label}</dt>
      <dd className="text-right font-mono text-hud-ink">{value}</dd>
    </>
  );
}

/** Compact viewer metadata. Sits quietly in the corner; the model is the subject. */
export function ModelInfoPanel({ info }: { info: LoadedInfo }) {
  const { stats } = info;
  return (
    <section
      aria-label="Model information"
      className="pointer-events-none absolute left-4 top-4 w-60 rounded-md border border-hud-line bg-hud/90 px-3.5 py-3 text-xs"
    >
      <p className="text-hud-muted">STEP model</p>
      <p className="mt-0.5 truncate text-sm font-medium text-hud-ink" title={info.fileName}>
        {info.fileName}
      </p>

      <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 border-t border-hud-line pt-3">
        <Row label={stats.partCount === 1 ? 'Part' : 'Parts'} value={formatCount(stats.partCount)} />
        <Row label="Triangles" value={formatCount(stats.triangleCount)} />
        <Row label="Load time" value={formatDuration(info.loadMs)} />
        {info.gridSpacing > 0 && <Row label="Grid" value={formatLength(info.gridSpacing, info.units)} />}
      </dl>

      {info.warnings.length > 0 && (
        <p className="pointer-events-auto mt-3 border-t border-hud-line pt-3 text-hud-muted" title={info.warnings.join('\n')}>
          {info.warnings.length} {info.warnings.length === 1 ? 'warning' : 'warnings'}: hover for details
        </p>
      )}
    </section>
  );
}
