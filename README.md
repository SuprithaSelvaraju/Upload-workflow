# AgniKawach STEP viewer POC (Slice 1)

Upload STEP → validate → Web Worker → occt-import-js → `SceneModel` → vtk.js → interactive 3D view.
Standalone: no backend, no connection to the main platform.

## Run

```bash
npm install        # dependencies are "latest"; commit the generated lockfile
npm run typecheck  # FIRST: validates every vtk.js / occt-import-js call against the installed typings
npm run dev
```

Open the printed URL, drop a `.step` / `.stp` file.

## First-run checklist (this code has not been run yet)

It was written without network access, so the library calls were checked against
documentation only. Do these in order:

1. `npm run typecheck` is clean. Any error here is a wrong vtk.js method name or signature. Fix those first.
2. `npm run dev` starts, and the page shows the drop card on a dark canvas with no console errors.
3. Open a small STEP file. In DevTools → Network, `occt-import-js.wasm` loads with status 200 and type `application/wasm`.
4. The model appears. Drag to rotate, Shift+drag to pan, scroll to zoom, then "Reset view".
5. While a large file processes, the Cancel button and the page stay responsive.
6. Drop a `.txt` or a renamed non-STEP file: the error card appears and no model is lost.
7. Hot reload twice (StrictMode + HMR): exactly one canvas in the DOM, no WebGL context warnings.

## Layout

```
src/domain/       SceneModel contract (the only thing importers and viewer share)
src/importers/    format registry, validation, STEP importer + OCCT worker. Never imports vtk.js.
src/viewer/       vtk.js engine and React wrapper. Never imports OCCT.
src/features/     loader state, drop/loading/error cards, status bar, viewer controls
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
