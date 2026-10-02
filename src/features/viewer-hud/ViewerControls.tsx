/** Floating dark HUD controls over the canvas. Shown only while a model is loaded. */
export function ViewerControls({ onResetView }: { onResetView: () => void }) {
  return (
    <>
      <button
        type="button"
        onClick={onResetView}
        className="absolute right-4 top-4 inline-flex items-center gap-2 rounded-md border border-hud-line bg-hud/90 px-3 py-2 text-sm font-medium text-hud-ink hover:bg-hud"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Reset view
      </button>

      <dl className="pointer-events-none absolute bottom-4 left-4 grid grid-cols-[auto_auto] gap-x-4 gap-y-1 rounded-md border border-hud-line bg-hud/90 px-3 py-2.5 text-xs">
        <dt className="text-hud-muted">Rotate</dt>
        <dd className="text-hud-ink">Drag</dd>
        <dt className="text-hud-muted">Pan</dt>
        <dd className="text-hud-ink">Shift + drag</dd>
        <dt className="text-hud-muted">Zoom</dt>
        <dd className="text-hud-ink">Scroll</dd>
      </dl>
    </>
  );
}
