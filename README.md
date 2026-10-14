# AgniKawach STEP viewer POC (Slice 1)

Upload STEP → validate → Web Worker → occt-import-js → `SceneModel` → vtk.js → interactive 3D view.
Standalone: no backend, no connection to the main platform.

## Run

```bash
npm install        # versions are pinned (^x.y.z) in package.json and locked in package-lock.json
npm run typecheck  # FIRST: validates every vtk.js / occt-import-js call against the installed typings
npm run dev
```

Open the printed URL and drop a supported CAD file (the drop card lists the supported types, taken from the importer registry).

`npm run verify` runs typecheck, the offline checks and a production build in one go. Use `npm ci` (not `npm install`) on a build machine so the lockfile is honoured exactly.

## Smoke checklist (after any change)

1. `npm run typecheck` is clean.
2. `npm run dev` starts, and the page shows the drop card on a dark canvas with no console errors.
3. Open a small STEP file. In DevTools → Network, `occt-import-js.wasm` loads with status 200 and type `application/wasm`.
4. The model appears. Drag to rotate, Shift+drag to pan, scroll to zoom, then Fit.
5. While a large file processes, the Cancel button and the page stay responsive.
6. Drop a `.txt` or a renamed non-STEP file: the error card appears and no model is lost.
7. Hot reload twice (StrictMode + HMR): exactly one canvas in the DOM, no WebGL context warnings.
8. `npm run build` then `npm run preview`: open a STEP file in the production build (the worker and wasm are bundled differently from dev).

## Layout

```
src/domain/       SceneModel contract (the only thing importers and viewer share) + ModelIndex (plain-data tree for the UI)
src/importers/    format registry, validation, STEP importer + OCCT worker. Never imports vtk.js.
src/viewer/       vtk.js engine and React wrapper. Never imports OCCT.
src/state/        framework-neutral logic: workspace store (selection / visibility), tree rows, inspector data
src/features/     React UI: loader, drop/loading/error cards, explorer, inspector, dock panels, status bar, HUD
src/theme/        reads the CSS tokens the 3D canvas needs
src/index.css     ALL colour and type tokens (Tailwind @theme)
src/config.ts     file-size limit, tessellation settings
```

## Known risks and fallbacks

- **Worker + WASM bundling.** `occt.worker.ts` imports `occt-import-js` through Vite and points
  Emscripten at the `.wasm` via `locateFile`. If the worker fails to start or the wasm 404s, the fallback is to copy
  `node_modules/occt-import-js/dist/occt-import-js.{js,wasm}` into `public/occt/` and load them with
  `importScripts` in a classic (non-module) worker.
- **Mesh colour range.** The occt-import-js README does not state whether colours are 0..1 or 0..255.
  The mapper accepts both. Confirm with a coloured STEP file.
- **Tokens.** Colours in `index.css` are approximations sampled from screenshots. Replace on integration.

## Slice 1.3: Model Explorer and synchronized selection

Data flow: `Importer -> SceneModel -> (buildModelIndex) -> workspace store <-> viewer / explorer / inspector`.

| Piece | File | Owns |
| --- | --- | --- |
| Model index | `src/domain/modelIndex.ts` | Plain-data tree, per-mesh facts, mesh<->node relations. Derived from `SceneModel`; invents nothing. |
| Workspace store | `src/state/modelWorkspace.ts` | The ONLY copy of selection (a mesh or a tree node), the hidden mask and isolation. Enforces the invariants. |
| Rows / naming | `src/state/explorerRows.ts`, `selectionInfo.ts` | Pure derivations for the tree and the inspector. |
| Viewer sync | `src/features/workspace/useWorkspace.ts` | Store -> viewer (hidden mask, highlight); viewer click -> `selectMesh`. |
| UI | `src/features/explorer`, `inspector`, `workspace` | React only: reads snapshots, calls store actions. |

Rules the store guarantees: a selected part is never hidden; hiding the last visible geometry of the selection clears it; hidden parts are skipped by the picker (not clickable, no pointer cursor); isolate remembers the real previous visibility and Restore returns to it; loading a model resets everything.

Hierarchy shown = `SceneModel.root` exactly. A `PartNode` with no children and one mesh is shown as one part row; meshes no node references appear under one labelled "Not in assembly tree" group. STEP gives no source attributes today, so none are shown.

Keyboard in the tree: arrows move, Right/Left expand/collapse, Enter or Space select, `H` hide/show, `I` isolate, Esc clear selection.

### Checks
    npm run check        # runs the four scripts below (downloads tsx on first use)
    npm run typecheck

or one at a time: `npx tsx scripts/orbit.check.ts`, `picking.check.ts`, `hardening.check.ts`, `workspace.check.ts`.

Scripts live in `scripts/`, never in `public/`: everything in `public/` is copied into the production build and served to users.

### Manual browser checklist (real 362-part STEP)
1. Click a row: that part highlights in 3D and the inspector fills in. Click a part in 3D: its tree row selects, scrolls into view and its ancestors expand. Click empty space: everything clears.
2. Click an assembly row: all its parts highlight; inspector shows the group totals.
3. Eye on a part hides it: selection clears, clicking where it was selects whatever is behind it, no pointer cursor over it. Eye on a group hides/shows all. Show all resets.
4. Isolate (row button, inspector or `I`) shows only that part/group; Restore returns the previous visibility (parts you had hidden before stay hidden).
5. Open another file: tree, inspector, highlight and hidden state all reset.
6. Orbit, pan, zoom, Fit, standard views and the hover cursor behave as before.
7. Collapse/reopen both panels; resize the window (panels start collapsed under 1024 px and open as overlays below 768 px).
8. Console stays clean.
