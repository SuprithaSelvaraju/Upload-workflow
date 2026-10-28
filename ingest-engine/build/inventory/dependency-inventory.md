# N0 dependency and licence inventory

Plan reference: `docs/architecture/geometry-viewer-refactoring-plan.md`, slice N0 and ACC-4.
Status: **PROPOSED**. This is an inventory of what the N0 build *actually uses*, not a legal opinion. Where a licence statement was
read, the file or package record it came from is named. Where it was not read in full, that is said. Nothing here has been reviewed by counsel (UQ-5).

**Scope.** The N0 build of OCCT 8.0.1 with the toolkits listed in `occt-engine-options.cmake`, plus the smoke program, on the host described in `../records/`.
No paid, proprietary or OCCT3D commercial component is used: none is fetched, linked or referenced by the build files (checked by reading `build-occt.sh`, `occt-engine-options.cmake`, `Dockerfile`, `smoke/CMakeLists.txt`).

## A. Components linked into or shipped with the engine libraries

| # | Component | Exact version (source) | Role in N0 | Licence as stated (where read) | Paid/proprietary? | Open points |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | Open CASCADE Technology | 8.0.1, git tag `V8_0_1`, commit `b8f597c677811d1f9f4d8a97f5ae2825c0353a42` (`git rev-parse HEAD` in `records/run*/build-record.txt`) | Native geometry kernel and data-exchange readers (41 toolkits built, `records/run1/built-toolkits.txt`) | GNU LGPL 2.1 (`LICENSE_LGPL_21.txt`, sha256 `e237fa56668030e928551ddd60f05df5fe957f75eab874bbd017e085ed722e7c`) **with** the "Open CASCADE exception (version 1.0)" (`OCCT_LGPL_EXCEPTION.txt`, sha256 `04580a884ea6cea294402649ff7b5cbb167d47462d1340a4ed33e550db10a81b`). Both files are present in the tagged source. | No (open-source distribution). A commercial licence is also offered by the vendor [plan C.1]; not used. | Obligations for a *hosted* engine, shared versus static linking, and the exception's notice condition are for counsel (UQ-5). Not concluded here. |
| A2 | RapidJSON | v1.1.0, commit `f54b0e47a08782a6131cc3d60f94d038fa6e0a51` (verified by `build-occt.sh`) | Header-only JSON library; required by OCCT's glTF reader/writer (`HAVE_RAPIDJSON` is defined in the glTF compile rules, checked in `build.ninja` of run 1: 5,162 occurrences) | MIT for the source (`license.txt`, sha256 `a140e5d46fe734a1c78f1a3c3ef207871dd75648be71fdda8e309b23ab8b1f32`), "except for the third-party components listed" there: msinttypes (BSD) and a JSON-licence test directory. `build-occt.sh` copies **only `include/`**; `bin/jsonchecker` (the only JSON-licence code) is not copied. `include/rapidjson/msinttypes` (BSD, Windows compiler shims) **is** part of the copied headers. | No | v1.1.0 dates from 2016 and produces `-Wclass-memaccess` warnings under GCC 13 (3 warnings in run 1, `records/run1/build.log`); a newer upstream commit exists but was not evaluated. Whether to pin a newer commit is open. Installed OCCT glTF headers include RapidJSON headers, so code compiling against them needs the RapidJSON include path. |

## B. System libraries linked by the built toolkits (runtime dependencies)

Only **`libTKService`** links non-C++-runtime libraries (`readelf -d` of each reader toolkit and of `libTKService.so`, run 1): `libX11`, `libfontconfig`, `libfreetype`. The reader toolkits (`TKDESTEP`, `TKDEIGES`, `TKDESTL`, `TKDEOBJ`, `TKDEGLTF`, `TKDECascade`, `TKRWMesh`) link only the C++ runtime (`libstdc++`, `libgcc_s`, `libm`, `libc`). The full transitive list from `ldd` on all built toolkits is in `records/run1/system-libs-linked.txt`.

Versions are those installed on the Ubuntu 24.04.5 host that ran the build (`dpkg-query`). Licence statements are the first matching lines of each package's `/usr/share/doc/<package>/copyright`; they are **not** a full licence review.

| # | Library (Debian package) | Version (host) | Why it is linked | Licence statement seen |
| --- | --- | --- | --- | --- |
| B1 | FreeType (`libfreetype6`) | 2.13.2+dfsg-1ubuntu0.1 | `TKService` (`USE_FREETYPE=ON`; configure log: "Found Freetype ... version 2.13.2") | Debian copyright lists FTL (FreeType Licence) and Expat among others; the file also names GPL-2+ for some parts. Which licence option applies to our use was not analysed. |
| B2 | Fontconfig (`libfontconfig1`) | 2.15.0-1.1ubuntu2 | `TKService` (Linux font lookup) | Permissive "permission to use, copy, modify, distribute, and sell" notice (Keith Packard) |
| B3 | Xlib (`libx11-6`) | 2:1.8.7-1build1 | `TKService` (`USE_XLIB` defaulted ON; configure log: "Xlib is used by OCCT") | MIT-style ("a slight variant of the common MIT license form") |
| B4 | libxcb (`libxcb1`) | 1.15-1ubuntu2 | via libX11 | MIT-style permission notice |
| B5 | libXau (`libxau6`), libXdmcp (`libxdmcp6`) | 1:1.0.9-1build6, 1:1.1.3-0ubuntu6 | via libxcb | Permissive MIT-X Consortium notices |
| B6 | libpng (`libpng16-16t64`) | 1.6.43-5ubuntu0.6 | via FreeType | libpng licence (Debian copyright also lists other licences for other files) |
| B7 | zlib (`zlib1g`) | 1:1.3.dfsg-3.1ubuntu2.2 | via FreeType/libpng | Zlib |
| B8 | bzip2 (`libbz2-1.0`) | 1.0.8-5.1ubuntu0.1 | via FreeType | BSD-variant |
| B9 | Brotli (`libbrotli1`: `libbrotlidec`, `libbrotlicommon`) | 1.1.0-2build2 | via FreeType | MIT |
| B10 | Expat (`libexpat1`) | 2.6.1-2ubuntu0.6 | via Fontconfig | MIT |
| B11 | libbsd (`libbsd0`), libmd (`libmd0`) | 0.12.1-1build1.1, 1.1.0-2build1.1 | via libXdmcp | Mixed BSD-family and others listed in the Debian copyright files (BSD-2/3-clause, ISC, public domain; libmd also lists Beerware) |
| B12 | GNU C++ runtime and C library (`libstdc++6`, `libgcc-s1`, `libc6`) | 14.2.0-4ubuntu2~24.04.1; 2.39-0ubuntu8.9 | Every toolkit | libstdc++/libgcc: GPL with the GCC Runtime Library Exception (per the Debian copyright text, which was only skimmed); glibc: LGPL 2.1 or later (text seen) |

**USE_XLIB=OFF result [O] (`records/variant-xlib-off/`, ADR section 9).** Building with `USE_XLIB=OFF` removes B3, B4, B5 and the libbsd/libmd entries of B11 from the linked set; B1, B2, B6 to B10 and B12 remain. The smoke checks pass headless in both builds. Which setting the engine uses is not decided; the table above describes the default (ON) build.

## C. Build-time tools (not part of the shipped engine)

| # | Tool | Version (host) | Licence statement seen |
| --- | --- | --- | --- |
| C1 | GCC / g++ | 13.3.0 (Ubuntu 13.3.0-6ubuntu2~24.04.1) | GPL with the GCC Runtime Library Exception for generated code's runtime libraries [standard; Debian copyright skimmed] |
| C2 | CMake | 3.28.3-1build7 | BSD-3-clause among others (Debian copyright) |
| C3 | Ninja | 1.11.1-2 | Apache-2.0 (Debian copyright) |
| C4 | Git | 2.43.0 | GPL-2 [standard; not re-read] |

## D. Considered and **not** used in N0

| Component | Why not | Where decided |
| --- | --- | --- |
| Draco (`USE_DRACO`) | Not required for the N0 link/run goal; decoding of Draco-compressed customer glTF is an N1 question. Option left OFF. The OCCT glTF parser names `KHR_draco_mesh_compression` [plan B.6.2]. | `occt-engine-options.cmake`; ADR |
| Intel oneTBB (`USE_TBB`) | Parallel meshing is an N2 question; its licence was not read. | ADR |
| FreeImage, FFmpeg, OpenVR, Eigen, Tcl/Tk, OpenGL/GLES | Not needed by the toolkit set; `TKOpenGl` is not built. | `occt-engine-options.cmake` |
| OCCT3D commercial components, `occt-import-js`, `opencascade.js`, any WASM build | Excluded by the architectural criterion (ACC-1, ACC-4). | Plan section 0, C.2 |

## E. What this inventory does not cover

- The **container image**: the Dockerfile was not built (see the ADR), so the base image's own package set and licences are not inventoried.
- Licences of the OCCT test data and documentation under the tagged repository (not built, not shipped by N0).
- Any file inside OCCT's source tree carrying a different notice for the toolkits that were built: a keyword search (`apache license`, `BSD-3`, `permission is hereby granted`, `mozilla public`) over `src/` found notices only in `TKOpenGl`, which is not built. The search was limited to those phrases and to `.hxx/.cxx/.h/.c` files.
- Transitive licence obligations of the C++ runtime for the redistributed image.
