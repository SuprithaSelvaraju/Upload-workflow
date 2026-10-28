#!/usr/bin/env bash
# N0 build procedure for open-source OCCT 8.0.1 (native engine). Used unchanged by the Dockerfile and by a host build.
# Usage: ./build-occt.sh [run-label]
# Environment overrides: WORK (default ./_work), JOBS (default nproc), RECORDS (default ./records/<label>)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
LABEL="${1:-run-$(date -u +%Y%m%dT%H%M%SZ)}"
WORK="${WORK:-$HERE/_work}"
JOBS="${JOBS:-$(nproc)}"
RECORDS="${RECORDS:-$HERE/records/$LABEL}"
PREFIX="$WORK/install"

# ---- Pins (all verified by `git rev-parse HEAD` below, not assumed) ----------
OCCT_REPO="https://github.com/Open-Cascade-SAS/OCCT.git"
OCCT_TAG="V8_0_1"
OCCT_COMMIT="b8f597c677811d1f9f4d8a97f5ae2825c0353a42"
RJ_REPO="https://github.com/Tencent/rapidjson.git"
RJ_TAG="v1.1.0"
RJ_COMMIT="f54b0e47a08782a6131cc3d60f94d038fa6e0a51"

mkdir -p "$WORK" "$RECORDS"
rm -rf "$WORK/build" "$WORK/smoke-build" "$PREFIX"
exec > >(tee "$RECORDS/build-record.txt") 2>&1
now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
T0=$(date +%s)
echo "== N0 build record: $LABEL"; echo "start: $(now)"
echo "host: $(uname -srm); $(. /etc/os-release && echo "$PRETTY_NAME")"
echo "cpus: $(nproc); mem: $(free -m | awk '/Mem:/{print $2" MiB"}')"
echo "tools: $(cmake --version | head -1); $(g++ --version | head -1); $(ninja --version 2>/dev/null | sed 's/^/ninja /')"

fetch() { # repo tag expected dir
  local repo=$1 tag=$2 want=$3 dir=$4
  if [ ! -d "$dir/.git" ]; then git clone --depth 1 --branch "$tag" "$repo" "$dir"; fi
  local got; got="$(git -C "$dir" rev-parse HEAD)"
  echo "$dir: tag=$tag commit=$got"
  [ "$got" = "$want" ] || { echo "ERROR: commit mismatch for $tag (expected $want)"; exit 10; }
}
echo "== stage 1: fetch and verify pins"; S=$(date +%s)
fetch "$OCCT_REPO" "$OCCT_TAG" "$OCCT_COMMIT" "$WORK/OCCT"
fetch "$RJ_REPO" "$RJ_TAG" "$RJ_COMMIT" "$WORK/rapidjson-src"
# Only the header tree of RapidJSON is used. The repository's bin/jsonchecker test data (JSON-licence) is not copied.
rm -rf "$WORK/rapidjson" && mkdir -p "$WORK/rapidjson" && cp -r "$WORK/rapidjson-src/include" "$WORK/rapidjson/include" && cp "$WORK/rapidjson-src/license.txt" "$WORK/rapidjson/"
echo "stage 1 seconds: $(( $(date +%s) - S ))"

echo "== stage 2: configure (extra args: ${EXTRA_CMAKE_ARGS:-none})"; S=$(date +%s)
cmake -S "$WORK/OCCT" -B "$WORK/build" -G Ninja \
  -C "$HERE/occt-engine-options.cmake" \
  -D CMAKE_INSTALL_PREFIX="$PREFIX" \
  -D 3RDPARTY_RAPIDJSON_INCLUDE_DIR="$WORK/rapidjson/include" \
  ${EXTRA_CMAKE_ARGS:-} \
  2>&1 | tee "$RECORDS/configure.log" | tail -60
echo "stage 2 seconds: $(( $(date +%s) - S ))"
grep -E "^(BUILD_ADDITIONAL_TOOLKITS|USE_[A-Z0-9]+|BUILD_MODULE_[A-Za-z]+|BUILD_LIBRARY_TYPE|BUILD_CPP_STANDARD|CMAKE_BUILD_TYPE):" "$WORK/build/CMakeCache.txt" | sort > "$RECORDS/effective-options.txt"

echo "== stage 3: build ($JOBS jobs)"; S=$(date +%s)
cmake --build "$WORK/build" -j "$JOBS" > "$RECORDS/build.log" 2>&1 || { echo "BUILD FAILED"; tail -40 "$RECORDS/build.log"; exit 20; }
echo "stage 3 seconds: $(( $(date +%s) - S ))"
echo "warnings: $(grep -c 'warning:' "$RECORDS/build.log" || true)  errors: $(grep -c 'error:' "$RECORDS/build.log" || true)"

echo "== stage 4: install"; S=$(date +%s)
cmake --install "$WORK/build" > "$RECORDS/install.log" 2>&1 || { echo "INSTALL FAILED"; tail -20 "$RECORDS/install.log"; exit 30; }
echo "stage 4 seconds: $(( $(date +%s) - S ))"
ls "$PREFIX" ; du -sh "$PREFIX"
find "$PREFIX" -name 'libTK*.so.*' -type f ! -type l 2>/dev/null | sed 's#.*/##' | sort > "$RECORDS/built-toolkits.txt" || true
echo "built toolkits: $(wc -l < "$RECORDS/built-toolkits.txt")"

echo "== stage 5: link and run the headless check (no DISPLAY)"; S=$(date +%s)
cmake -S "$HERE/smoke" -B "$WORK/smoke-build" -G Ninja -D CMAKE_BUILD_TYPE=Release -D CMAKE_PREFIX_PATH="$PREFIX" 2>&1 | tail -5
cmake --build "$WORK/smoke-build" 2>&1 | tail -5
BIN="$WORK/smoke-build/reader_link_check"
echo "-- ldd (direct, filtered)"; ldd "$BIN" | sed 's#(0x.*##' | sort | tee "$RECORDS/ldd-smoke.txt" | grep -v -E "libTK" || true
set +e; env -u DISPLAY -u WAYLAND_DISPLAY LD_LIBRARY_PATH="$PREFIX/lib" "$BIN" 2>&1 | tee "$RECORDS/smoke-output.txt"; RC=${PIPESTATUS[0]}; set -e
echo "smoke exit code: $RC"
echo "stage 5 seconds: $(( $(date +%s) - S ))"
echo "-- toolkit shared-library dependencies on non-OCCT system libraries (all built toolkits)"
for f in "$PREFIX"/lib/libTK*.so; do ldd "$f"; done 2>/dev/null | sed 's#(0x.*##;s#^[[:space:]]*##' | grep -v -E "^libTK|linux-vdso|ld-linux" | sort -u | tee "$RECORDS/system-libs-linked.txt"
echo "end: $(now); total seconds: $(( $(date +%s) - T0 ))"
exit $RC
