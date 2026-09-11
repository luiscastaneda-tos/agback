#!/usr/bin/env bash
# G3 - Layered import enforcement for the multi-agent execution chokepoint.
#
#   Agent -> ToolHandle/definition (inert) -> ToolInvoker -> schema validation
#     -> PolicyEngine -> ApprovalEngine -> ExecutorRegistry -> Executor -> NoktosClient
#
# The rule engine is an ALLOWLIST per protected target: only the listed
# importers may reach a target. Anything else - including files and
# directories nobody anticipated - is a violation. This fails CLOSED.
#
# Modes:
#   (default)   scan every TypeScript file under src/   [full tree]
#   --changed   scan only files reported as changed by git   [diff guard]
#
# Exit codes: 0 = clean, 1 = violation found, 2 = usage error.

set -u

MODE="full"
case "${1:-}" in
  '')         MODE="full" ;;
  --changed)  MODE="changed" ;;
  -h|--help)  echo "Usage: check-layering.sh [--changed]"; exit 0 ;;
  *)          echo "[layering] Unknown argument: $1" >&2; exit 2 ;;
esac

root="$(git rev-parse --show-toplevel 2>/dev/null)"
[ -n "$root" ] || { echo "[layering] Run inside a Git repository." >&2; exit 2; }
cd "$root" || exit 2

# ---------------------------------------------------------------------------
# Target classification. Checked most-specific first.
# ---------------------------------------------------------------------------
classify_target() {
  local spec="$1"
  case "$spec" in
    *executors/*|*/executors)                 echo "EXECUTORS"; return 0 ;;
  esac
  case "$spec" in
    *noktos-client*)                          echo "NOKTOS";    return 0 ;;
    */noktos/*|*/noktos|noktos/*)             echo "NOKTOS";    return 0 ;;
  esac
  case "$spec" in
    */execution/*|*/execution|execution/*)    echo "EXECUTION"; return 0 ;;
  esac
  echo ""
}

# ---------------------------------------------------------------------------
# Allowlists. importer path (repo-relative) vs target.
# ---------------------------------------------------------------------------
is_allowed() {
  local importer="$1" target="$2"
  case "$target" in
    NOKTOS)
      case "$importer" in
        src/noktos/*)                    return 0 ;;
        src/execution/executors/*)       return 0 ;;
      esac
      return 1 ;;
    EXECUTORS)
      case "$importer" in
        src/execution/executor-registry.ts) return 0 ;;
        src/execution/executors/*)          return 0 ;;
      esac
      return 1 ;;
    EXECUTION)
      case "$importer" in
        src/tools/tool-invoker.ts)       return 0 ;;
        src/execution/*)                 return 0 ;;
      esac
      return 1 ;;
  esac
  return 1
}

# ---------------------------------------------------------------------------
# Import extraction: static imports, re-exports, require() and dynamic import().
# ---------------------------------------------------------------------------
extract_specifiers() {
  local file="$1"
  {
    grep -oE "from[[:space:]]+['\"][^'\"]+['\"]"     "$file" 2>/dev/null
    grep -oE "require\([[:space:]]*['\"][^'\"]+['\"]" "$file" 2>/dev/null
    grep -oE "import\([[:space:]]*['\"][^'\"]+['\"]"  "$file" 2>/dev/null
  } | grep -oE "['\"][^'\"]+['\"]" | tr -d "'\""
}

candidate_files() {
  if [ "$MODE" = "changed" ]; then
    {
      git -c core.quotePath=false diff --name-only
      git -c core.quotePath=false diff --cached --name-only
      git -c core.quotePath=false ls-files --others --exclude-standard
    } | sort -u
  else
    git -c core.quotePath=false ls-files 'src/*' 2>/dev/null
    git -c core.quotePath=false ls-files --others --exclude-standard 'src/*' 2>/dev/null
  fi
}

violations=0
scanned=0

while IFS= read -r file; do
  [ -n "$file" ] || continue
  case "$file" in
    src/*.ts|src/*.tsx) ;;
    *) continue ;;
  esac
  [ -f "$file" ] || continue
  scanned=$(( scanned + 1 ))

  while IFS= read -r spec; do
    [ -n "$spec" ] || continue
    target="$(classify_target "$spec")"
    [ -n "$target" ] || continue
    if ! is_allowed "$file" "$target"; then
      echo "[layering] VIOLATION: $file imports '$spec' (protected layer: $target)"
      violations=$(( violations + 1 ))
    fi
  done <<EOF
$(extract_specifiers "$file")
EOF
done <<EOF
$(candidate_files)
EOF

if [ "$violations" -ne 0 ]; then
  echo "[layering] $violations violation(s) across $scanned scanned file(s)."
  echo "[layering] Only the authorized execution layer may reach NoktosClient."
  exit 1
fi

echo "[layering] OK - $scanned file(s) scanned, no layering violations (mode=$MODE)."
exit 0
