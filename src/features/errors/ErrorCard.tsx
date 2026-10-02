import type { ImportErrorPayload } from '../../importers/errors';
import { primaryButton, secondaryButton } from '../upload/StateCards';
import { errorTitles } from './errorCopy';

interface Props {
  error: ImportErrorPayload;
  /** True when a model is already on screen: show a banner instead of covering it. */
  hasModel: boolean;
  onChooseAnother: () => void;
  onDismiss: () => void;
}

/** What happened, what it means, the way forward. Never a blocking modal. */
export function ErrorCard({ error, hasModel, onChooseAnother, onDismiss }: Props) {
  const card = (
    <div
      role="alert"
      className="pointer-events-auto w-full max-w-md rounded-lg border border-danger-line bg-danger-bg p-5 text-danger-ink shadow-sm"
    >
      <h1 className="text-base font-semibold">{errorTitles[error.code]}</h1>
      <p className="mt-1.5 text-sm">{error.message}</p>
      <p className="mt-1.5 text-sm">{error.hint}</p>
      {hasModel && <p className="mt-1.5 text-sm">The model you had open is still shown.</p>}
      {error.detail && <p className="mt-3 break-words font-mono text-xs opacity-75">{error.detail}</p>}
      <div className="mt-4 flex gap-2">
        <button type="button" className={primaryButton} onClick={onChooseAnother}>
          Choose another file
        </button>
        <button type="button" className={secondaryButton} onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );

  return (
    <div
      className={
        hasModel
          ? 'pointer-events-none absolute inset-x-0 top-0 flex justify-center p-4'
          : 'pointer-events-none absolute inset-0 flex items-center justify-center p-4'
      }
    >
      {card}
    </div>
  );
}
