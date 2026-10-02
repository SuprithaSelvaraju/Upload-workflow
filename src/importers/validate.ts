import { config } from '../config';
import { formatMegabytes } from '../lib/format';
import { ImportError } from './errors';
import type { ImporterDescriptor } from './types';

/** Cheap checks that run before any heavy work. Throws ImportError. */
export async function validateFile(file: File, descriptor: ImporterDescriptor): Promise<void> {
  if (file.size === 0) {
    throw new ImportError(
      'EMPTY_FILE',
      `${file.name} is empty.`,
      `Choose a ${descriptor.label} file exported from your CAD or plant-design tool.`,
    );
  }

  if (file.size > config.maxFileSizeBytes) {
    throw new ImportError(
      'FILE_TOO_LARGE',
      `${file.name} is ${formatMegabytes(file.size)}. Browser preview opens files up to ${formatMegabytes(config.maxFileSizeBytes)}.`,
      'Export a smaller area or fewer systems from the source model and try again.',
    );
  }

  const head = new Uint8Array(await file.slice(0, config.sniffBytes).arrayBuffer());
  if (!descriptor.sniff(head)) {
    throw new ImportError(
      'INVALID_CONTENT',
      `${file.name} has a ${descriptor.label} file name but does not contain ${descriptor.label} data.`,
      'Check that it is a plain-text STEP file (ISO 10303-21). Renamed or compressed files are not supported.',
    );
  }
}
