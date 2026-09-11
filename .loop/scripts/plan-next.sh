#!/usr/bin/env bash
# Architect-only run: produces one task packet and stops before any code is written.
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/loop.sh" --max-iterations 1 --plan-only "$@"
