#!/usr/bin/env bash
# Noktos Auth engineering loop - V3 configuration
#
# This file lives under .loop/scripts/ on purpose: that directory is in the
# protected-path list enforced by loop.sh, so loop agents cannot rewrite their
# own provider/sandbox policy.
#
# Precedence: loop.sh CLI flags > environment variables > these defaults.
# Every assignment below uses := so an exported env var always wins.

# ---------------------------------------------------------------------------
# Reviewer provider rotation
# ---------------------------------------------------------------------------
# CLAUDE_REVIEW_EVERY = every Nth task is reviewed by Claude instead of Codex.
#   0 -> Claude is never selected (rotation counter still advances).
#   1 -> every task is reviewed by Claude.
#   4 -> codex, codex, codex, claude, codex, codex, codex, claude, ...
# Default is 0: the Claude CLI is not required to run this harness.
: "${CLAUDE_REVIEW_EVERY:=0}"

# REVIEWER_MODE = rotate | codex | claude
#   rotate -> consume a rotation slot per task and apply CLAUDE_REVIEW_EVERY
#   codex  -> always Codex, no slot consumed
#   claude -> always Claude, no slot consumed
: "${REVIEWER_MODE:=rotate}"

# ---------------------------------------------------------------------------
# Providers per role
# ---------------------------------------------------------------------------
# The implementer provider is deliberately NOT configurable. Claude must never
# implement code; loop.sh hard-codes codex and invoke_agent enforces it.
: "${ARCHITECT_PROVIDER:=codex}"

# ---------------------------------------------------------------------------
# CLI binaries (never installed automatically)
# ---------------------------------------------------------------------------
: "${CODEX_BIN:=codex}"
: "${CLAUDE_BIN:=claude}"

# ---------------------------------------------------------------------------
# Model / budget knobs
# ---------------------------------------------------------------------------
: "${CODEX_MODEL:=}"
: "${CLAUDE_MODEL:=}"
: "${CLAUDE_MAX_TURNS:=6}"
: "${CLAUDE_MAX_BUDGET_USD:=0}"

# ---------------------------------------------------------------------------
# Harness behaviour
# ---------------------------------------------------------------------------
: "${MAX_ITERATIONS:=20}"
: "${MAX_ATTEMPTS_PER_TASK:=2}"

# Upper bound on lines written into the precomputed diff.patch handed to the
# reviewer. Keeps a runaway diff from burning the review budget.
: "${DIFF_MAX_LINES:=4000}"

# Host-side dependency provisioning. When an implementer gates because the
# sandbox cannot install a package the Architect authorised, the host installs
# it, discards the unapproved diff and the task is retried once with fresh
# agents. Set to 0 to disable and surface every dependency gate to a human.
PROVISION_DEPENDENCIES=${PROVISION_DEPENDENCIES:-1}
