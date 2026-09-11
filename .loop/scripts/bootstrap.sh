#!/usr/bin/env bash
# Bootstrap/validate the Noktos agent engineering loop harness on macOS.
#
# Never installs anything. Reports what is missing and stops.
#
# Exit codes: 0 = ready, 1 = a hard requirement is missing or misconfigured.

set -u

INIT_REPO=0
CHECK_ONLY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --init-repo) INIT_REPO=1; shift ;;
    --check-only) CHECK_ONLY=1; shift ;;
    -h|--help)
      echo "Usage: bootstrap.sh [--init-repo] [--check-only]"
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=loop.config.sh
. "$SCRIPT_DIR/loop.config.sh"

die() { echo "[error] $*" >&2; exit 1; }

require_command() {
  local name="$1"
  local path
  path="$(command -v "$name" 2>/dev/null)" || die "Missing required command: $name"
  [ -n "$path" ] || die "Missing required command: $name"
  echo "[ok] $name -> $path"
}

# Hard requirements. Note that 'claude' is NOT one of them.
require_command "git"
require_command "codex"
require_command "node"
require_command "npm"
require_command "jq"

if [ ! -f ".loop/GOAL.md" ]; then
  die "Run bootstrap from the root where the .loop package was copied."
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if [ "$INIT_REPO" -ne 1 ]; then
    die "This folder is not a Git repo. Run again with --init-repo or initialize Git manually."
  fi
  echo "[init] Initializing Git repository..."
  if ! git init -b loop/noktos-auth; then
    git init || die "git init failed."
    git switch -c loop/noktos-auth || die "git switch -c loop/noktos-auth failed."
  fi
fi

root="$(git rev-parse --show-toplevel)" || die "Could not resolve repository root."
cd "$root" || die "Could not enter repository root."

for path in \
  ".loop/GOAL.md" \
  ".loop/ARCHITECTURE_DECISIONS.md" \
  ".loop/CONTRACTS.md" \
  ".loop/BACKLOG.yaml" \
  ".loop/STATE.json" \
  ".loop/scripts/loop.sh" \
  ".loop/scripts/verify.sh" \
  ".loop/scripts/loop.config.sh" \
  ".loop/scripts/check-layering.sh" \
  ".loop/scripts/provision-dependencies.sh"
do
  [ -f "$path" ] || die "Missing required loop file: $path"
  echo "[ok] $path"
done

for path in ".loop/scripts/loop.sh" ".loop/scripts/verify.sh" ".loop/scripts/plan-next.sh" ".loop/scripts/bootstrap.sh"; do
  if [ ! -x "$path" ]; then
    echo "[warn] $path is not executable. Run: chmod +x $path"
  fi
done

if [ "$CHECK_ONLY" -ne 1 ]; then
  exclude_path="$root/.git/info/exclude"
  mkdir -p "$(dirname "$exclude_path")"
  touch "$exclude_path"
  for entry in ".loop/runs/" ".loop/HUMAN_GATE.md"; do
    if ! grep -qxF "$entry" "$exclude_path" 2>/dev/null; then
      echo "$entry" >> "$exclude_path"
      echo "[ok] local git exclude added: $entry"
    fi
  done
fi

echo ""
echo "Providers:"
echo "  architect   -> $ARCHITECT_PROVIDER (read-only)"
echo "  implementer -> codex (workspace-write, not configurable)"
echo "  reviewer    -> mode=$REVIEWER_MODE CLAUDE_REVIEW_EVERY=$CLAUDE_REVIEW_EVERY (read-only)"
echo ""

echo "Codex version:"
"$CODEX_BIN" --version || die "Codex CLI is required and did not run."
echo ""

# Claude is optional. It is only needed if the configuration can actually
# select it as a reviewer. Missing binary is a warning, never a failure.
echo "Claude CLI:"
if command -v "$CLAUDE_BIN" >/dev/null 2>&1; then
  "$CLAUDE_BIN" --version || echo "[warn] '$CLAUDE_BIN' is present but did not report a version."
else
  echo "[warn] Claude CLI ('$CLAUDE_BIN') not found in PATH."
  if [ "$REVIEWER_MODE" = "claude" ] || { [ "$REVIEWER_MODE" = "rotate" ] && [ "$CLAUDE_REVIEW_EVERY" -ne 0 ]; }; then
    echo "[warn] Current config CAN select Claude as reviewer. The loop will stop with a"
    echo "[warn] HUMAN_GATE when that happens. Set CLAUDE_REVIEW_EVERY=0 or install the CLI"
    echo "[warn] yourself; this harness never installs anything automatically."
  else
    echo "[ok]   Current config never selects Claude, so this is not required."
  fi
fi
echo ""

echo "Node/npm:"
node --version
npm --version
echo ""
echo "Bash: ${BASH_VERSION}"
echo ""
echo "Bootstrap finished."
echo "Important: do NOT expose real credentials or real traveler PII to the autonomous loop."
