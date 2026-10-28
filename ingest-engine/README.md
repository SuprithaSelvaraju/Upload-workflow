# N0: Native OCCT Build and Deployment Feasibility

**Status: N0 remains INCOMPLETE.** This directory contains native OCCT build scripts, smoke-test harnesses, dependency inventory, and recorded build evidence. Recorded evidence must be checked against the acceptance criteria before N0 can be closed.

**Plan reference:** `docs/architecture/geometry-viewer-refactoring-plan.md`, slice N0.

**Pinned version:** OCCT 8.0.1 (`V8_0_1`, commit `b8f597c677811d1f9f4d8a97f5ae2825c0353a42`).

## 1. Files and Purpose

| Path | Purpose |
|---|---|
| `build/build-occt.sh` | Fetches and verifies pinned OCCT and RapidJSON commits, configures, builds, installs, and runs the headless smoke test. |
| `build/occt-engine-options.cmake` | CMake options for the selected toolkit set and build configuration. |
| `build/Dockerfile` | Container build wrapper. Verify the base-image digest and the evidence under `build/records/docker-build/`. |
| `build/smoke/` | Link and failure-handling checks, including missing-file reader calls and a BREP box round trip. This does not prove successful parsing of real CAD files. |
| `build/real-file-test/` | Separate harness for testing actual CAD files. Build and run it against representative inputs before claiming real-file support. |
| `build/inventory/dependency-inventory.md` | Dependency and licence inventory; not a legal review. |
| `build/records/run1/`, `run2/` | Recorded host-build evidence. |
| `build/records/variant-xlib-off/` | Recorded host-build evidence with `USE_XLIB=OFF`. |
| `build/records/docker-build/` | Recorded container-build evidence; verify its contents and test results before relying on it. |
| `docs/0001-native-feasibility.md` | Proposed feasibility decision record and acceptance criteria. |

Large generated `build.log` and `install.log` files are excluded from Git. Other build records are retained as evidence.

## 2. Recorded Host Results

Environment recorded: Ubuntu 24.04.5, GCC 13.3, CMake 3.28.3, Ninja 1.11.1, 2 CPUs.

- `run1` and `run2`: recorded as completing with zero errors and three warnings, with 41 toolkits and passing headless smoke checks.
- `variant-xlib-off`: recorded as completing with zero errors and three warnings, with the same toolkit list and passing headless smoke checks.
- The `USE_XLIB=OFF` records show fewer linked X11-related libraries; Fontconfig and FreeType remain.

These are recorded host results, not proof of production readiness or successful real-file parsing.

## 3. Outstanding Acceptance Criteria

| Item | Status |
|---|---|
| Container build and smoke test | Container records exist. Verify the build record, exit status, and smoke output; rerun if evidence is incomplete. |
| Base image pinned by digest | Verify the Dockerfile and pin an immutable digest if absent. |
| Real-file reading | Build and run `build/real-file-test/` against representative files; retain test outputs. |
| Deployment environment (UQ-22) | Confirm OS image, CPU/memory limits, cloud and target architecture with the platform owner. |
| Licensing review (UQ-5) | Outstanding; obtain the required review. |
| `USE_XLIB` selection | Both settings have host evidence; final deployment choice remains open. |
| Units and tessellation | Outside N0; address in the applicable N1/N2 scope. |

## 4. Next Steps

1. Reconcile the container records with the ADR acceptance criteria.
2. Verify or pin the Docker base-image digest and validate the container smoke test.
3. Run the real-file harness and record reproducible results.
4. Confirm deployment requirements and the `USE_XLIB` setting with the platform owner.
5. Complete the licensing review and update the decision record when supported by evidence.

**Do not mark N0 complete based solely on successful host builds or the existence of records.**
