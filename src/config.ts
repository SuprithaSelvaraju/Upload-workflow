/**
 * Single home for tunable limits and processing defaults.
 * Nothing else in the app should hardcode these numbers.
 */
export const config = {
  /**
   * Largest file the browser preview accepts. POC guess, not a measured limit:
   * the WebAssembly heap is the real ceiling and STEP text expands a lot in
   * memory. Tune with real plant files.
   */
  maxFileSizeBytes: 100 * 1024 * 1024,

  /** Bytes read from the start of a file to check it is really the claimed format. */
  sniffBytes: 2048,

  /** Tessellation settings passed to occt-import-js (same as its documented defaults). */
  tessellation: {
    /** Output unit requested from OCCT. Plant scale is metres. */
    linearUnit: 'meter',
    linearDeflectionType: 'bounding_box_ratio',
    linearDeflection: 0.001,
    angularDeflection: 0.5,
  },
} as const;
