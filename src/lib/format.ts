const countFormat = new Intl.NumberFormat('en-US');

export function formatCount(n: number): string {
  return countFormat.format(n);
}

export function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function formatDuration(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

const unitSymbols: Record<string, string> = { millimeter: 'mm', centimeter: 'cm', meter: 'm', inch: 'in', foot: 'ft' };

/** "5 m", "0.5 m", "200 mm". */
export function formatLength(value: number, unit: string): string {
  return `${Number(value.toPrecision(3))} ${unitSymbols[unit] ?? unit}`;
}

/** "120 × 40 × 10 mm": overall extents with one unit symbol. */
export function formatExtents(size: readonly [number, number, number], unit: string): string {
  return `${size.map((v) => Number(v.toPrecision(3))).join(' × ')} ${unitSymbols[unit] ?? unit}`;
}

export function unitSymbol(unit: string): string {
  return unitSymbols[unit] ?? unit;
}
