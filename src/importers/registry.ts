import type { ImporterDescriptor } from './types';

const step: ImporterDescriptor = {
  id: 'step',
  label: 'STEP',
  extensions: ['.step', '.stp'],
  // ISO 10303-21 files start with the literal token "ISO-10303-21;".
  sniff: (head) => new TextDecoder('latin1').decode(head).toUpperCase().includes('ISO-10303-21'),
  load: async () => (await import('./step/stepImporter')).stepImporter,
};

/** Add IGES / IFC / RVM descriptors here. Nothing else in the app changes. */
export const importerRegistry: readonly ImporterDescriptor[] = [step];

export function findImporter(fileName: string): ImporterDescriptor | undefined {
  const lower = fileName.toLowerCase();
  return importerRegistry.find((d) => d.extensions.some((ext) => lower.endsWith(ext)));
}

export const acceptedExtensions: readonly string[] = importerRegistry.flatMap((d) => d.extensions);
export const acceptAttribute = acceptedExtensions.join(',');
export const supportedFormatsLabel = importerRegistry.map((d) => d.label).join(', ');
