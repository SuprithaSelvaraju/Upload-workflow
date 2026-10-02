export type ImportErrorCode =
  | 'UNSUPPORTED_FORMAT'
  | 'EMPTY_FILE'
  | 'FILE_TOO_LARGE'
  | 'INVALID_CONTENT'
  | 'PARSE_FAILED'
  | 'EMPTY_MODEL'
  | 'OUT_OF_MEMORY'
  | 'WORKER_FAILED'
  | 'UNEXPECTED';

/** Plain-object form, safe to send across postMessage. */
export interface ImportErrorPayload {
  code: ImportErrorCode;
  /** What happened. */
  message: string;
  /** What to do next. */
  hint: string;
  /** Raw technical message, when there is one. */
  detail?: string;
}

export class ImportError extends Error {
  readonly code: ImportErrorCode;
  readonly hint: string;
  readonly detail?: string;

  constructor(code: ImportErrorCode, message: string, hint: string, detail?: string) {
    super(message);
    this.name = 'ImportError';
    this.code = code;
    this.hint = hint;
    this.detail = detail;
  }

  toPayload(): ImportErrorPayload {
    return { code: this.code, message: this.message, hint: this.hint, detail: this.detail };
  }

  static fromPayload(p: ImportErrorPayload): ImportError {
    return new ImportError(p.code, p.message, p.hint, p.detail);
  }
}

export function abortError(): DOMException {
  return new DOMException('Import cancelled', 'AbortError');
}

export function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}
