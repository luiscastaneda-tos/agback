#!/usr/bin/env bash
# Host-side dependency provisioning for the engineering loop.
#
# The Codex implementer sandbox has no network and cannot read the user npm
# cache. A task that legitimately needs a new package therefore stops with a
# HUMAN_GATE it can never clear by itself. This script formalises the recovery
# that was previously done by hand, WITHOUT granting the sandbox any network.
#
# Only the host runs npm install. Two independent authorisations are required
# before a package may be materialised:
#
#   1. the Architect listed it in the task packet's allowed_dependencies
#   2. the Implementer declared it in package.json
#
# Either one alone is insufficient: package.json comes from an implementer whose
# work has not been reviewed, so it cannot authorise itself.
#
# Exit codes:
#   0  provisioned; the caller may delete the gate and rerun the task
#   1  not a provisioning case, or refused; the caller keeps the gate
set -u

RUN_DIR=""
BASELINE_HEAD=""

while [ $# -gt 0 ]; do
  case "$1" in
    --run-dir) RUN_DIR="${2:-}"; shift 2 ;;
    --baseline-head) BASELINE_HEAD="${2:-}"; shift 2 ;;
    *) echo "[provision] Unknown argument: $1" >&2; exit 1 ;;
  esac
done

root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 1
cd "$root" || exit 1

RECEIPT=""
if [ -n "$RUN_DIR" ]; then
  mkdir -p "$RUN_DIR" || exit 1
  RECEIPT="$RUN_DIR/provisioning.txt"
  : > "$RECEIPT"
fi

say() {
  echo "[provision] $1"
  if [ -n "$RECEIPT" ]; then echo "[provision] $1" >> "$RECEIPT"; fi
}

refuse() { say "REFUSED: $1"; exit 1; }

say "Starting dependency provisioning check."

# ---------------------------------------------------------------- baseline ---
# The harness refuses to start a task on a dirty worktree, so the task began at
# a clean tree on BASELINE_HEAD. Targeted deletion of untracked files is only
# safe if that is still demonstrably true. If it cannot be proven, fail closed
# and delete nothing.
head_now="$(git rev-parse HEAD 2>/dev/null)" || refuse "cannot read HEAD."
if [ -z "$BASELINE_HEAD" ]; then
  refuse "no baseline HEAD supplied; cannot prove the task started clean."
fi
if [ "$head_now" != "$BASELINE_HEAD" ]; then
  refuse "HEAD moved during the task ($BASELINE_HEAD -> $head_now). Refusing to touch the worktree."
fi
say "Baseline verified: HEAD unchanged at $head_now."

if [ ! -f "package.json" ]; then
  say "No package.json in the worktree; not a provisioning case."
  exit 1
fi

# ------------------------------------------------------- declared vs present ---
declared="$(node -e '
const p=require("./package.json");
const d={...(p.dependencies||{}),...(p.devDependencies||{})};
process.stdout.write(Object.keys(d).join("\n"));
' 2>/dev/null)" || refuse "package.json is not valid JSON."

missing=""
for dep in $declared; do
  if [ ! -d "node_modules/$dep" ]; then
    missing="$missing $dep"
  fi
done
missing="$(echo "$missing" | tr -s ' ' | sed 's/^ //;s/ $//')"

if [ -z "$missing" ]; then
  say "Every declared dependency is already present; not a provisioning case."
  exit 1
fi
say "Declared but missing from node_modules: $missing"

# ------------------------------------------------- authorisation (two keys) ---
# Key 1: the Architect. A package missing from allowed_dependencies is refused
# even though the implementer declared it. package.json alone cannot authorise
# itself, because it was produced by work no reviewer has seen.
TASK_JSON="$RUN_DIR/task.json"
[ -f "$TASK_JSON" ] || refuse "task packet not found at $TASK_JSON."

authorised="$(node -e '
const t=require(process.argv[1]);
if(!Array.isArray(t.allowed_dependencies)){process.exit(3);}
process.stdout.write(t.allowed_dependencies.join("\n"));
' "$TASK_JSON" 2>/dev/null)"
case $? in
  0) ;;
  3) refuse "task packet has no allowed_dependencies array. The Architect must authorise dependencies explicitly." ;;
  *) refuse "cannot read the task packet." ;;
esac

say "Architect authorised: ${authorised:-<none>}"

# Key 2: the Implementer declared it. Intersect, and refuse on any surplus.
for dep in $missing; do
  found=0
  for ok in $authorised; do
    if [ "$dep" = "$ok" ]; then found=1; break; fi
  done
  if [ "$found" -eq 0 ]; then
    refuse "'$dep' is declared in package.json but NOT authorised by the Architect. Escalating instead of installing."
  fi
done
say "Every missing dependency is authorised by both the Architect and the Implementer."

# ------------------------------------- package.json touched only where allowed ---
# An automatic provision may not run if the attempt edited anything outside the
# dependency sections: scripts, bin, overrides and resolutions can all execute
# or redirect code.
if git cat-file -e HEAD:package.json 2>/dev/null; then
  git show HEAD:package.json > "$RUN_DIR/package.json.head" 2>/dev/null
  if ! node -e '
    const fs=require("fs");
    const a=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
    const b=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
    for(const k of ["dependencies","devDependencies"]){delete a[k];delete b[k];}
    process.exit(JSON.stringify(a)===JSON.stringify(b)?0:1);
  ' "$RUN_DIR/package.json.head" package.json 2>/dev/null; then
    refuse "package.json changed outside dependencies/devDependencies. Refusing automatic provisioning."
  fi
  say "package.json changed only inside dependency sections."
else
  say "package.json is new in this attempt; no prior version to compare."
fi

# ---------------------------------------------------------------- evidence ---
# Preserve the attempt before anything is deleted.
if [ -n "$RUN_DIR" ]; then
  cp -f package.json "$RUN_DIR/package.json" 2>/dev/null || true
  [ -f package-lock.json ] && cp -f package-lock.json "$RUN_DIR/package-lock.json" 2>/dev/null || true
  [ -f .loop/HUMAN_GATE.md ] && cp -f .loop/HUMAN_GATE.md "$RUN_DIR/HUMAN_GATE.md" 2>/dev/null || true
  say "Evidence preserved in $RUN_DIR (package.json, package-lock.json, HUMAN_GATE.md)."
fi

# ------------------------------------------------------------ host install ---
# The host, never Codex, runs npm. No package arguments: npm can only install
# what package.json already declares. --ignore-scripts so no lifecycle script
# from an unreviewed attempt executes here.
say "Running npm install on the host (no package arguments, scripts ignored)."
if npm install --ignore-scripts --no-audit --no-fund >>"${RECEIPT:-/dev/null}" 2>&1; then
  say "Host install succeeded."
else
  # The host has network. If it still fails, the problem is real (a bad version,
  # a nonexistent package, a peer conflict) and is NOT a sandbox provisioning
  # case. Keep the gate and let a human read it.
  refuse "host npm install also failed. This is a real dependency problem, not a sandbox restriction."
fi

for dep in $missing; do
  [ -d "node_modules/$dep" ] || refuse "'$dep' still absent after install."
done
say "All previously missing dependencies are now present."

# --------------------------------------------- discard unapproved product ---
# node_modules is gitignored environment and stays. Everything the attempt wrote
# is discarded: no product code survives a task the reviewer never approved.
tracked="$(git diff --name-only HEAD 2>/dev/null)"
if [ -n "$tracked" ]; then
  echo "$tracked" | while IFS= read -r f; do
    [ -n "$f" ] && git checkout -- "$f" 2>/dev/null
  done
  say "Reverted tracked files: $(echo "$tracked" | tr '\n' ' ')"
fi

untracked="$(git ls-files --others --exclude-standard 2>/dev/null)"
if [ -n "$untracked" ]; then
  echo "$untracked" | while IFS= read -r f; do
    [ -n "$f" ] && rm -f "$f" 2>/dev/null
  done
  say "Removed untracked files: $(echo "$untracked" | tr '\n' ' ')"
fi
# Prune directories the attempt left empty, without a broad git clean.
find . -type d -empty -not -path "./.git/*" -not -path "./node_modules/*" -delete 2>/dev/null || true

# ----------------------------------------------------------- final baseline ---
# The rerun must start from exactly the state the task started from.
remaining="$(git status --porcelain 2>/dev/null)"
if [ -n "$remaining" ]; then
  say "Worktree still dirty after discard:"
  say "$remaining"
  refuse "cannot guarantee a clean rerun."
fi

head_after="$(git rev-parse HEAD 2>/dev/null)"
if [ "$head_after" != "$BASELINE_HEAD" ]; then
  refuse "HEAD changed during provisioning ($BASELINE_HEAD -> $head_after)."
fi

say "Worktree clean; HEAD unchanged at $head_after."
say "Provisioned: $missing"
say "The caller may now delete the gate and rerun the task from a fresh Architect."
exit 0
