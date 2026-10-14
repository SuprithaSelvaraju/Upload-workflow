/** Offline checks for the model index, explorer rows and the workspace store. Run: npx tsx scripts/workspace.check.ts */
import assert from 'node:assert/strict';
import type { MeshData, PartNode, SceneModel } from '../src/domain/sceneModel';
import { buildModelIndex, sizeOf, unionBounds } from '../src/domain/modelIndex';
import { GROUP_KEY, buildRows, defaultExpanded, isRowSelected, meshDisplayName, nodeKey, revealKeys, selectedRowIndex } from '../src/state/explorerRows';
import { createModelWorkspace, targetMeshIds, visibilityOf } from '../src/state/modelWorkspace';
import { describeSelection } from '../src/state/selectionInfo';

function mesh(id: number, name: string, at = id): MeshData {
  const p = [at, 0, 0, at + 1, 0, 0, at, 2, 0, at, 0, 3]; // 4 vertices, spans 1 x 2 x 3
  return { id, name, positions: new Float32Array(p), normals: new Float32Array(12), indices: new Uint32Array([0, 1, 2, 0, 2, 3]), color: id === 0 ? [1, 0.5, 0] : null };
}
const node = (id: number, name: string, meshIds: number[] = [], children: PartNode[] = [], attributes?: Record<string, string>): PartNode => ({ id, name, meshIds, children, attributes });

/*
 * Plant (0)
 *   Skid A (1)           meshes: [0 "body"]  -- a leaf part (one mesh, no children)
 *   Skid B (2)           children: Pump (3) [1,2]  <- two meshes: a node with mesh rows
 *                                  Unnamed (4) [3]  <- leaf part, nameless node
 *   Spare (5)            nothing at all
 * mesh 4 is referenced by no node; mesh 2 is also used by Skid A2 (instance)
 */
const model: SceneModel = {
  format: 'step', sourceName: 'plant.step', units: 'millimeter',
  bounds: { min: [0, 0, 0], max: [5, 2, 3] },
  root: node(0, 'Plant', [], [
    node(1, 'Skid A', [0]),
    node(2, 'Skid B', [], [node(3, 'Pump', [1, 2]), node(4, 'Unnamed', [3])]),
    node(5, 'Spare'),
    node(6, 'Skid A2', [2, 99, 2]), // instance of mesh 2; 99 is out of range; 2 repeated
  ]),
  meshes: [mesh(0, 'body'), mesh(1, 'impeller'), mesh(2, 'casing'), mesh(3, 'bolt'), mesh(4, 'orphan')],
  stats: { partCount: 5, triangleCount: 10, vertexCount: 20 }, warnings: [],
};
const index = buildModelIndex(model);

// ---- model index ----
assert.equal(index.rootId, 0);
assert.deepEqual(index.nodeOrder, [0, 1, 2, 3, 4, 5, 6], 'pre-order');
assert.deepEqual(index.node(2)!.childIds, [3, 4]);
assert.deepEqual(index.node(6)!.meshIds, [2], 'out-of-range and repeated mesh ids dropped');
assert.deepEqual(index.ownerNodes(2), [3, 6], 'instanced mesh has two owners');
assert.deepEqual(index.unassignedMeshIds, [4], 'unreferenced mesh reported, not attached anywhere');
assert.deepEqual(index.subtreeMeshIds(2), [1, 2, 3], 'subtree in tree order, each mesh once');
assert.deepEqual(index.subtreeMeshIds(0), [0, 1, 2, 3], 'root subtree excludes unassigned meshes');
assert.deepEqual(index.pathToNode(3), [0, 2, 3]);
assert.deepEqual(index.pathToNode(999), []);
assert.equal(index.meshes[1].triangleCount, 2); assert.equal(index.meshes[1].vertexCount, 4);
assert.deepEqual(sizeOf(index.meshes[0].bounds), [1, 2, 3]);
assert.deepEqual(unionBounds(index, [0, 3])!.max, [4, 2, 3]);
assert.equal(unionBounds(index, []), null);
assert.equal(index.node(1)!.attributes, null, 'no invented attributes');
const withAttrs = buildModelIndex({ ...model, root: node(0, 'R', [0], [], { Material: 'SS316' }) });
assert.deepEqual(withAttrs.node(0)!.attributes, { Material: 'SS316' });
const dup = buildModelIndex({ ...model, root: node(0, 'R', [], [node(1, 'a', [0]), node(1, 'b', [1])]) });
assert.equal(new Set(dup.nodeOrder).size, 3, 'duplicate node ids are re-issued, never merged');

// ---- rows ----
let rows = buildRows(index, defaultExpanded(index));
assert.deepEqual(rows.map((r) => r.name), ['Plant', 'Skid A', 'Skid B', 'Spare', 'Skid A2', 'Not in assembly tree'].map((n) => n === 'Skid A2' ? 'casing' : n), 'default: root open, one level');
assert.equal(rows[1].kind, 'part'); assert.equal(rows[1].meshId, 0);
assert.equal(rows[2].kind, 'node'); assert.equal(rows[2].expandable, true);
assert.equal(rows[3].expandable, false, 'empty group has nothing to expand');
assert.equal(rows.at(-1)!.kind, 'group');
rows = buildRows(index, new Set([nodeKey(0), nodeKey(2), nodeKey(3), GROUP_KEY]));
assert.deepEqual(rows.map((r) => `${r.depth}:${r.kind}:${r.name}`), [
  '0:node:Plant', '1:part:Skid A', '1:node:Skid B', '2:node:Pump', '3:mesh:impeller', '3:mesh:casing', '2:part:bolt',
  '1:node:Spare', '1:part:casing', '0:group:Not in assembly tree', '1:mesh:orphan',
]);
assert.equal(meshDisplayName(index, 3), 'bolt', 'nameless leaf node falls back to the mesh name');
assert.equal(meshDisplayName(index, 0), 'Skid A', 'leaf part is named after its node');
assert.equal(meshDisplayName(index, 1), 'impeller', 'mesh under a multi-mesh node keeps its own name');
assert.ok(new Set(rows.map((r) => r.key)).size === rows.length, 'row keys are unique');
assert.deepEqual(rows.find((r) => r.name === 'Skid B')!.meshIds, [1, 2, 3], 'group row acts on its whole subtree');

// reveal + selection <-> row mapping
assert.deepEqual(revealKeys(index, { kind: 'mesh', meshId: 1 }), [nodeKey(0), nodeKey(2), nodeKey(3)]);
assert.deepEqual(revealKeys(index, { kind: 'mesh', meshId: 4 }), [GROUP_KEY]);
assert.deepEqual(revealKeys(index, { kind: 'node', nodeId: 3 }), [nodeKey(0), nodeKey(2)]);
assert.deepEqual(revealKeys(index, null), []);
const collapsed = buildRows(index, defaultExpanded(index));
assert.equal(selectedRowIndex(collapsed, { kind: 'mesh', meshId: 1 }), -1, 'collapsed: selected row not present until revealed');
const open = buildRows(index, new Set(revealKeys(index, { kind: 'mesh', meshId: 1 })));
assert.equal(open[selectedRowIndex(open, { kind: 'mesh', meshId: 1 })].name, 'impeller');
assert.ok(isRowSelected(open.find((r) => r.name === 'Pump')!, { kind: 'node', nodeId: 3 }));
assert.ok(!isRowSelected(open.find((r) => r.name === 'Pump')!, { kind: 'mesh', meshId: 1 }), 'a group row is not selected by one of its meshes');

// ---- workspace store ----
const ws = createModelWorkspace();
let notified = 0; ws.subscribe(() => notified++);
assert.equal(ws.getSnapshot().index, null);
assert.equal(ws.selectMesh(0), false, 'nothing to select before a model is loaded');
ws.load(index);
const s0 = ws.getSnapshot();
assert.equal(s0.hidden.length, 5); assert.equal(s0.hiddenCount, 0); assert.equal(s0.selection, null);
assert.equal(ws.getSnapshot(), s0, 'snapshot identity is stable between changes');

assert.equal(ws.selectMesh(1), true);
assert.deepEqual(ws.getSnapshot().highlightedMeshIds, [1]);
assert.equal(ws.selectMesh(1), true); // no-op
const n1 = notified; ws.selectMesh(1); assert.equal(notified, n1, 'same selection does not notify');
assert.equal(ws.selectMesh(99), false); assert.equal(ws.selectMesh(-1), false); assert.equal(ws.selectMesh(1.5), false);
assert.deepEqual(ws.getSnapshot().selection, { kind: 'mesh', meshId: 1 }, 'refused selects change nothing');
ws.selectMesh(null); assert.equal(ws.getSnapshot().selection, null, 'empty click clears');

// node selection highlights the subtree
assert.equal(ws.selectNode(2), true);
assert.deepEqual(ws.getSnapshot().highlightedMeshIds, [1, 2, 3]);
assert.equal(ws.selectNode(999), false);
assert.equal(ws.selectNode(5), true, 'an empty group can be selected (inspector shows it)'); assert.deepEqual(ws.getSnapshot().highlightedMeshIds, []);

// hiding
ws.selectMesh(1);
ws.toggleMesh(1);
assert.equal(ws.getSnapshot().selection, null, 'hiding the selected part clears the selection');
assert.equal(ws.getSnapshot().hidden[1], 1); assert.equal(ws.getSnapshot().hiddenCount, 1);
assert.equal(ws.selectMesh(1), false, 'a hidden part cannot be selected');
ws.selectNode(2);
assert.deepEqual(ws.getSnapshot().highlightedMeshIds, [2, 3], 'partially hidden group: only visible meshes highlight');
ws.toggleMesh(2); ws.toggleMesh(3);
assert.equal(ws.getSnapshot().selection, null, 'hiding the last visible mesh of a selected group clears it');
assert.equal(ws.selectNode(2), false, 'a fully hidden group cannot be selected');
assert.equal(visibilityOf(ws.getSnapshot().hidden, index.subtreeMeshIds(2)), 'hidden');
ws.toggleNode(2); // all hidden -> show all
assert.equal(visibilityOf(ws.getSnapshot().hidden, index.subtreeMeshIds(2)), 'visible');
ws.toggleMesh(2);
assert.equal(visibilityOf(ws.getSnapshot().hidden, index.subtreeMeshIds(2)), 'mixed');
ws.toggleNode(2); // mixed -> hide all
assert.equal(visibilityOf(ws.getSnapshot().hidden, index.subtreeMeshIds(2)), 'hidden', 'toggling a mixed group hides it');
ws.toggleNode(5); // empty group: nothing to toggle
ws.showAll(); assert.equal(ws.getSnapshot().hiddenCount, 0);
const prevHidden = ws.getSnapshot().hidden; ws.toggleMesh(0);
assert.notEqual(ws.getSnapshot().hidden, prevHidden, 'hidden mask is replaced, not mutated'); assert.equal(prevHidden[0], 0);
ws.showAll();

// toggleMeshes (unassigned group)
ws.toggleMeshes(index.unassignedMeshIds); assert.equal(ws.getSnapshot().hidden[4], 1); ws.toggleMeshes(index.unassignedMeshIds); assert.equal(ws.getSnapshot().hidden[4], 0);

// isolate / restore
ws.toggleMesh(4); // user already hid the orphan
ws.selectMesh(0);
ws.isolate({ kind: 'node', nodeId: 3 });
assert.deepEqual([...ws.getSnapshot().hidden], [1, 0, 0, 1, 1], 'only the isolated subtree is visible');
assert.equal(ws.getSnapshot().isolated, true);
assert.equal(ws.getSnapshot().selection, null, 'selection outside the isolated set is cleared');
ws.isolate({ kind: 'mesh', meshId: 3 });
assert.deepEqual([...ws.getSnapshot().hidden], [1, 1, 1, 0, 1], 're-isolating switches the target');
ws.restoreIsolation();
assert.deepEqual([...ws.getSnapshot().hidden], [0, 0, 0, 0, 1], 'restore returns the real previous state (orphan still hidden), not "all visible"');
assert.equal(ws.getSnapshot().isolated, false);
ws.restoreIsolation(); // no-op when nothing stored
ws.isolate({ kind: 'node', nodeId: 5 }); assert.equal(ws.getSnapshot().isolated, false, 'isolating an empty group does nothing');
ws.isolate({ kind: 'mesh', meshId: 77 }); assert.equal(ws.getSnapshot().isolated, false);
ws.selectMesh(3); ws.isolate({ kind: 'mesh', meshId: 3 });
assert.deepEqual(ws.getSnapshot().highlightedMeshIds, [3], 'selected isolated part stays selected');
ws.showAll(); assert.equal(ws.getSnapshot().isolated, false); assert.equal(ws.getSnapshot().hiddenCount, 0);

// loading another model resets everything
ws.selectNode(2); ws.toggleMesh(0); ws.isolate({ kind: 'mesh', meshId: 1 });
const other = buildModelIndex({ ...model, meshes: model.meshes.slice(0, 3), root: node(0, 'Other', [0, 1, 2]) });
ws.load(other);
const s1 = ws.getSnapshot();
assert.equal(s1.selection, null); assert.equal(s1.hiddenCount, 0); assert.equal(s1.isolated, false); assert.equal(s1.hidden.length, 3); assert.equal(s1.index, other);
ws.selectMesh(2); ws.clear();
assert.equal(ws.getSnapshot().index, null); assert.equal(ws.getSnapshot().selection, null); assert.equal(ws.getSnapshot().hidden.length, 0);

// listener isolation
const ws2 = createModelWorkspace(); let got = 0;
const origError = console.error; console.error = () => {};
ws2.subscribe(() => { throw new Error('boom'); }); ws2.subscribe(() => got++);
ws2.load(index);
assert.equal(got, 1, 'a throwing listener does not stop the others');
const off = ws2.subscribe(() => got++); off(); ws2.selectMesh(0); assert.equal(got, 2, 'unsubscribe works');

// ---- selection description ----
ws2.selectMesh(1);
const d = describeSelection(index, { kind: 'mesh', meshId: 1 }, ws2.getSnapshot().hidden)!;
assert.equal(d.title, 'impeller'); assert.deepEqual(d.pathNames, ['Plant', 'Skid B', 'Pump']); assert.equal(d.triangleCount, 2); assert.deepEqual(d.size, [1, 2, 3]); assert.equal(d.ownerCount, 1);
const inst = describeSelection(index, { kind: 'mesh', meshId: 2 }, new Uint8Array(5))!; assert.equal(inst.ownerCount, 2, 'instanced part reports it');
const g = describeSelection(index, { kind: 'node', nodeId: 2 }, new Uint8Array([0, 1, 0, 0, 0]))!;
assert.equal(g.kind, 'group'); assert.equal(g.meshIds.length, 3); assert.equal(g.triangleCount, 6); assert.equal(g.visibility, 'mixed'); assert.equal(g.node!.childIds.length, 2);
assert.equal(describeSelection(index, { kind: 'node', nodeId: 5 }, new Uint8Array(5))!.size, null, 'empty group has no size');
assert.equal(describeSelection(index, { kind: 'mesh', meshId: 50 }, new Uint8Array(5)), null);
assert.deepEqual(targetMeshIds(index, { kind: 'node', nodeId: 3 }), [1, 2]);

console.error = origError;
console.log('workspace: all checks passed');
