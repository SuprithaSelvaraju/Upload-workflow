import type { ReactNode } from 'react';
import { PanelLeftIcon, PanelRightIcon } from './icons';

interface Props {
  side: 'left' | 'right';
  title: string;
  open: boolean;
  onToggle: () => void;
  /** Disables interaction (for example while another model is opening). */
  busy?: boolean;
  /** Small line under the title, e.g. a count. */
  subtitle?: string;
  children: ReactNode;
}

/**
 * A collapsible side panel in the dark workspace. Open: a full panel (a fixed overlay above the
 * viewport below `md`, a normal column from `md` up). Collapsed: a slim rail that reopens it.
 * The rail always keeps its 40px, so collapsing never moves the viewport's other edge.
 */
export function DockPanel({ side, title, open, onToggle, busy = false, subtitle, children }: Props) {
  const Icon = side === 'left' ? PanelLeftIcon : PanelRightIcon;

  if (!open) {
    return (
      <aside aria-label={title} className="w-10 shrink-0">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={false}
          aria-label={`Show ${title}`}
          title={`Show ${title}`}
          className="flex h-full w-10 flex-col items-center gap-3 rounded-lg border border-hud-line bg-hud py-3 text-hud-muted hover:text-hud-ink focus-visible:outline-brand-on-dark"
        >
          <Icon />
          <span className="text-xs font-medium [writing-mode:vertical-rl]">{title}</span>
        </button>
      </aside>
    );
  }

  return (
    <aside aria-label={title} className="relative w-10 shrink-0 md:w-72">
      <div
        className={`absolute inset-y-0 z-20 flex w-72 flex-col overflow-hidden rounded-lg border border-hud-line bg-hud text-hud-ink shadow-xl md:static md:z-auto md:h-full md:w-full md:shadow-none ${
          side === 'left' ? 'left-0' : 'right-0'
        }`}
      >
        <header className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-hud-line px-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{title}</h2>
            {subtitle && <p className="truncate text-[11px] text-hud-muted">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded
            title={`Hide ${title}`}
            className="grid h-7 w-7 shrink-0 place-items-center rounded text-hud-muted hover:bg-hud-line/70 hover:text-hud-ink focus-visible:outline-brand-on-dark"
          >
            <Icon />
          </button>
        </header>
        <div className={`flex min-h-0 flex-1 flex-col ${busy ? 'pointer-events-none opacity-50' : ''}`} inert={busy}>
          {children}
        </div>
      </div>
    </aside>
  );
}
