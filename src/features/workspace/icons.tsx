/** Small inline line icons (the project has no icon library; the header and HUD draw theirs inline too). */
import type { ReactNode } from 'react';

interface IconProps {
  className?: string;
  size?: number;
}

function Svg({ className, size = 16, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export const ChevronIcon = (p: IconProps) => (
  <Svg {...p}><path d="M6 3.5L10.5 8 6 12.5" /></Svg>
);

export const EyeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" />
    <circle cx="8" cy="8" r="2" />
  </Svg>
);

export const EyeOffIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.2 4A6.6 6.6 0 0 1 8 3.5c4 0 6.5 4.5 6.5 4.5a11 11 0 0 1-1.9 2.4M3.7 5.6A11 11 0 0 0 1.5 8S4 12.5 8 12.5a6.4 6.4 0 0 0 2.6-.6" />
    <path d="M2.5 2.5l11 11" />
  </Svg>
);

/** Half-visible: some of a group's parts are hidden. */
export const EyeMixedIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" />
    <path d="M8 6a2 2 0 0 1 0 4z" fill="currentColor" />
  </Svg>
);

/** Corner brackets around a dot: show only this. */
export const IsolateIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2 5.5V3a1 1 0 0 1 1-1h2.5M10.5 2H13a1 1 0 0 1 1 1v2.5M14 10.5V13a1 1 0 0 1-1 1h-2.5M5.5 14H3a1 1 0 0 1-1-1v-2.5" />
    <circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none" />
  </Svg>
);

export const AssemblyIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 1.8l5.5 3.1v6.2L8 14.2 2.5 11.1V4.9L8 1.8z" />
    <path d="M2.5 4.9L8 8l5.5-3.1M8 8v6.2" />
  </Svg>
);

export const PartIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3" width="10" height="10" rx="1.5" />
  </Svg>
);

export const PanelLeftIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2" y="3" width="12" height="10" rx="1.5" />
    <path d="M6 3v10" />
  </Svg>
);

export const PanelRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2" y="3" width="12" height="10" rx="1.5" />
    <path d="M10 3v10" />
  </Svg>
);

export const InfoIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 7.2V11M8 5v.1" />
  </Svg>
);

export const RestoreIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 8a5 5 0 1 0 1.6-3.7M3 2.5v3h3" />
  </Svg>
);
