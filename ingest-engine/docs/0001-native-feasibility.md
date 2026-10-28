# ADR 0001: Native OCCT build and deployment feasibility (slice N0)

Status: **PROPOSED**. Evidence for review by the CEO and platform owner. Not approved. Not legal advice.
Plan reference: `docs/architecture/geometry-viewer-refactoring-plan.md`, slice N0 (and C.3, ACC-2/3/4/7).
Evidence tags as in the plan: [O] observed in a recorded run, [D] documented by the vendor, [U] unknown.

## 1. Question

Can open-source OCCT 8.0.1 be built reproducibly, with the readers and tessellation toolkits the engine needs, and run headless in a container? This slice makes no statement about correctness, speed or asset output (N1, N2).

## 2. What was done

Files (all under `ingest-engine/build/`): `occt-engine-options.cmake` (initial CMake cache), `build-occt.sh` (the single build entry point), `Dockerfile` (wraps the same script), `smoke/` (link and run check), `inventory/dependency-inventory.md`, `records/run1/`, `records/run2/` (raw logs).

Exact commands: `ingest-engine/build/build-occt.sh <label>` with `WORK=<dir> JOBS=2`. It fetches the pins, configures with `cmake -G Ninja -C occt-engine-options.cmake -D CMAKE_INSTALL_PREFIX=... -D 3RDPARTY_RAPIDJSON_INCLUDE_DIR=...`, runs `ninja -j JOBS`, installs, then builds and runs the smoke program with `DISPLAY` and `WAYLAND_DISPLAY` unset. The exact configure lines are in `records/<label>/build-record.txt` and `configure.log`.

## 3. Results

**Run 1 (host, Ubuntu 24.04.5, 2 CPUs, 8 GiB; 2026-10-19)** [O] `records/run1/`

| Check | Result |
| --- | --- |
| Pin `V8_0_1` resolves to `b8f597c677811d1f9f4d8a97f5ae2825c0353a42` | Verified by the script (exit 10 on mismatch) |
| RapidJSON pinned `v1.1.0` = `f54b0e47a08782a6131cc3d60f94d038fa6e0a51` | Verified by the script |
| Build | 0 errors, 3 warnings (GCC 13 `-Warray-bounds` in OCCT; RapidJSON `memcpy` warnings), 2,694 s on 2 cores |
| Toolkits built | 41 (`built-toolkits.txt`), including TKDESTEP, TKDEIGES, TKDESTL, TKDEOBJ, TKDEGLTF, TKDECascade, TKRWMesh, TKMesh, TKService, TKV3d |
| Install size | 112 MB |
| Smoke program | Links; all checks pass with no display; exit code 0 (`smoke-output.txt`) |
| Non-C++-runtime libraries needed | X11 stack, fontconfig, FreeType and their dependencies, all via `TKService` (`system-libs-linked.txt`) |

**Run 2 (fresh clone, same script and options):** see section 6 for the outcome. It was interrupted once when the session was reset (killed at 844 of 5,244 build steps, no error text), deleted, and restarted from an empty work directory.

**What the smoke program proves and does not prove.** It links the STEP, IGES, BREP, binary BREP, STL, OBJ and glTF reader entry points, calls each on a *missing file* and checks that each fails cleanly, and writes and re-reads a BREP box. It does **not** parse a real STEP, IGES, STL, OBJ or glTF file. That is N1. "Links and runs headless" is shown; "reads each format correctly" is not.

## 4. Decisions recorded (build options)

| Item | Decision for N0 | Basis |
| --- | --- | --- |
| C++ standard, build type | C++17, Release | Plan; [D] OCCT 8 requires C++17 |
| Linking | Shared libraries | Simplest for the build; the licence consequence of shared versus static is for counsel (Q1) |
| Modules | Only the listed toolkits, with dependencies resolved by CMake | Smaller build; 41 toolkits [O] |
| Visualization toolkits | TKService and TKV3d are built because TKRWMesh, TKDEOBJ and TKDEGLTF depend on them [O] (earlier source inspection, listed in the plan). `TKOpenGl` is **not** built; no display used | Dependency fact, not a choice |
| RapidJSON | ON, v1.1.0, headers only | glTF reader is compiled only with it [O] |
| FreeType | ON | A dependency of TKService [O] |
| Draco | OFF | Decoding compressed glTF is an N1 question |
| TBB | OFF | Parallel meshing is an N2 question |
| FreeImage, FFmpeg, OpenVR, Eigen, Tk, OpenGL/GLES | OFF | Not needed |
| Xlib | Default build keeps it ON (runs 1 and 2). `USE_XLIB=OFF` was built and tested (section 9) and works for this toolkit set | **Open decision:** which setting the engine image uses is not yet made; evidence is in section 9 |

## 5. Blockers and unknowns (recorded, not worked around)

| ID | Item | Status |
| --- | --- | --- |
| B1 | **Container build not executed (re-attempted 2026-10-20, same result).** `docker pull ubuntu:24.04` failed with "Forbidden" (registry-1.docker.io). On retry, the session's egress proxy answered `403` to `CONNECT` for registry-1.docker.io, ghcr.io, public.ecr.aws, quay.io, mcr.microsoft.com and archive.ubuntu.com (`recentRelayFailures`, kind `connect_rejected`: "policy denial or upstream failure"). This is a network policy of this session, not something the build files can fix; the proxy documentation says not to route around it. The Dockerfile has therefore never been built; its base-image digest is unresolved. The identical script was run directly on an Ubuntu 24.04.5 host instead. | **Open. Decision needed from the project owner:** either allow registry access (at minimum registry-1.docker.io and the Ubuntu package mirror) for this session, or run `docker build` from `ingest-engine/build/` on a machine that has it and return the log. Until then the "containerised" and "base image pinned" criteria are **not met**. |
| B2 | **Target deployment environment unknown (UQ-22):** OS image, CPU/memory limits, cloud, architecture (x86_64 only was tested). No assumption made. | **Open.** Owner: platform owner / CEO. |
| B3 | **Licence review not done (UQ-5).** Inventory lists licences as stated; nothing reviewed by counsel. | **Open.** Counsel. |
| B4 | **X11 runtime dependency.** Investigated: see section 9. `USE_XLIB=OFF` removes X11 and 5 further libraries; fontconfig and FreeType remain. | **Investigated; choice of setting open.** |
| B5 | **RapidJSON 1.1.0 is from 2016.** A newer upstream commit exists; not evaluated. | **Open**, low priority. |
| B6 | **Real-file reading, units, structure and tessellation** are untested. | Out of scope; N1/N2. |
| B7 | **Build time** ~45 min on 2 cores; no cache strategy (ccache, prebuilt layer) tried. | Noted. |

## 6. Questions for counsel (UQ-5)

1. OCCT is LGPL 2.1 with the Open CASCADE exception 1.0. For a **hosted** service (no binary distributed to customers), which obligations apply? Does shared versus static linking change them?
2. If a container image containing OCCT libraries is shipped to a platform operator (Intellobloom or a cloud registry), is that a distribution, and what notices and source offers are required?
3. Does the exception's notice condition apply to the engine executable?
4. FreeType: which licence option (FTL or GPL-2) do we rely on?
5. RapidJSON: confirm that the headers we install (MIT plus BSD msinttypes) need only notice retention.
6. Base image and system packages (glibc LGPL, libstdc++ GPL with runtime exception): obligations when redistributing an image.
7. Is a commercial OCCT licence required or advisable for the product's use, and is that a decision for the CEO?

## 7. Acceptance criteria evaluation

| Criterion (plan, N0) | Result | Evidence |
| --- | --- | --- |
| Clean build of the pinned tag completes **twice** with the same toolkit list | **Met on the host** (not in a container, B1); see the addendum | `records/run1`, `records/run2` |
| Trivial program links all six reader paths and runs headless **in the container** | **Partly met.** Links and runs headless on the host (run 1). Not run in a container (B1). The program also covers a seventh path (binary BREP). | `records/run1/smoke-output.txt` |
| Inventory lists every linked dependency with version and licence | **Met for the host build**, licence statements as read; not for the container image | `inventory/dependency-inventory.md` |
| Every C.3 item N0 can settle is marked settled with the run that settled it | Settled: pin and commit, toolkit list, RapidJSON requirement, Draco/TBB/FreeType choices, shared build, headless link. Not settled: container execution (B1), deployment environment (B2), licence (B3). | This record |
| Failures recorded with exact error text | **Met** for the build (no errors; warnings in `build.log`); the registry error is recorded here (B1: "Forbidden") | `records/` |
| Build runs inside a container; base image pinned by digest | **Not met.** Registry returns 403 (B1); no digest obtained | Section 5, B1 |
| `USE_XLIB=OFF` impact recorded (closing item, not a plan criterion) | **Done** on the host: builds, same 41 toolkits, smoke passes, 6 libraries fewer | Section 9, `records/variant-xlib-off/` |
| Deployment environment and licensing review | **Unresolved, deliberately** (B2, B3) | Sections 5, 6 |
| Deliverables in the project checkout | Present on `feature/native-occt-engine`; commit and review required | Repository status |
| Compliance ACC-2/3/4/7 | ACC-2 and ACC-3: no non-OCCT parser, WASM, `occt-import-js`, or temporary pipeline in the files. ACC-4: no commercial component; inventory lists open-source components only. ACC-7: the existing viewer and application files are unchanged. These were checked by reading the N0 files, not by an automated audit. | Files listed above |

## 8. Decision

**Update:** N0 remains INCOMPLETE. Verify container-build evidence and base-image digest, and resolve the deployment-environment and licensing questions before closure.

**Proposed:** the native OCCT 8.0.1 build is feasible on Ubuntu 24.04 / x86_64 with GCC 13 [O]. The N0 gate for proceeding to N1 is **not yet fully satisfied**, because the container build (B1) and the deployment environment (B2) are unresolved. Whether N1 may start on the host build alone is a decision for the CEO; this record does not make it.

## Addendum: run 2

Run 2 (fresh clone, empty work directory, identical script and options; 2026-10-20, 2,977 s) [O] `records/run2/`: 0 errors, 3 warnings, 41 toolkits. `diff` of `built-toolkits.txt`, `system-libs-linked.txt` and `smoke-output.txt` between run 1 and run 2 shows no differences. Smoke exit code 0. Identical *toolkit lists* is what the criterion asks for; byte-identical binaries were not compared.
The "Pending" and "to be completed" wording above refers to the state before this run finished.

## 9. `USE_XLIB=OFF` investigation (run `variant-xlib-off`)

Command: `EXTRA_CMAKE_ARGS="-D USE_XLIB=OFF" WORK=<dir> JOBS=2 ingest-engine/build/build-occt.sh variant-xlib-off`. Everything else identical to run 1. Record: `records/variant-xlib-off/`. [O]

| Observation | Result |
| --- | --- |
| Configure | Accepted; the line "Xlib is used by OCCT" no longer appears; `effective-options.txt` shows `USE_XLIB:BOOL=OFF` |
| Build | 0 errors, 3 warnings (same count as run 1), 41 toolkits, 2,968 s; toolkit list identical to run 1 |
| Smoke program | Same 8 checks pass, headless, exit 0 |
| Libraries no longer linked | `libX11`, `libxcb`, `libXau`, `libXdmcp`, `libbsd`, `libmd` (`diff` of `system-libs-linked.txt`) |
| Libraries still linked | `libfontconfig`, `libfreetype`, `libpng16`, `libz`, `libbz2`, `libbrotlicommon/dec`, `libexpat` plus the C/C++ runtime |
| Not tested | Any behaviour that needs X (none is expected for a headless engine, but only the smoke checks were run); real-file reads; whether a runtime image with the reduced package set starts (no container) |

Consequence: with `USE_XLIB=OFF`, B3, B4 and B5 and the bsd/md entries of B11 in the inventory drop out of the runtime dependency set for this build. This is evidence for the choice, not the choice. The record of runs 1 and 2 was produced before `EXTRA_CMAKE_ARGS` was added to `build-occt.sh`; with the variable unset the script's commands are unchanged.

## 10. Where these files are

Not in a git checkout. No repository was attached to this session and no GitHub account is linked. The files are in an unpacked copy of the uploaded POC zip in the session scratchpad (`.../scratchpad/repo/`, no `.git`), with copies in `/mnt/user-data/outputs/`. Both are temporary session storage. Intended project checkout: **unconfirmed** (decision needed: owner/repo and branch). Until the files are copied into that checkout and committed, N0 deliverables are not in the project.

