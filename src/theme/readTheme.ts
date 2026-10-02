import type { ViewerTheme } from '../viewer/engine/createViewer';

/**
 * The CSS `@theme` block in index.css is the single source of truth for colour.
 * WebGL cannot use CSS variables directly, so the few colours the 3D canvas
 * needs are read from those variables once, at startup. Tokens must be #rrggbb.
 */
function readToken(name: string): [number, number, number] {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(raw);
  if (!match) {
    console.warn(`Theme token ${name} is missing or not #rrggbb (got "${raw}"); using neutral grey.`);
    return [0.5, 0.5, 0.5];
  }
  return [parseInt(match[1], 16) / 255, parseInt(match[2], 16) / 255, parseInt(match[3], 16) / 255];
}

export function readViewerTheme(): ViewerTheme {
  return {
    background: readToken('--color-canvas'),
    defaultPartColor: readToken('--color-part'),
    ground: readToken('--color-ground'),
    grid: readToken('--color-grid'),
    gridMajor: readToken('--color-grid-major'),
  };
}
