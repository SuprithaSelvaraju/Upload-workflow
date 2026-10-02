import { useEffect, useRef } from 'react';
import { STANDARD_VIEWS, projectAxis, type ViewAngles } from '../../viewer/engine/orbitMath';
import type { CameraListener } from '../../viewer/ViewerCanvas';

const SIZE = 76;
const C = SIZE / 2;
const LENGTH = 24;
const LABEL_OFFSET = 10;

const axes = [
  { name: 'X', vec: [1, 0, 0] as const, className: 'stroke-axis-x', textClass: 'fill-axis-x' },
  { name: 'Y', vec: [0, 1, 0] as const, className: 'stroke-axis-y', textClass: 'fill-axis-y' },
  { name: 'Z', vec: [0, 0, 1] as const, className: 'stroke-axis-z', textClass: 'fill-axis-z' },
];

function place(angles: ViewAngles) {
  return axes.map((a) => {
    const [sx, sy] = projectAxis(a.vec, angles.azimuth, angles.elevation);
    return {
      x2: C + LENGTH * sx,
      y2: C - LENGTH * sy,
      lx: C + (LENGTH + LABEL_OFFSET) * sx,
      ly: C - (LENGTH + LABEL_OFFSET) * sy,
    };
  });
}

/**
 * Shows which way X, Y and Z point from the current camera. Updated straight
 * on the SVG elements from the camera subscription, so orbiting never
 * re-renders React.
 */
export function AxisTriad({ subscribe }: { subscribe: (listener: CameraListener) => () => void }) {
  const lines = useRef<(SVGLineElement | null)[]>([]);
  const labels = useRef<(SVGTextElement | null)[]>([]);
  const initial = place(STANDARD_VIEWS.iso);

  useEffect(
    () =>
      subscribe((angles) => {
        place(angles).forEach((p, i) => {
          lines.current[i]?.setAttribute('x2', p.x2.toFixed(2));
          lines.current[i]?.setAttribute('y2', p.y2.toFixed(2));
          labels.current[i]?.setAttribute('x', p.lx.toFixed(2));
          labels.current[i]?.setAttribute('y', p.ly.toFixed(2));
        });
      }),
    [subscribe],
  );

  return (
    <div className="pointer-events-none absolute bottom-4 left-4 rounded-full border border-hud-line bg-hud/90">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Axis orientation">
        {axes.map((a, i) => (
          <g key={a.name}>
            <line
              ref={(el) => { lines.current[i] = el; }}
              x1={C}
              y1={C}
              x2={initial[i].x2}
              y2={initial[i].y2}
              className={a.className}
              strokeWidth="1.75"
              strokeLinecap="round"
            />
            <text
              ref={(el) => { labels.current[i] = el; }}
              x={initial[i].lx}
              y={initial[i].ly}
              className={a.textClass}
              fontSize="9"
              fontWeight="600"
              textAnchor="middle"
              dominantBaseline="central"
            >
              {a.name}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
