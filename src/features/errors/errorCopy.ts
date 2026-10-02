import type { ImportErrorCode } from '../../importers/errors';

/** Short, plain-language headline per error code. The details come from the error itself. */
export const errorTitles: Record<ImportErrorCode, string> = {
  UNSUPPORTED_FORMAT: 'This file type is not supported yet',
  EMPTY_FILE: 'This file is empty',
  FILE_TOO_LARGE: 'This model is too large to preview in the browser',
  INVALID_CONTENT: 'This is not a readable STEP file',
  PARSE_FAILED: 'This STEP file could not be processed',
  EMPTY_MODEL: 'No geometry found in this file',
  OUT_OF_MEMORY: 'The browser ran out of memory',
  WORKER_FAILED: 'Processing stopped unexpectedly',
  UNEXPECTED: 'Something went wrong',
};
