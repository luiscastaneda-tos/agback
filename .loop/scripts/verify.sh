#!/usr/bin/env bash
# Deterministic, token-free verification for the Noktos Agent Backend loop.
#
# Runs only cheap local checks that cost no model tokens:
#   npm run build --if-present
#   .loop/scripts/check-layering.sh   (G3, FULL TREE)
#
# The layering check runs over the whole tree, not just the diff, so that a
# violation introduced before the rule existed cannot stay invisible forever.
#
# No test suite is executed: that is an explicit V1 cost decision (D-004).
#
# Exit codes: 0 = all available checks passed, 1 = at least one failed.

set -u

RUN_DIR=""
LOG_PATH=""

while [ $# -gt 0 ]; do
  case "$1" in
    --run-dir) RUN_DIR="${2:-}"; shift 2 ;;
    --run-dir=*) RUN_DIR="${1#*=}"; shift ;;
    -h|--help) echo "Usage: verify.sh [--run-dir <dir>]"; exit 0 ;;
    *) echo "[verify] Unknown argument: $1" >&2; exit 2 ;;
  esac
done

add_line() {
  echo "[verify] $1"
  if [ -n "$LOG_PATH" ]; then echo "[verify] $1" >> "$LOG_PATH"; fi
}

root="$(git rev-parse --show-toplevel 2>/dev/null)"
if [ -z "$root" ]; then
  echo "[verify] Run inside a Git repository." >&2
  exit 1
fi
cd "$root" || exit 1

if [ -n "$RUN_DIR" ]; then
  mkdir -p "$RUN_DIR" || exit 1
  LOG_PATH="$RUN_DIR/verification.txt"
  echo "Noktos Agent Backend deterministic verification" > "$LOG_PATH"
fi

# Returns the exit status of the COMMAND rather than of tee. Piping through tee
# would otherwise mask a failing build and let it reach the reviewer marked green.
run_logged() {
  local rc
  if [ -n "$LOG_PATH" ]; then
    "$@" 2>&1 | tee -a "$LOG_PATH"
    rc=${PIPESTATUS[0]}
  else
    "$@" 2>&1
    rc=$?
  fi
  return "$rc"
}

failed=0

if [ -f "package.json" ]; then
  add_line "Running npm run build --if-present (no tests)."
  if run_logged npm run build --if-present; then
    add_line "Build check passed."
  else
    failed=1
    add_line "BUILD FAILED"
  fi
else
  add_line "package.json not present yet; build check skipped."
fi

add_line "Running G3 layering check over the full tree."
if run_logged bash "$root/.loop/scripts/check-layering.sh"; then
  add_line "Layering check passed."
else
  failed=1
  add_line "LAYERING CHECK FAILED"
fi

if [ "$failed" -ne 0 ]; then
  exit 1
fi
exit 0
