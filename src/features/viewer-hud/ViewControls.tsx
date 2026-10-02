import type { StandardView } from '../../viewer/engine/orbitMath';

const views: { id: StandardView; label: string; title: string }[] = [
  { id: 'iso', label: 'Iso', title: 'Isometric view (default)' },
  { id: 'top', label: 'Top', title: 'Plan view from above' },
  { id: 'front', label: 'Front', title: 'Front elevation' },
  { id: 'right', label: 'Right', title: 'Right elevation' },
];

const hudButton =
  'inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium text-hud-ink hover:bg-hud-line/70 focus-visible:outline-brand-on-dark';

interface Props {
  onView: (view: StandardView) => void;
  onFit: () => void;
}

/** Standard views plus fit. A single compact toolbar; it never blocks the model. */
export function ViewControls({ onView, onFit }: Props) {
  return (
    <div
      role="toolbar"
      aria-label="View controls"
      className="absolute right-4 top-4 flex items-center gap-0.5 rounded-md border border-hud-line bg-hud/90 p-1"
    >
      {views.map((v) => (
        <button key={v.id} type="button" title={v.title} className={hudButton} onClick={() => onView(v.id)}>
          {v.label}
        </button>
      ))}
      <span className="mx-1 h-5 w-px bg-hud-line" aria-hidden="true" />
      <button type="button" title="Fit the whole model in view" className={hudButton} onClick={onFit}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="text-brand-on-dark">
          <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Fit
      </button>
    </div>
  );
}

/** Mouse hints, bottom-right, deliberately low-key. */
export function NavigationHints() {
  return (
    <dl className="pointer-events-none absolute bottom-4 right-4 grid grid-cols-[auto_auto] gap-x-4 gap-y-1 rounded-md border border-hud-line bg-hud/90 px-3 py-2.5 text-xs">
      <dt className="text-hud-muted">Orbit</dt>
      <dd className="text-hud-ink">Left drag</dd>
      <dt className="text-hud-muted">Pan</dt>
      <dd className="text-hud-ink">Right drag or Shift + drag</dd>
      <dt className="text-hud-muted">Zoom</dt>
      <dd className="text-hud-ink">Scroll</dd>
    </dl>
  );
}
