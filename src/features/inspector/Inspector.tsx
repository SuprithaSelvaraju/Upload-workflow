import type { ReactNode } from 'react';
import { describeSelection, rgbToHex, type SelectionDescription } from '../../state/selectionInfo';
import { formatCount, formatExtents } from '../../lib/format';
import { visibilityOf, type ModelWorkspace, type SelectionTarget } from '../../state/modelWorkspace';
import { AssemblyIcon, EyeIcon, EyeOffIcon, InfoIcon, IsolateIcon, PartIcon, RestoreIcon } from '../workspace/icons';
import { useWorkspaceSnapshot } from '../workspace/useWorkspace';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-hud-line px-3 py-3 last:border-b-0">
      <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-hud-muted">{title}</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">{children}</dl>
    </section>
  );
}

function Row({ label, children, mono = false }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <>
      <dt className="text-hud-muted">{label}</dt>
      <dd className={`min-w-0 break-words text-right text-hud-ink ${mono ? 'font-mono' : ''}`}>{children}</dd>
    </>
  );
}

const actionButton =
  'inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-hud-line px-2.5 py-1.5 text-xs font-medium text-hud-ink hover:bg-hud-line/70 focus-visible:outline-brand-on-dark disabled:opacity-40';

export function Inspector({ workspace }: { workspace: ModelWorkspace }) {
  const snap = useWorkspaceSnapshot(workspace);
  const { index, selection } = snap;

  if (!index) {
    return <Empty title="No model open" body="Component details appear here once a model file is open." />;
  }

  const described = selection ? describeSelection(index, selection, snap.hidden) : null;
  if (!selection || !described) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <Empty
          title="Nothing selected"
          body="Click a part in the 3D view or in the Model Explorer to see its details. Click empty space to clear the selection."
        />
        <Section title="Model">
          <Row label="File">{index.sourceName}</Row>
          <Row label="Parts" mono>{formatCount(index.meshes.length)}</Row>
          <Row label="Assembly nodes" mono>{formatCount(index.nodeOrder.length)}</Row>
          {snap.hiddenCount > 0 && <Row label="Hidden" mono>{formatCount(snap.hiddenCount)}</Row>}
        </Section>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <Selected d={described} target={selection} workspace={workspace} isolated={snap.isolated} units={index.units} hidden={snap.hidden} />
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <InfoIcon size={22} className="text-hud-muted" />
      <p className="text-sm text-hud-ink">{title}</p>
      <p className="text-xs leading-relaxed text-hud-muted">{body}</p>
    </div>
  );
}

function Selected({
  d,
  target,
  workspace,
  isolated,
  units,
  hidden,
}: {
  d: SelectionDescription;
  target: SelectionTarget;
  workspace: ModelWorkspace;
  isolated: boolean;
  units: string;
  hidden: Uint8Array;
}) {
  const Glyph = d.kind === 'part' ? PartIcon : AssemblyIcon;
  const visible = visibilityOf(hidden, d.meshIds);
  const hide = () => (target.kind === 'mesh' ? workspace.toggleMesh(target.meshId) : workspace.toggleNode(target.nodeId));

  return (
    <>
      <div className="border-b border-hud-line px-3 py-3">
        <div className="flex items-start gap-2">
          <Glyph size={16} className="mt-0.5 shrink-0 text-brand-on-dark" />
          <div className="min-w-0">
            <h3 className="break-words text-sm font-semibold leading-snug" title={d.title}>{d.title}</h3>
            <p className="text-[11px] text-hud-muted">{d.kind === 'part' ? 'Part' : d.meshIds.length === 0 ? 'Empty group' : 'Assembly / group'}</p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button type="button" className={actionButton} onClick={hide} title="Hide (the selection will clear)" disabled={d.meshIds.length === 0}>
            {visible === 'hidden' ? <EyeIcon size={14} /> : <EyeOffIcon size={14} />} Hide
          </button>
          {isolated ? (
            <button type="button" className={actionButton} onClick={() => workspace.restoreIsolation()}>
              <RestoreIcon size={14} /> Restore
            </button>
          ) : (
            <button type="button" className={actionButton} onClick={() => workspace.isolate(target)} disabled={d.meshIds.length === 0}>
              <IsolateIcon size={14} /> Isolate
            </button>
          )}
        </div>
      </div>

      <Section title="Identity">
        {d.kind === 'part' && d.mesh && (
          <>
            {d.mesh.name !== d.title && <Row label="Mesh name">{d.mesh.name}</Row>}
            <Row label="Mesh ID" mono>{d.mesh.id}</Row>
          </>
        )}
        {d.node && <Row label="Node ID" mono>{d.node.id}</Row>}
        {d.pathNames.length > 0 && (
          <Row label="Location">
            <span title={d.pathNames.join(' › ')}>{d.pathNames.join(' › ')}</span>
          </Row>
        )}
        {d.kind === 'part' && d.ownerCount > 1 && <Row label="Instances">Used in {d.ownerCount} places</Row>}
        {d.kind === 'part' && d.ownerCount === 0 && <Row label="Location">Not in assembly tree</Row>}
      </Section>

      <Section title="Geometry">
        {d.kind === 'group' && (
          <>
            <Row label="Parts" mono>{formatCount(d.meshIds.length)}</Row>
            {d.node && <Row label="Sub-nodes" mono>{formatCount(d.node.childIds.length)}</Row>}
          </>
        )}
        <Row label="Triangles" mono>{formatCount(d.triangleCount)}</Row>
        <Row label="Vertices" mono>{formatCount(d.vertexCount)}</Row>
        {d.size && <Row label="Size" mono>{formatExtents(d.size, units)}</Row>}
        {d.kind === 'group' && d.meshIds.length > 0 && (
          <Row label="Visibility">
            {visible === 'visible'
              ? 'All shown'
              : `${formatCount(d.meshIds.filter((m) => hidden[m] !== 1).length)} of ${formatCount(d.meshIds.length)} shown`}
          </Row>
        )}
      </Section>

      {d.kind === 'part' && d.mesh && (
        <Section title="Appearance">
          <Row label="Colour">
            {d.mesh.color ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm border border-hud-line" style={{ background: rgbToHex(d.mesh.color) }} aria-hidden="true" />
                <span className="font-mono">{rgbToHex(d.mesh.color)}</span>
              </span>
            ) : (
              <span className="text-hud-muted">None in file (default shown)</span>
            )}
          </Row>
        </Section>
      )}

      {d.attributes && (
        <Section title="Source attributes">
          {Object.entries(d.attributes).map(([k, v]) => (
            <Row key={k} label={k}>{v}</Row>
          ))}
        </Section>
      )}
    </>
  );
}
