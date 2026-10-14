import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { ModelIndex } from '../../domain/modelIndex';
import { formatCount } from '../../lib/format';
import {
  buildRows,
  defaultExpanded,
  isRowSelected,
  revealKeys,
  selectedRowIndex,
  type ExplorerRow,
} from '../../state/explorerRows';
import { visibilityOf, type ModelWorkspace, type SelectionTarget, type Visibility } from '../../state/modelWorkspace';
import { AssemblyIcon, ChevronIcon, EyeIcon, EyeMixedIcon, EyeOffIcon, IsolateIcon, PartIcon, RestoreIcon } from '../workspace/icons';
import { useWorkspaceSnapshot } from '../workspace/useWorkspace';

const ROW_HEIGHT = 28;
const OVERSCAN = 8;
const INDENT_PX = 14;
const EMPTY: ReadonlySet<string> = new Set();

const rowDomId = (key: string) => `explorer-row-${key.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

/** What a click on a row selects. A group (the "not in assembly tree" bucket) is not selectable. */
function targetOf(row: ExplorerRow): SelectionTarget | null {
  if (row.meshId !== null) return { kind: 'mesh', meshId: row.meshId };
  if (row.nodeId !== null) return { kind: 'node', nodeId: row.nodeId };
  return null;
}

const visibilityIcon = { visible: EyeIcon, hidden: EyeOffIcon, mixed: EyeMixedIcon } as const;
const visibilityLabel: Record<Visibility, string> = { visible: 'Hide', hidden: 'Show', mixed: 'Hide' };

interface RowViewProps {
  row: ExplorerRow;
  selected: boolean;
  /** Inside a selected group (but not itself the selection). */
  inSelection: boolean;
  active: boolean;
  visibility: Visibility;
  onSelect: () => void;
  onToggleExpand: () => void;
  onToggleVisible: () => void;
  onIsolate: () => void;
}

function RowView({ row, selected, inSelection, active, visibility, onSelect, onToggleExpand, onToggleVisible, onIsolate }: RowViewProps) {
  const Eye = visibilityIcon[visibility];
  const Glyph = row.kind === 'part' || row.kind === 'mesh' ? PartIcon : AssemblyIcon;
  const dim = visibility === 'hidden';
  const canIsolate = row.kind !== 'group' && row.meshIds.length > 0;

  return (
    <div
      id={rowDomId(row.key)}
      role="treeitem"
      aria-level={row.depth + 1}
      aria-selected={selected}
      aria-expanded={row.expandable ? row.expanded : undefined}
      title={dim ? `${row.name} (hidden: show it to select)` : row.name}
      onClick={onSelect}
      onDoubleClick={row.expandable ? onToggleExpand : undefined}
      style={{ height: ROW_HEIGHT, paddingLeft: 6 + row.depth * INDENT_PX }}
      className={`group flex cursor-default select-none items-center gap-1 pr-1.5 text-[13px] ${
        selected
          ? 'bg-brand/30 text-hud-ink shadow-[inset_2px_0_0_var(--color-brand-on-dark)]'
          : inSelection
            ? 'bg-brand/10 text-hud-ink'
            : 'text-hud-ink hover:bg-hud-line/50'
      } ${active ? 'outline outline-1 -outline-offset-1 outline-brand-on-dark' : ''}`}
    >
      {row.expandable ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label={row.expanded ? `Collapse ${row.name}` : `Expand ${row.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand();
          }}
          className="grid h-5 w-5 shrink-0 place-items-center rounded text-hud-muted hover:bg-hud-line hover:text-hud-ink"
        >
          <ChevronIcon size={12} className={row.expanded ? 'rotate-90' : ''} />
        </button>
      ) : (
        <span className="w-5 shrink-0" aria-hidden="true" />
      )}
      <Glyph size={14} className={`shrink-0 ${dim ? 'text-hud-muted/60' : 'text-brand-on-dark'}`} />
      <span className={`min-w-0 flex-1 truncate ${dim ? 'text-hud-muted line-through decoration-hud-muted/50' : ''}`}>{row.name}</span>
      {row.kind === 'node' || row.kind === 'group' ? (
        <span className="shrink-0 font-mono text-[11px] text-hud-muted" title={`${row.meshIds.length} parts`}>
          {formatCount(row.meshIds.length)}
        </span>
      ) : null}
      {canIsolate && (
        <button
          type="button"
          tabIndex={-1}
          title="Isolate: show only this"
          aria-label={`Isolate ${row.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onIsolate();
          }}
          className={`grid h-6 w-6 shrink-0 place-items-center rounded text-hud-muted hover:bg-hud-line hover:text-hud-ink ${
            selected ? '' : 'opacity-0 focus-visible:opacity-100 group-hover:opacity-100'
          }`}
        >
          <IsolateIcon size={14} />
        </button>
      )}
      <button
        type="button"
        tabIndex={-1}
        title={`${visibilityLabel[visibility]} ${row.name}`}
        aria-label={`${visibilityLabel[visibility]} ${row.name}`}
        aria-pressed={visibility === 'hidden'}
        onClick={(e) => {
          e.stopPropagation();
          onToggleVisible();
        }}
        className={`grid h-6 w-6 shrink-0 place-items-center rounded hover:bg-hud-line hover:text-hud-ink ${
          visibility !== 'visible' ? 'text-hud-ink' : selected ? 'text-hud-muted' : 'text-hud-muted opacity-0 focus-visible:opacity-100 group-hover:opacity-100'
        }`}
      >
        <Eye size={14} />
      </button>
    </div>
  );
}

export function ModelExplorer({ workspace }: { workspace: ModelWorkspace }) {
  const snap = useWorkspaceSnapshot(workspace);
  const { index, selection, hidden } = snap;

  // ---- expansion: pure UI state, scoped to one model ----
  const initialExpanded = useMemo(() => (index ? defaultExpanded(index) : EMPTY), [index]);
  const [exp, setExp] = useState<{ index: ModelIndex | null; keys: ReadonlySet<string> }>({ index: null, keys: EMPTY });
  const expanded = index && exp.index === index ? exp.keys : initialExpanded;
  const setExpanded = (keys: ReadonlySet<string>) => setExp({ index, keys });

  const rows = useMemo(() => (index ? buildRows(index, expanded) : []), [index, expanded]);
  const highlightSet = useMemo(() => new Set(snap.highlightedMeshIds), [snap.highlightedMeshIds]);

  // ---- keyboard cursor + windowing ----
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(400);
  const scroller = useRef<HTMLDivElement>(null);
  const pendingReveal = useRef<SelectionTarget | null>(null);

  // The scroller only exists once a model is open, so measure when it appears (and on every resize).
  const hasModel = index !== null;
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => setViewportH(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasModel]);

  // A selection made anywhere else (3D view, inspector) is revealed here: expand ancestors, scroll to it.
  // Runs on selection change only, so a user who collapses a branch is not fought.
  // (A layout effect, declared before the scroll effect below, so both see the same commit: with a
  // passive effect the "pending" target would lag one render behind and move the cursor to the OLD selection.)
  useLayoutEffect(() => {
    if (!index || !selection) return;
    const missing = revealKeys(index, selection).filter((k) => !expanded.has(k));
    if (missing.length > 0) setExpanded(new Set([...expanded, ...missing]));
    pendingReveal.current = selection;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, index]);

  useLayoutEffect(() => {
    const target = pendingReveal.current;
    const el = scroller.current;
    if (!target || !el) return;
    const i = selectedRowIndex(rows, target);
    if (i < 0) return; // ancestors still expanding: the next render will find it
    pendingReveal.current = null;
    setActiveKey(rows[i].key);
    const top = i * ROW_HEIGHT;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + ROW_HEIGHT > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_HEIGHT - el.clientHeight;
  }, [rows, selection]);

  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(rows.length, Math.ceil((scrollTop + viewportH) / ROW_HEIGHT) + OVERSCAN);

  // ---- actions (all go through the workspace: no local copy of selection or visibility) ----
  const select = (row: ExplorerRow) => {
    setActiveKey(row.key);
    if (row.kind === 'group') return;
    if (row.meshId !== null) workspace.selectMesh(row.meshId);
    else if (row.nodeId !== null) workspace.selectNode(row.nodeId);
  };
  const toggleExpand = (row: ExplorerRow) => {
    const next = new Set(expanded);
    if (next.has(row.key)) next.delete(row.key);
    else next.add(row.key);
    setExpanded(next);
  };
  const toggleVisible = (row: ExplorerRow) => {
    if (row.kind === 'node' && row.nodeId !== null) workspace.toggleNode(row.nodeId);
    else if (row.meshId !== null) workspace.toggleMesh(row.meshId);
    else workspace.toggleMeshes(row.meshIds);
  };
  const isolate = (row: ExplorerRow) => {
    const t = targetOf(row);
    if (t) workspace.isolate(t);
  };

  const moveActive = (i: number) => {
    const clamped = Math.max(0, Math.min(rows.length - 1, i));
    const row = rows[clamped];
    if (!row) return;
    setActiveKey(row.key);
    const el = scroller.current;
    if (!el) return;
    const top = clamped * ROW_HEIGHT;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + ROW_HEIGHT > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_HEIGHT - el.clientHeight;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (rows.length === 0 || e.altKey || e.ctrlKey || e.metaKey) return;
    const i = Math.max(0, rows.findIndex((r) => r.key === activeKey));
    const row = rows[i];
    switch (e.key) {
      case 'ArrowDown': moveActive(i + 1); break;
      case 'ArrowUp': moveActive(i - 1); break;
      case 'Home': moveActive(0); break;
      case 'End': moveActive(rows.length - 1); break;
      case 'ArrowRight':
        if (row.expandable && !row.expanded) toggleExpand(row);
        else if (row.expanded) moveActive(i + 1);
        break;
      case 'ArrowLeft':
        if (row.expanded) toggleExpand(row);
        else for (let j = i - 1; j >= 0; j--) if (rows[j].depth < row.depth) { moveActive(j); break; }
        break;
      case 'Enter':
      case ' ': select(row); break;
      case 'Escape': workspace.clearSelection(); break;
      case 'h':
      case 'H': toggleVisible(row); break;
      case 'i':
      case 'I': isolate(row); break;
      default: return;
    }
    e.preventDefault();
  };

  if (!index) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <AssemblyIcon size={24} className="text-hud-muted" />
        <p className="text-sm text-hud-ink">No model open</p>
        <p className="text-xs text-hud-muted">Open a model file to browse its components here.</p>
      </div>
    );
  }

  const total = index.meshes.length;
  const visibleCount = total - snap.hiddenCount;

  return (
    <>
      {(snap.isolated || snap.hiddenCount > 0) && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-hud-line bg-hud-line/30 px-3 py-1.5 text-xs">
          <span className="min-w-0 text-hud-ink" role="status">
            {snap.isolated ? 'Isolated view' : `${formatCount(snap.hiddenCount)} hidden`}
            <span className="text-hud-muted"> · {formatCount(visibleCount)}/{formatCount(total)} shown</span>
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {snap.isolated && (
              <button type="button" onClick={() => workspace.restoreIsolation()} title="Return to the visibility you had before isolating" className="inline-flex items-center gap-1 rounded px-1.5 py-1 font-medium text-brand-on-dark hover:bg-hud-line">
                <RestoreIcon size={12} /> Restore
              </button>
            )}
            <button type="button" onClick={() => workspace.showAll()} className="rounded px-1.5 py-1 font-medium text-hud-ink hover:bg-hud-line">
              Show all
            </button>
          </span>
        </div>
      )}

      <div
        ref={scroller}
        role="tree"
        aria-label="Model components"
        aria-multiselectable={false}
        aria-activedescendant={focused && activeKey ? rowDomId(activeKey) : undefined}
        tabIndex={0}
        onKeyDown={onKeyDown}
        // Show the keyboard cursor only for keyboard focus, not after a mouse click.
        onFocus={(e) => setFocused(e.currentTarget.matches(':focus-visible'))}
        onBlur={() => setFocused(false)}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden outline-none focus-visible:outline-brand-on-dark"
      >
        <div style={{ height: rows.length * ROW_HEIGHT, position: 'relative' }}>
          <div style={{ position: 'absolute', top: start * ROW_HEIGHT, left: 0, right: 0 }}>
            {rows.slice(start, end).map((row) => (
              <RowView
                key={row.key}
                row={row}
                selected={isRowSelected(row, selection)}
                inSelection={
                  selection?.kind === 'node' && !isRowSelected(row, selection) && row.meshIds.length > 0 && row.meshIds.every((m) => highlightSet.has(m))
                }
                active={focused && row.key === activeKey}
                visibility={visibilityOf(hidden, row.meshIds)}
                onSelect={() => select(row)}
                onToggleExpand={() => toggleExpand(row)}
                onToggleVisible={() => toggleVisible(row)}
                onIsolate={() => isolate(row)}
              />
            ))}
          </div>
        </div>
      </div>

      <footer className="shrink-0 border-t border-hud-line px-3 py-1.5 text-[11px] text-hud-muted">
        {formatCount(total)} {total === 1 ? 'part' : 'parts'} · {formatCount(index.nodeOrder.length)} {index.nodeOrder.length === 1 ? 'node' : 'nodes'} in the assembly tree
      </footer>
    </>
  );
}
