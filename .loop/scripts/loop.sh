#!/usr/bin/env bash
# Noktos Auth engineering loop - V3 (bash port of loop.ps1)
#
# Supervisor: this script. There is no persistent model session; every agent is
# a fresh, ephemeral, one-shot CLI invocation.
#
#   [1] architect    provider=configurable  sandbox=read-only
#   [2] task packet
#   [3] implementer  provider=codex ONLY    sandbox=workspace-write
#   [4] harness diff.patch + scope guards + deterministic verify (no tokens)
#   [5] reviewer     provider=rotating      sandbox=read-only
#   [6] commit on approve, otherwise retry (same provider) or HUMAN_GATE
#
# Written for the bash 3.2 that ships with macOS: no associative arrays, no
# mapfile, no ${var,,}.
#
# Exit codes (kept identical to loop.ps1, plus 10):
#   0  complete / plan-only success
#   1  fatal harness error
#   2  architect human_gate
#   3  architect blocked
#   4  implementer created commits (forbidden)
#   5  implementer returned human_gate/blocked
#   6  task scope or forbidden database command violation
#   7  reviewer human_gate
#   8  task not approved after MaxAttemptsPerTask
#   9  MaxIterations reached: normal batch boundary, NOT a human gate
#   10 selected provider CLI is unavailable
#
# Batch boundaries vs human gates
# -------------------------------
# Exit 9 means "this batch spent its iteration budget"; it is a budget event,
# never a decision request. It writes .loop/MAX_ITERATIONS_REACHED.md (an
# informational receipt) and never .loop/HUMAN_GATE.md, so a supervisor that
# stops on HUMAN_GATE.md is not stopped by a budget limit.
#
# .loop/HUMAN_GATE.md is reserved for states that genuinely need a human:
# exit codes 2, 3, 4, 5, 6, 7, 8 and 10. Its presence always means stop.

set -u
set -o pipefail

export GIT_PAGER=cat

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=loop.config.sh
. "$SCRIPT_DIR/loop.config.sh"

PLAN_ONLY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --max-iterations)       MAX_ITERATIONS="${2:-}"; shift 2 ;;
    --max-attempts)         MAX_ATTEMPTS_PER_TASK="${2:-}"; shift 2 ;;
    --claude-max-turns)     CLAUDE_MAX_TURNS="${2:-}"; shift 2 ;;
    --claude-max-budget-usd) CLAUDE_MAX_BUDGET_USD="${2:-}"; shift 2 ;;
    --claude-model)         CLAUDE_MODEL="${2:-}"; shift 2 ;;
    --codex-model)          CODEX_MODEL="${2:-}"; shift 2 ;;
    --claude-review-every)  CLAUDE_REVIEW_EVERY="${2:-}"; shift 2 ;;
    --reviewer-mode)        REVIEWER_MODE="${2:-}"; shift 2 ;;
    --architect-provider)   ARCHITECT_PROVIDER="${2:-}"; shift 2 ;;
    --plan-only)            PLAN_ONLY=1; shift ;;
    -h|--help)
      cat <<'USAGE'
Usage: loop.sh [options]

  --max-iterations N          Max architect iterations (default 20)
  --max-attempts N            Implementation attempts per task (default 2)
  --plan-only                 Run the architect, write the task packet, stop
  --reviewer-mode MODE        rotate | codex | claude
  --claude-review-every N     Every Nth task reviewed by Claude (0 = never)
  --architect-provider P      codex | claude
  --codex-model M             Model override for Codex
  --claude-model M            Model override for Claude
  --claude-max-turns N        Claude --max-turns
  --claude-max-budget-usd N   Claude --max-budget-usd (0 = unset)

The implementer is always Codex and is not configurable.
USAGE
      exit 0
      ;;
    *)
      echo "[error] Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Basic helpers
# ---------------------------------------------------------------------------

write_step() { echo "[noktos-loop] $1"; }
die() { echo "[error] $*" >&2; exit 1; }

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Required command '$1' was not found in PATH."
}

now_iso() { date -u +%Y-%m-%dT%H:%M:%SZ; }

assert_safe_branch() {
  local branch
  branch="$(git branch --show-current)"
  [ -n "$branch" ] || die "Detached HEAD is not supported."
  case "$branch" in
    main|master|develop|production)
      die "Refusing to run on protected-looking branch '$branch'. Use loop/noktos-auth or another dedicated branch."
      ;;
  esac
}

assert_clean_worktree() {
  if [ -n "$(git status --porcelain)" ]; then
    die "Working tree is not clean. Commit/stash before starting the next iteration."
  fi
}

ensure_local_excludes() {
  local exclude_path="$1/.git/info/exclude"
  mkdir -p "$(dirname "$exclude_path")"
  touch "$exclude_path"
  local entry
  for entry in ".loop/runs/" ".loop/HUMAN_GATE.md" ".loop/MAX_ITERATIONS_REACHED.md"; do
    if ! grep -qxF "$entry" "$exclude_path" 2>/dev/null; then
      echo "$entry" >> "$exclude_path"
    fi
  done
}

# ---------------------------------------------------------------------------
# jq output normalization
#
# A native Windows jq build (opened via the C runtime's default text mode)
# emits CRLF line endings even for -r/raw output, while every Unix jq emits
# LF only. Nothing downstream in this file strips a trailing \r: not
# `read -r`, not command substitution, not string comparisons like
# `[ "$verdict" = "approve" ]` or the "src/foo/" directory-rule matcher in
# path_matches_rule. Left unhandled, a CRLF-emitting jq silently breaks
# path-rule matching (a real scope violation is indistinguishable from a
# false one) AND every jq-derived string comparison in the loop, including
# the reviewer verdict check that gates every commit.
#
# jq_run is the ONLY way this script invokes jq. It prefers -b/--binary
# (jq >=1.7) to stop the CRLF translation at the source, and always strips
# one trailing \r per output line as a portable fallback - so behaviour is
# identical whether the underlying jq emits LF or CRLF, and whether or not
# -b is supported. It preserves jq's own exit status (not sed's), the same
# PIPESTATUS discipline verify.sh already uses so a masked pipe never turns
# a real failure into a false pass.
# ---------------------------------------------------------------------------

JQ_SUPPORTS_BINARY=""

jq_run() {
  if [ -z "$JQ_SUPPORTS_BINARY" ]; then
    if jq -b -n '.' >/dev/null 2>&1; then
      JQ_SUPPORTS_BINARY=1
    else
      JQ_SUPPORTS_BINARY=0
    fi
  fi
  local rc
  if [ "$JQ_SUPPORTS_BINARY" -eq 1 ]; then
    jq -b "$@" | sed 's/\r$//'
  else
    jq "$@" | sed 's/\r$//'
  fi
  rc=${PIPESTATUS[0]}
  return "$rc"
}

# The ONLY source of truth for scope enforcement. worker.files_changed is
# self-reported by the agent and is never trusted for enforcement; it stays in
# the run artifacts for auditing only.
# core.quotePath=false keeps non-ASCII filenames literal instead of octal-escaped.
get_changed_files() {
  {
    git -c core.quotePath=false diff --name-only
    git -c core.quotePath=false diff --cached --name-only
    git -c core.quotePath=false ls-files --others --exclude-standard
  } | sed '/^[[:space:]]*$/d' | sort -u
}

# Reads a jq array filter into the global REPLY_LINES array.
REPLY_LINES=()
read_lines_into_reply() {
  local filter="$1" file="$2" line
  REPLY_LINES=()
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    REPLY_LINES[${#REPLY_LINES[@]}]="$line"
  done < <(jq_run -r "$filter" "$file" 2>/dev/null)
}

# ---------------------------------------------------------------------------
# Path rule language for allowed_paths / forbidden_paths.
#
# EXACTLY three supported forms. Anything else is rejected before the
# implementer runs; unsupported patterns are never interpreted permissively.
#
#   src/auth/auth.service.ts   exact file, matches only that path
#   src/auth/                  directory, recursive over the whole subtree
#   src/auth/**                explicit subtree, IDENTICAL to the form above
#
# Deliberately NOT supported: src/auth/*.ts, src/*/foo, foo/**/bar, bare **,
# '?' wildcards, absolute paths, '..' components, backslash separators.
#
# Matching is case-insensitive. No globbing is performed on rule text: every
# comparison is literal, so a rule can never widen itself accidentally.
# ---------------------------------------------------------------------------

RULE_ERROR=""

validate_path_rule() {
  local r="$1"
  RULE_ERROR=""

  if [ -z "$r" ]; then RULE_ERROR="empty rule"; return 1; fi

  case "$r" in
    /*)      RULE_ERROR="absolute path"; return 1 ;;
    '~'*)    RULE_ERROR="home-relative path"; return 1 ;;
    ./*|.)   RULE_ERROR="non-normalized path"; return 1 ;;
    ../*|..) RULE_ERROR="'..' component"; return 1 ;;
    *\\*)    RULE_ERROR="backslash separator"; return 1 ;;
    *//*)    RULE_ERROR="empty path component"; return 1 ;;
  esac

  case "/$r/" in
    */../*) RULE_ERROR="'..' component"; return 1 ;;
  esac

  # Strip the only wildcard form the language accepts, then reject any other.
  local body="$r"
  case "$r" in
    '**'|'**/'*) RULE_ERROR="bare '**' is too broad"; return 1 ;;
    */\*\*)      body="${r%/\*\*}" ;;
  esac

  case "$body" in
    *\**|*\?*|*\[*) RULE_ERROR="unsupported wildcard"; return 1 ;;
  esac

  if [ -z "$body" ]; then RULE_ERROR="empty base"; return 1; fi
  return 0
}

# path_matches_rule <file> <rule>
# Assumes the rule already passed validate_path_rule and the file already
# passed assert_paths_normalized.
path_matches_rule() {
  local f="$1"
  local r="$2"
  [ -n "$r" ] || return 1
  [ -n "$f" ] || return 1

  local base res=1
  shopt -s nocasematch
  case "$r" in
    */\*\*)
      base="${r%/\*\*}"
      [[ "$f" == "$base"/* ]] && res=0
      ;;
    */)
      base="${r%/}"
      [[ "$f" == "$base"/* ]] && res=0
      ;;
    *)
      [[ "$f" == "$r" ]] && res=0
      ;;
  esac
  shopt -u nocasematch
  return $res
}

# ---------------------------------------------------------------------------
# Guards. These RETURN non-zero and set GUARD_ERROR instead of exiting, because
# the caller must convert a violation into a HUMAN_GATE that preserves the diff
# for human inspection. The loop never auto-reverts security-sensitive work.
# ---------------------------------------------------------------------------

GUARD_ERROR=""

PROTECTED_PATHS=(
  ".loop/GOAL.md"
  ".loop/ARCHITECTURE_DECISIONS.md"
  ".loop/CONTRACTS.md"
  ".loop/BACKLOG.yaml"
  ".loop/STATE.json"
  ".loop/prompts/"
  ".loop/schemas/"
  ".loop/scripts/"
  "CLAUDE.md"
  "AGENTS.md"
  ".gitattributes"
  "contracts/"
)

# Fail-closed sanitation at the entry point of every path that comes from git.
# Anything that is not a plain, normalized, repo-relative path is refused
# outright rather than handed to the matcher.
assert_paths_normalized() {
  local changed="$1" file
  GUARD_ERROR=""
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    case "$file" in
      /*)       GUARD_ERROR="Absolute path reported by git: $file"; return 1 ;;
      '~'*)     GUARD_ERROR="Home-relative path reported by git: $file"; return 1 ;;
      ./*|.)    GUARD_ERROR="Non-normalized path reported by git: $file"; return 1 ;;
      ../*|..)  GUARD_ERROR="Path with '..' component reported by git: $file"; return 1 ;;
      *//*)     GUARD_ERROR="Path with empty component reported by git: $file"; return 1 ;;
      */)       GUARD_ERROR="Directory-shaped path reported by git: $file"; return 1 ;;
      '"'*)     GUARD_ERROR="Quoted/unrepresentable path reported by git: $file"; return 1 ;;
    esac
    case "/$file/" in
      */../*)   GUARD_ERROR="Path with '..' component reported by git: $file"; return 1 ;;
    esac
  done <<EOF
$changed
EOF
  return 0
}

# Rejects a task packet whose path rules are outside the supported language.
# Runs BEFORE the implementer, so an unsupported pattern never reaches Codex.
assert_task_rules() {
  local task_file="$1"
  GUARD_ERROR=""

  local -a rules=()
  read_lines_into_reply '((.allowed_paths // []) + (.forbidden_paths // []))[]' "$task_file"
  if [ ${#REPLY_LINES[@]} -gt 0 ]; then rules=("${REPLY_LINES[@]}"); fi

  if [ ${#rules[@]} -eq 0 ]; then
    GUARD_ERROR="Task packet has no path rules."
    return 1
  fi

  local rule
  for rule in "${rules[@]}"; do
    if ! validate_path_rule "$rule"; then
      GUARD_ERROR="Unsupported path rule '$rule' in task packet ($RULE_ERROR). Supported forms are exactly: 'src/auth/auth.service.ts' (exact file), 'src/auth/' (directory) and 'src/auth/**' (subtree)."
      return 1
    fi
  done
  return 0
}

assert_task_scope() {
  local task_file="$1"
  GUARD_ERROR=""

  local changed
  changed="$(get_changed_files)"
  if [ -z "$changed" ]; then
    GUARD_ERROR="Implementer returned without working-tree changes."
    return 1
  fi

  if ! assert_paths_normalized "$changed"; then
    return 1
  fi

  local -a allowed=() forbidden=()
  read_lines_into_reply '(.allowed_paths // [])[]' "$task_file"
  if [ ${#REPLY_LINES[@]} -gt 0 ]; then allowed=("${REPLY_LINES[@]}"); fi
  read_lines_into_reply '(.forbidden_paths // [])[]' "$task_file"
  if [ ${#REPLY_LINES[@]} -gt 0 ]; then forbidden=("${REPLY_LINES[@]}"); fi

  if [ ${#allowed[@]} -eq 0 ]; then
    GUARD_ERROR="Task packet has no allowed_paths."
    return 1
  fi

  local violations="" file rule is_allowed is_forbidden
  while IFS= read -r file; do
    [ -n "$file" ] || continue

    is_allowed=0
    for rule in "${allowed[@]}"; do
      if path_matches_rule "$file" "$rule"; then is_allowed=1; break; fi
    done

    is_forbidden=0
    if [ ${#forbidden[@]} -gt 0 ]; then
      for rule in "${forbidden[@]}"; do
        if path_matches_rule "$file" "$rule"; then is_forbidden=1; break; fi
      done
    fi
    if [ "$is_forbidden" -eq 0 ]; then
      for rule in "${PROTECTED_PATHS[@]}"; do
        if path_matches_rule "$file" "$rule"; then is_forbidden=1; break; fi
      done
    fi

    if [ "$is_allowed" -eq 0 ] || [ "$is_forbidden" -eq 1 ]; then
      if [ -n "$violations" ]; then violations="$violations, $file"; else violations="$file"; fi
    fi
  done <<EOF
$changed
EOF

  if [ -n "$violations" ]; then
    GUARD_ERROR="Task scope violation: $violations"
    return 1
  fi
  return 0
}

# True only for pure-documentation paths, which cannot execute anything and may
# therefore quote a forbidden command as prose (a security policy document
# naming the commands it forbids is the motivating case).
#
# Deliberately a closed list of extensions, not a heuristic: no attempt is made
# to read intent from surrounding words like "never" or "do not". Anything not
# on the list - including extensionless files such as Dockerfile, Makefile or a
# bare README - is NOT documentation for this purpose and stays scanned. The
# classification fails closed.
is_documentation_path() {
  local p="$1"
  [ -n "$p" ] || return 1
  local res=1
  shopt -s nocasematch
  case "$p" in
    *.md|*.txt) res=0 ;;
  esac
  shopt -u nocasematch
  return $res
}

# Emits every line of the patch EXCEPT the sections belonging to pure
# documentation files. Text before the first 'diff --git' header (the harness's
# own preamble) is emitted, and any header whose destination path cannot be
# parsed confidently leaves the section scanned.
emit_scannable_patch_sections() {
  local patch_file="$1" line target skip=0
  while IFS= read -r line; do
    case "$line" in
      'diff --git '*)
        target="${line#diff --git }"
        target="${target#* b/}"
        if is_documentation_path "$target"; then skip=1; else skip=0; fi
        ;;
    esac
    if [ "$skip" -eq 0 ]; then
      printf '%s\n' "$line"
    fi
  done < "$patch_file"
}

assert_no_forbidden_database_commands() {
  local patch_file="$1"
  GUARD_ERROR=""
  [ -f "$patch_file" ] || return 0

  local -a patterns=(
    'prisma[[:space:]]+migrate[[:space:]]+reset'
    'prisma[[:space:]]+db[[:space:]]+push'
    'prisma[[:space:]]+migrate[[:space:]]+deploy'
    'DROP[[:space:]]+TABLE[[:space:]]+.*user_info'
    'ALTER[[:space:]]+TABLE[[:space:]]+.*user_info'
  )
  local pattern
  for pattern in "${patterns[@]}"; do
    if emit_scannable_patch_sections "$patch_file" | grep -qEi "$pattern"; then
      GUARD_ERROR="Forbidden/destructive database command or user_info DDL found in diff: $pattern"
      return 1
    fi
  done
  return 0
}

# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# Project guards for the multi-agent backend.
#
# Every one of these is mechanically checkable. None is a prompt instruction:
# the enforcement lives here, in code, outside the model.
# ---------------------------------------------------------------------------

# G1 - secret leakage. Credential-shaped material must never enter the repo.
assert_no_secret_leakage() {
  local patch_file="$1"
  GUARD_ERROR=""
  [ -f "$patch_file" ] || return 0

  local -a patterns=(
    'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.'
    'service_role'
    'SUPABASE_[A-Z_]*KEY[[:space:]]*=[[:space:]]*[A-Za-z0-9]'
    'sk-[A-Za-z0-9]{20,}'
    'nok_(test|live)_[A-Za-z0-9_-]{20,}'
  )
  local pattern
  for pattern in "${patterns[@]}"; do
    if emit_scannable_patch_sections "$patch_file" | grep -qE "$pattern"; then
      GUARD_ERROR="G1: credential-shaped value found in diff (pattern: $pattern). Secrets never belong in the repository."
      return 1
    fi
  done
  return 0
}

# G2 - LLM provider isolation: model SDKs only inside src/llm/.
# G4 - configuration boundary: process.env only inside src/config/.
# G6 - chain-of-thought: reasoning fields must never enter an event payload.
assert_project_import_rules() {
  local changed="$1" file
  GUARD_ERROR=""
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    case "$file" in
      src/*.ts|src/*.tsx) ;;
      *) continue ;;
    esac
    [ -f "$file" ] || continue

    case "$file" in
      src/llm/*) ;;
      *)
        if grep -qE "from[[:space:]]+['\"](@anthropic-ai/|openai|@google/gen|@mistralai/|cohere-ai)" "$file" 2>/dev/null; then
          GUARD_ERROR="G2: $file imports an LLM provider SDK outside src/llm/."
          return 1
        fi
        ;;
    esac

    case "$file" in
      src/config/*) ;;
      *)
        if grep -qE 'process\.env' "$file" 2>/dev/null; then
          GUARD_ERROR="G4: $file reads process.env outside src/config/."
          return 1
        fi
        ;;
    esac

    if grep -qE '(reasoning|chainOfThought|chain_of_thought|scratchpad|innerMonologue)[[:space:]]*[?:]' "$file" 2>/dev/null; then
      GUARD_ERROR="G6: $file declares a reasoning/chain-of-thought field. Events carry structured operational data only."
      return 1
    fi
  done <<EOF
$changed
EOF
  return 0
}

# G3 - layered execution chokepoint. Delegates to the shared rule engine so the
# diff guard and the full-tree check in verify.sh can never disagree.
assert_layering_rules() {
  GUARD_ERROR=""
  local out
  if out="$(bash "$REPO_ROOT/.loop/scripts/check-layering.sh" --changed 2>&1)"; then
    return 0
  fi
  GUARD_ERROR="G3: $(printf '%s' "$out" | grep VIOLATION | head -3 | tr '\n' ' ')"
  return 1
}

# Provider abstraction
#
# invoke_agent role provider sandbox prompt_file schema_file run_dir out_file
#
# Normalizes the two CLIs so the loop never reads provider-shaped output:
#   codex  -> --output-schema writes the schema object directly
#   claude -> --output-format json writes an envelope; payload is .structured_output
# Both end up as a bare schema-conforming object in out_file.
# ---------------------------------------------------------------------------

provider_available() {
  case "$1" in
    codex)  command -v "$CODEX_BIN"  >/dev/null 2>&1 ;;
    claude) command -v "$CLAUDE_BIN" >/dev/null 2>&1 ;;
    *) return 1 ;;
  esac
}

# Strips optional markdown code fences and validates that the result is JSON.
extract_json() {
  local src="$1" dest="$2"
  if jq_run -e . "$src" > "$dest" 2>/dev/null; then
    return 0
  fi
  sed -e 's/^[[:space:]]*```[a-zA-Z]*[[:space:]]*$//' -e 's/^[[:space:]]*```[[:space:]]*$//' "$src" \
    | jq_run -e . > "$dest" 2>/dev/null
}

invoke_agent() {
  local role="$1" provider="$2" sandbox="$3" prompt_file="$4" schema_file="$5" run_dir="$6" out_file="$7"

  # ---- Fail-closed policy guards. These are the security contract. ----
  if [ "$sandbox" = "danger-full-access" ]; then
    die "invoke_agent: danger-full-access is never permitted."
  fi
  case "$provider" in
    codex|claude) ;;
    *) die "invoke_agent: unknown provider '$provider'." ;;
  esac
  if [ "$role" = "implementer" ] && [ "$provider" != "codex" ]; then
    die "invoke_agent: role 'implementer' must use codex. Claude must never implement code."
  fi
  if [ "$role" = "architect" ] || [ "$role" = "reviewer" ]; then
    if [ "$sandbox" != "read-only" ]; then
      die "invoke_agent: role '$role' must run read-only (got '$sandbox')."
    fi
  fi
  if [ "$provider" = "claude" ] && [ "$sandbox" = "workspace-write" ]; then
    die "invoke_agent: claude must never run with workspace-write."
  fi

  local raw_file="$run_dir/${role}.${provider}.raw"
  local rc=0

  if [ "$provider" = "codex" ]; then
    local -a args=(exec --ephemeral --sandbox "$sandbox" --output-schema "$schema_file" -o "$raw_file")
    if [ -n "$CODEX_MODEL" ]; then args+=(--model "$CODEX_MODEL"); fi
    args+=(-)
    write_step "Calling $role via codex (sandbox=$sandbox)..."
    "$CODEX_BIN" "${args[@]}" < "$prompt_file"
    rc=$?
    if [ "$rc" -ne 0 ]; then
      echo "[error] codex $role exited with code $rc." >&2
      return "$rc"
    fi
    if [ ! -f "$raw_file" ]; then
      echo "[error] codex $role did not create its structured result file." >&2
      return 1
    fi
  else
    local -a args=(
      -p "$(cat "$prompt_file")"
      --permission-mode plan
      --output-format json
      --json-schema "$schema_file"
      --max-turns "$CLAUDE_MAX_TURNS"
      --no-session-persistence
    )
    if [ "${CLAUDE_MAX_BUDGET_USD:-0}" != "0" ]; then args+=(--max-budget-usd "$CLAUDE_MAX_BUDGET_USD"); fi
    if [ -n "$CLAUDE_MODEL" ]; then args+=(--model "$CLAUDE_MODEL"); fi
    write_step "Calling $role via claude (plan mode, read-only)..."
    "$CLAUDE_BIN" "${args[@]}" > "$raw_file"
    rc=$?
    if [ "$rc" -ne 0 ]; then
      echo "[error] claude $role exited with code $rc." >&2
      return "$rc"
    fi
    local unwrapped="$run_dir/${role}.claude.structured.json"
    if ! jq_run -e '.structured_output' "$raw_file" > "$unwrapped" 2>/dev/null; then
      echo "[error] claude $role returned JSON but no structured_output field." >&2
      return 1
    fi
    raw_file="$unwrapped"
  fi

  if ! extract_json "$raw_file" "$out_file"; then
    echo "[error] $role ($provider) did not return parseable JSON. See $raw_file" >&2
    return 1
  fi
  return 0
}

# ---------------------------------------------------------------------------
# Reviewer provider selection
#
# The provider is chosen ONCE PER TASK and persisted, so that retries of the
# same task reuse it and a resumed run after a HUMAN_GATE does not shift the
# rotation. State lives under .loop/runs/ which is in .git/info/exclude, so it
# never dirties the worktree and is invisible to assert_task_scope.
# ---------------------------------------------------------------------------

ROTATION_COUNT_FILE=""
ROTATION_CURRENT_FILE=""

# Pure function: slot number in, provider name out. Testable without tokens.
select_reviewer_provider() {
  local slot="$1"
  local every="$CLAUDE_REVIEW_EVERY"
  case "$REVIEWER_MODE" in
    codex)  echo "codex";  return 0 ;;
    claude) echo "claude"; return 0 ;;
  esac
  if [ "$every" -le 0 ]; then echo "codex"; return 0; fi
  if [ "$every" -eq 1 ]; then echo "claude"; return 0; fi
  if [ $(( slot % every )) -eq 0 ]; then echo "claude"; else echo "codex"; fi
}

read_rotation_slot() {
  local slot=""
  if [ -f "$ROTATION_COUNT_FILE" ]; then
    slot="$(tr -cd '0-9' < "$ROTATION_COUNT_FILE")"
  fi
  if [ -z "$slot" ]; then
    # Self-healing: fall back to the audit mirror in STATE.json, then to zero.
    slot="$(jq_run -r '.reviewer_rotation.slot // 0' "$STATE_PATH" 2>/dev/null | tr -cd '0-9')"
  fi
  [ -n "$slot" ] || slot=0
  echo "$slot"
}

write_rotation_slot() {
  local slot="$1"
  printf '%s\n' "$slot" > "$ROTATION_COUNT_FILE.tmp" && mv "$ROTATION_COUNT_FILE.tmp" "$ROTATION_COUNT_FILE"
}

# Sets REVIEW_PROVIDER and REVIEW_SLOT for the given task id.
resolve_reviewer_for_task() {
  local task_id="$1"

  if [ -f "$ROTATION_CURRENT_FILE" ]; then
    local pinned_task pinned_provider pinned_slot
    pinned_task="$(jq_run -r '.task_id // ""' "$ROTATION_CURRENT_FILE" 2>/dev/null)"
    pinned_provider="$(jq_run -r '.provider // ""' "$ROTATION_CURRENT_FILE" 2>/dev/null)"
    pinned_slot="$(jq_run -r '.slot // 0' "$ROTATION_CURRENT_FILE" 2>/dev/null)"
    if [ -n "$pinned_task" ] && [ "$pinned_task" = "$task_id" ] && [ -n "$pinned_provider" ]; then
      REVIEW_PROVIDER="$pinned_provider"
      REVIEW_SLOT="$pinned_slot"
      write_step "Reviewer provider pinned from previous run: $REVIEW_PROVIDER (slot $REVIEW_SLOT)"
      return 0
    fi
  fi

  case "$REVIEWER_MODE" in
    rotate)
      local slot
      slot="$(read_rotation_slot)"
      slot=$(( slot + 1 ))
      REVIEW_SLOT="$slot"
      REVIEW_PROVIDER="$(select_reviewer_provider "$slot")"
      write_rotation_slot "$slot"
      ;;
    *)
      REVIEW_SLOT="$(read_rotation_slot)"
      REVIEW_PROVIDER="$(select_reviewer_provider "$REVIEW_SLOT")"
      ;;
  esac

  jq_run -n --arg t "$task_id" --arg p "$REVIEW_PROVIDER" --argjson s "$REVIEW_SLOT" \
    '{task_id:$t, provider:$p, slot:$s}' > "$ROTATION_CURRENT_FILE.tmp" \
    && mv "$ROTATION_CURRENT_FILE.tmp" "$ROTATION_CURRENT_FILE"

  write_step "Reviewer provider for $task_id: $REVIEW_PROVIDER (slot $REVIEW_SLOT, every=$CLAUDE_REVIEW_EVERY, mode=$REVIEWER_MODE)"
}

clear_pinned_reviewer() { rm -f "$ROTATION_CURRENT_FILE"; }

# ---------------------------------------------------------------------------
# Artifacts
# ---------------------------------------------------------------------------

# Builds the review diff the harness hands to the reviewer, so no agent spends
# turns running git. Untracked files are included; loop.ps1 only scanned
# tracked changes, so the forbidden-command scan is now strictly wider.
build_diff_patch() {
  local run_dir="$1"
  local full="$run_dir/diff.full.patch"
  local out="$run_dir/diff.patch"

  {
    echo "# Noktos Auth review diff (generated by the harness, do not edit)"
    echo "# Generated at: $(now_iso)"
    echo
    echo "===== tracked, unstaged ====="
    git --no-pager diff
    echo
    echo "===== tracked, staged ====="
    git --no-pager diff --cached
    echo
    echo "===== untracked ====="
    git ls-files --others --exclude-standard | while IFS= read -r f; do
      [ -n "$f" ] || continue
      git --no-pager diff --no-index -- /dev/null "$f" 2>/dev/null || true
    done
  } > "$full" 2>&1

  local total
  total="$(wc -l < "$full" | tr -d ' ')"
  if [ "${total:-0}" -gt "$DIFF_MAX_LINES" ]; then
    head -n "$DIFF_MAX_LINES" "$full" > "$out"
    {
      echo
      echo "===== TRUNCATED: $total lines total, first $DIFF_MAX_LINES shown ====="
      echo "===== Full patch: $full ====="
    } >> "$out"
  else
    cp "$full" "$out"
  fi
  echo "$out"
}

write_task_packet() {
  local decision_file="$1" run_dir="$2"
  local task_json="$run_dir/task.json"
  local task_md="$run_dir/task.md"

  jq_run '.task' "$decision_file" > "$task_json" || die "Could not extract task from architect decision."

  {
    echo "# Task $(jq_run -r '.id // ""' "$task_json")"
    echo
    echo "Parent backlog: $(jq_run -r '.parent_backlog_id // ""' "$task_json")"
    echo "Risk: $(jq_run -r '.risk // ""' "$task_json")"
    echo
    echo "## Title"
    jq_run -r '.title // ""' "$task_json"
    echo
    echo "## Objective"
    jq_run -r '.objective // ""' "$task_json"
    echo
    echo "## Allowed paths"
    jq_run -r '(.allowed_paths // [])[] | "- " + .' "$task_json"
    echo
    echo "## Forbidden paths"
    jq_run -r '(.forbidden_paths // [])[] | "- " + .' "$task_json"
    echo
    echo "## Requirements"
    jq_run -r '(.requirements // [])[] | "- " + .' "$task_json"
    echo
    echo "## Acceptance"
    jq_run -r '(.acceptance // [])[] | "- " + .' "$task_json"
    echo
    echo "## Notes"
    jq_run -r '(.notes // [])[] | "- " + .' "$task_json"
  } > "$task_md"

  echo "$task_md"
}

# Writes the real stop-the-world artifact. Call this ONLY when a human decision
# is genuinely required: a missing architectural decision, a guard violation, a
# forbidden implementer commit, a failed task, or a missing provider CLI.
# Never call it for a spent iteration budget - that is write_batch_boundary.
write_human_gate() {
  local reason="$1" questions_json="$2" run_dir="$3"
  local path="$REPO_ROOT/.loop/HUMAN_GATE.md"
  {
    echo "# HUMAN GATE"
    echo
    echo "The loop stopped instead of guessing."
    echo
    echo "## Reason"
    echo "$reason"
    echo
    echo "## Questions"
    if [ -n "$questions_json" ]; then
      echo "$questions_json" | jq_run -r '.[]? | "- " + .' 2>/dev/null
    fi
    echo
    echo "## Continue"
    echo "1. Record the approved decision in .loop/ARCHITECTURE_DECISIONS.md."
    echo "2. Review/revert any unapproved diff."
    echo "3. Commit the human decision/worktree."
    echo "4. Delete .loop/HUMAN_GATE.md."
    echo "5. Run the loop again."
    echo
    echo "Run artifacts: $run_dir"
  } > "$path"
  write_step "HUMAN_GATE: $reason"
  write_step "Questions written to $path"
}

# Batch boundary receipt. This is NOT a human gate: it asks nothing, blocks
# nothing, and is git-ignored so the worktree stays clean for the next batch.
# All committed work, STATE.json and the reviewer rotation are already durable
# by the time this runs.
write_batch_boundary() {
  local iterations_done="$1" runs_root="$2"
  local path="$REPO_ROOT/.loop/MAX_ITERATIONS_REACHED.md"
  {
    echo "# MAX_ITERATIONS_REACHED"
    echo
    echo "This batch used its full iteration budget. This is a normal batch"
    echo "boundary, not a human gate. Nothing is blocked and no decision is"
    echo "pending. There are no questions to answer."
    echo
    echo "## Batch"
    echo "- Iterations completed: $iterations_done/$MAX_ITERATIONS"
    echo "- Finished at: $(now_iso)"
    echo
    echo "## State"
    echo "Approved work is committed and STATE.json is up to date. The reviewer"
    echo "rotation counter has advanced normally."
    echo
    echo "## Continue"
    echo "Start another batch. The supervisor may do this without a human when"
    echo "the last task was approved, its commit exists, STATE.json is"
    echo "consistent, the worktree is clean, no .loop/HUMAN_GATE.md exists and"
    echo "no guard failure or BLOCKED state occurred."
    echo
    echo "Run artifacts: $runs_root"
  } > "$path"
  write_step "MAX_ITERATIONS_REACHED: batch boundary after $iterations_done/$MAX_ITERATIONS iteration(s). Not a human gate."
  write_step "Receipt written to $path"
}

approve_and_commit() {
  local task_file="$1" review_file="$2" provider="$3" slot="$4"
  local task_id title verdict summary ts tmp
  task_id="$(jq_run -r '.id // ""' "$task_file")"
  title="$(jq_run -r '.title // ""' "$task_file")"
  verdict="$(jq_run -r '.verdict // ""' "$review_file")"
  summary="$(jq_run -r '.summary // ""' "$review_file")"
  ts="$(now_iso)"
  tmp="$STATE_PATH.tmp"

  jq_run \
    --arg tid "$task_id" \
    --arg verdict "$verdict" \
    --arg summary "$summary" \
    --arg ts "$ts" \
    --arg provider "$provider" \
    --argjson slot "$slot" \
    --argjson every "$CLAUDE_REVIEW_EVERY" \
    '
    .status = "RUNNING"
    | .iteration = ((.iteration // 0) + 1)
    | .current_task = null
    | .last_review = {task_id:$tid, verdict:$verdict, summary:$summary, reviewed_at:$ts, provider:$provider}
    | .completed_tasks = (
        if ((.completed_tasks // []) | index($tid)) then (.completed_tasks // [])
        else ((.completed_tasks // []) + [$tid]) end
      )
    | .reviewer_rotation = {slot:$slot, last_provider:$provider, claude_review_every:$every}
    ' "$STATE_PATH" > "$tmp" || die "Failed to update STATE.json."
  mv "$tmp" "$STATE_PATH"

  git add -A || die "git add failed."
  git commit -m "loop($task_id): $title" || die "git commit failed. Configure Git user.name/user.email."
  write_step "Approved and committed $task_id."
}

# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------

require_command "git"
require_command "jq"
# Codex is always required: it is the implementer, unconditionally.
require_command "$CODEX_BIN"
# Claude is deliberately NOT required here. It is checked lazily, only if and
# when a provider selection actually resolves to claude.

case "$REVIEWER_MODE" in
  rotate|codex|claude) ;;
  *) die "Invalid REVIEWER_MODE '$REVIEWER_MODE'. Use rotate, codex or claude." ;;
esac
case "$CLAUDE_REVIEW_EVERY" in
  ''|*[!0-9]*) die "CLAUDE_REVIEW_EVERY must be a non-negative integer (got '$CLAUDE_REVIEW_EVERY')." ;;
esac

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
[ -n "$REPO_ROOT" ] || die "Run this script inside a Git repository."
cd "$REPO_ROOT" || die "Could not enter repository root."

ensure_local_excludes "$REPO_ROOT"
assert_safe_branch
assert_clean_worktree

# A real human gate outranks any batch. Refuse to start until a human has
# recorded the decision and removed the file; the harness never clears it.
if [ -f "$REPO_ROOT/.loop/HUMAN_GATE.md" ]; then
  die ".loop/HUMAN_GATE.md exists. A human decision is pending; the harness will not start a new batch. Resolve it and delete the file."
fi

# A stale batch-boundary receipt describes a finished batch, never this one.
rm -f "$REPO_ROOT/.loop/MAX_ITERATIONS_REACHED.md"

LOOP_ROOT="$REPO_ROOT/.loop"
STATE_PATH="$LOOP_ROOT/STATE.json"
ARCHITECT_PROMPT="$LOOP_ROOT/prompts/architect.md"
WORKER_PROMPT="$LOOP_ROOT/prompts/implementer.md"
REVIEW_PROMPT="$LOOP_ROOT/prompts/reviewer.md"
ARCHITECT_SCHEMA="$LOOP_ROOT/schemas/architect.schema.json"
WORKER_SCHEMA="$LOOP_ROOT/schemas/worker.schema.json"
REVIEW_SCHEMA="$LOOP_ROOT/schemas/reviewer.schema.json"
VERIFY_SCRIPT="$LOOP_ROOT/scripts/verify.sh"
RUNS_ROOT="$LOOP_ROOT/runs"

for required in "$STATE_PATH" "$ARCHITECT_PROMPT" "$WORKER_PROMPT" "$REVIEW_PROMPT" \
                "$ARCHITECT_SCHEMA" "$WORKER_SCHEMA" "$REVIEW_SCHEMA" "$VERIFY_SCRIPT"; do
  [ -f "$required" ] || die "Missing loop file: $required"
done
[ -x "$VERIFY_SCRIPT" ] || die "verify.sh is not executable. Run: chmod +x $VERIFY_SCRIPT"

mkdir -p "$RUNS_ROOT"
ROTATION_COUNT_FILE="$RUNS_ROOT/reviewer-rotation.count"
ROTATION_CURRENT_FILE="$RUNS_ROOT/reviewer-current.json"

REVIEW_PROVIDER=""
REVIEW_SLOT=0

# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

iteration=1
while [ "$iteration" -le "$MAX_ITERATIONS" ]; do
  assert_clean_worktree

  stamp="$(date +%Y%m%d-%H%M%S)"
  run_dir="$(printf '%s/%s-%03d' "$RUNS_ROOT" "$stamp" "$iteration")"
  mkdir -p "$run_dir"

  write_step "Iteration $iteration/$MAX_ITERATIONS"

  if ! provider_available "$ARCHITECT_PROVIDER"; then
    write_human_gate "Architect provider '$ARCHITECT_PROVIDER' is configured but its CLI is not installed. Nothing was executed. This harness never installs anything automatically." \
      '["Install the CLI yourself, or set ARCHITECT_PROVIDER=codex."]' "$run_dir"
    exit 10
  fi

  architect_prompt_file="$run_dir/architect.prompt.txt"
  cp "$ARCHITECT_PROMPT" "$architect_prompt_file"

  architect_decision="$run_dir/architect.decision.json"
  if ! invoke_agent "architect" "$ARCHITECT_PROVIDER" "read-only" \
       "$architect_prompt_file" "$ARCHITECT_SCHEMA" "$run_dir" "$architect_decision"; then
    die "Architect invocation failed. See $run_dir"
  fi

  action="$(jq_run -r '.action // ""' "$architect_decision")"
  reason="$(jq_run -r '.reason // ""' "$architect_decision")"
  questions="$(jq_run -c '.questions // []' "$architect_decision")"

  case "$action" in
    complete)
      tmp="$STATE_PATH.tmp"
      jq_run '.status = "READY_FOR_HUMAN_REVIEW"' "$STATE_PATH" > "$tmp" || die "Failed to update STATE.json."
      mv "$tmp" "$STATE_PATH"
      git add "$STATE_PATH" || die "git add failed."
      git commit -m "chore(loop): mark Noktos Auth ready for human review" || die "Failed to commit final loop state."
      clear_pinned_reviewer
      write_step "READY_FOR_HUMAN_REVIEW. Human review and real-DB migration review are still required."
      exit 0
      ;;
    human_gate)
      write_human_gate "$reason" "$questions" "$run_dir"
      exit 2
      ;;
    blocked)
      write_human_gate "BLOCKED: $reason" "$questions" "$run_dir"
      exit 3
      ;;
    dispatch)
      if [ "$(jq_run -r '.task | type' "$architect_decision")" = "null" ]; then
        die "Architect returned dispatch without task."
      fi
      ;;
    *)
      die "Unknown architect action: $action"
      ;;
  esac

  task_packet="$(write_task_packet "$architect_decision" "$run_dir")"
  task_file="$run_dir/task.json"
  task_id="$(jq_run -r '.id // ""' "$task_file")"
  task_title="$(jq_run -r '.title // ""' "$task_file")"
  write_step "Task: $task_id - $task_title"

  # Reject an unsupported path-rule language before any code is written.
  if ! assert_task_rules "$task_file"; then
    write_human_gate "$GUARD_ERROR" \
      '["Fix the task packet or the architect prompt so every allowed/forbidden path uses a supported form.","No implementer was executed; the working tree is untouched."]' \
      "$run_dir"
    exit 6
  fi

  if [ "$PLAN_ONLY" -eq 1 ]; then
    write_step "PlanOnly: no code executed. Task packet: $task_packet"
    exit 0
  fi

  # Reviewer provider is decided once per task and pinned for all retries.
  resolve_reviewer_for_task "$task_id"
  if ! provider_available "$REVIEW_PROVIDER"; then
    write_human_gate "Reviewer provider '$REVIEW_PROVIDER' was selected for task $task_id (slot $REVIEW_SLOT) but its CLI is not installed. No implementation was executed. This harness never installs anything automatically." \
      "$(jq_run -n --arg p "$REVIEW_PROVIDER" '["Install the " + $p + " CLI yourself and re-run; the provider stays pinned to this task.", "Or set CLAUDE_REVIEW_EVERY=0 / REVIEWER_MODE=codex, delete .loop/runs/reviewer-current.json, and re-run."]')" \
      "$run_dir"
    exit 10
  fi

  base_head="$(git rev-parse HEAD)"
  review_feedback_path=""
  approved=0
  attempt=1

  while [ "$attempt" -le "$MAX_ATTEMPTS_PER_TASK" ]; do
    worker_prompt_file="$run_dir/implementer.attempt-$attempt.prompt.txt"
    {
      cat "$WORKER_PROMPT"
      echo
      echo "CURRENT TASK PACKET:"
      echo "$task_packet"
      echo
      echo "ATTEMPT:"
      echo "$attempt"
      if [ -n "$review_feedback_path" ]; then
        echo
        echo "PREVIOUS REVIEW FEEDBACK:"
        echo "$review_feedback_path"
        echo "Read it and correct the current diff without broadening scope."
      fi
    } > "$worker_prompt_file"

    worker_out="$run_dir/worker.attempt-$attempt.json"
    if ! invoke_agent "implementer" "codex" "workspace-write" \
         "$worker_prompt_file" "$WORKER_SCHEMA" "$run_dir" "$worker_out"; then
      die "Implementer invocation failed on attempt $attempt. See $run_dir"
    fi

    head_after_worker="$(git rev-parse HEAD)"
    if [ "$head_after_worker" != "$base_head" ]; then
      write_human_gate "Implementer created commit(s), which is forbidden." \
        '["Inspect git history and decide whether to keep or revert them."]' "$run_dir"
      exit 4
    fi

    worker_status="$(jq_run -r '.status // ""' "$worker_out")"
    if [ "$worker_status" = "human_gate" ] || [ "$worker_status" = "blocked" ]; then
      write_human_gate "$(jq_run -r '.summary // ""' "$worker_out")" \
        "$(jq_run -c '.questions // []' "$worker_out")" "$run_dir"
      exit 5
    fi

    diff_patch="$(build_diff_patch "$run_dir")"

    if ! assert_task_scope "$task_file"; then
      write_human_gate "$GUARD_ERROR" \
        '["Inspect the current diff. The loop will not auto-revert security/database-sensitive work."]' "$run_dir"
      exit 6
    fi
    if ! assert_no_forbidden_database_commands "$run_dir/diff.full.patch"; then
      write_human_gate "$GUARD_ERROR" \
        '["Inspect the current diff. The loop will not auto-revert security/database-sensitive work."]' "$run_dir"
      exit 6
    fi
    if ! assert_no_secret_leakage "$run_dir/diff.full.patch"; then
      write_human_gate "$GUARD_ERROR" \
        '["Inspect the current diff. The loop will not auto-revert security-sensitive work."]' "$run_dir"
      exit 6
    fi
    if ! assert_project_import_rules "$(get_changed_files)"; then
      write_human_gate "$GUARD_ERROR" \
        '["Inspect the current diff. A project boundary rule was violated."]' "$run_dir"
      exit 6
    fi
    if ! assert_layering_rules; then
      write_human_gate "$GUARD_ERROR" \
        '["Inspect the current diff. Only the authorized execution layer may reach NoktosClient."]' "$run_dir"
      exit 6
    fi

    write_step "Running deterministic no-test verification..."
    "$VERIFY_SCRIPT" --run-dir "$run_dir"
    verification_exit=$?

    review_prompt_file="$run_dir/reviewer.attempt-$attempt.prompt.txt"
    {
      cat "$REVIEW_PROMPT"
      echo
      echo "CURRENT TASK PACKET:"
      echo "$task_packet"
      echo
      echo "PRECOMPUTED REVIEW DIFF (authoritative, generated by the harness):"
      echo "$diff_patch"
      echo
      echo "DETERMINISTIC VERIFICATION OUTPUT:"
      echo "$run_dir/verification.txt"
      echo
      echo "ATTEMPT:"
      echo "$attempt"
    } > "$review_prompt_file"

    review_out="$run_dir/review.attempt-$attempt.json"
    if ! invoke_agent "reviewer" "$REVIEW_PROVIDER" "read-only" \
         "$review_prompt_file" "$REVIEW_SCHEMA" "$run_dir" "$review_out"; then
      die "Reviewer invocation failed on attempt $attempt. See $run_dir"
    fi

    verdict="$(jq_run -r '.verdict // ""' "$review_out")"

    if [ "$verdict" = "approve" ] && [ "$verification_exit" -eq 0 ]; then
      approve_and_commit "$task_file" "$review_out" "$REVIEW_PROVIDER" "$REVIEW_SLOT"
      clear_pinned_reviewer
      approved=1
      break
    fi

    if [ "$verdict" = "human_gate" ]; then
      write_human_gate "$(jq_run -r '.summary // ""' "$review_out")" \
        "$(jq_run -c '.questions // []' "$review_out")" "$run_dir"
      exit 7
    fi

    review_feedback_path="$review_out"
    if [ "$verification_exit" -ne 0 ]; then
      echo "" >> "$review_feedback_path"
      echo "DETERMINISTIC VERIFICATION FAILED. Read verification.txt and fix build/prisma validation issues." >> "$review_feedback_path"
    fi
    write_step "Changes requested or deterministic verification failed."

    attempt=$(( attempt + 1 ))
  done

  if [ "$approved" -ne 1 ]; then
    write_human_gate "Task $task_id did not pass after $MAX_ATTEMPTS_PER_TASK attempts." \
      '["Inspect diff, verification.txt and reviewer findings; fix manually or revise task/architecture."]' "$run_dir"
    exit 8
  fi

  assert_clean_worktree
  iteration=$(( iteration + 1 ))
done

write_batch_boundary "$(( iteration - 1 ))" "$RUNS_ROOT"
exit 9
