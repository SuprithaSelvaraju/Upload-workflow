import type { ReactNode } from 'react';
import { formatMegabytes } from '../../lib/format';
import { config } from '../../config';
import type { LoadStage } from '../loader/useModelLoader';

export const primaryButton =
  'inline-flex items-center rounded-md bg-brand px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-strong';
export const secondaryButton =
  'inline-flex items-center rounded-md border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink hover:bg-app';

/** Centred card floating over the dark canvas. */
function CenteredCard({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
      <div className="pointer-events-auto w-full max-w-md rounded-lg border border-line bg-surface p-6 shadow-sm">
        {children}
      </div>
    </div>
  );
}

/** Small tank-and-pipe line drawing: the thing this tool opens. */
function PlantGlyph() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true" className="text-ink-muted">
      <rect x="6" y="14" width="14" height="22" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 20h14" stroke="currentColor" strokeWidth="1.5" />
      <path d="M20 18h10a4 4 0 0 1 4 4v14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="29" y="30" width="10" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 38h38" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function DropCard({ onChoose }: { onChoose: () => void }) {
  return (
    <CenteredCard>
      <PlantGlyph />
      <h1 className="mt-4 text-lg font-semibold">Open a plant model</h1>
      <p className="mt-1.5 text-sm text-ink-muted">
        Drop a STEP file (.step or .stp) anywhere on this window, or choose one from your computer.
      </p>
      <div className="mt-5">
        <button type="button" className={primaryButton} onClick={onChoose}>
          Choose STEP file
        </button>
      </div>
      <p className="mt-5 border-t border-line pt-4 text-xs text-ink-muted">
        Files up to {formatMegabytes(config.maxFileSizeBytes)}. The file is processed in your browser and is not
        uploaded.
      </p>
    </CenteredCard>
  );
}

const stageText: Record<LoadStage, string> = {
  reading: 'Reading the file',
  processing: 'Converting CAD geometry in your browser',
  rendering: 'Preparing the 3D view',
};

export function LoadingCard({
  fileName,
  stage,
  onCancel,
}: {
  fileName: string;
  stage: LoadStage;
  onCancel: () => void;
}) {
  return (
    <CenteredCard>
      <h1 className="truncate text-lg font-semibold" title={fileName}>
        Opening {fileName}
      </h1>
      <p className="mt-1.5 text-sm text-ink-muted" role="status">
        {stageText[stage]}
      </p>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-app">
        <div className="progress-indeterminate h-full w-1/4 rounded-full bg-brand" />
      </div>
      <p className="mt-3 text-xs text-ink-muted">Large plant models can take a while. The page stays usable.</p>
      <div className="mt-5">
        <button type="button" className={secondaryButton} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </CenteredCard>
  );
}
