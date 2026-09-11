# HANDOFF — noktos-agent-backend

## 1. Repository state

- **repo**: `noktos-agent-backend`, beside `noktos-agent-frontend` and `noktos-auth` under a
  plain `noktos/` folder that is NOT a git repository
- **branch**: `loop/agent-backend`
- **HEAD**: the docs commit that adds this file, sitting directly on top of `c5949dd`
  (`feat(loop): formalize host-side dependency provisioning`), which is the last substantive
  commit. A handoff cannot contain its own hash; verify with `git log --oneline -2`.
- **remote**: `origin` → `https://github.com/luiscastaneda-tos/agback.git`
- **last confirmed push**: `c5949dd` was pushed and in sync; this handoff commit is pushed
  immediately after it. Verify with `git status -sb`.
- **expected `git status`**: clean. `node_modules/` exists and is gitignored.
- **`.loop/HUMAN_GATE.md` EXISTS and is intentional.** See section 6. Do not delete it before
  the blocker is understood.

## 2. Purpose

Backend of an observable multi-agent demo: a Supervisor agent plus a specialized
HotelSearchAgent, asynchronous tasks, an SSE event stream, and human-in-the-loop approvals.
NestJS + TypeScript, entirely in memory for V1.

Its defining property is a structural execution chokepoint: no agent, tool definition or LLM
output can cause a side effect directly. It reaches Noktos through an explicitly labelled
mock; `noktos-auth` exposes no public controllers yet.

## 3. Frozen architecture / decisions

Full text in `.loop/ARCHITECTURE_DECISIONS.md` (D-001..D-018, plus OPEN Q-001..Q-003).
Operational effect of the ones that constrain future work:

- **D-002 execution chokepoint**: the only path to a side effect is
  `Agent → ToolHandle/inert definition → ToolInvoker → schema validation → PolicyEngine →
  ApprovalEngine → ExecutorRegistry → Executor → NoktosClient`. A tool definition is DATA: it
  carries an `executorKey` **string**, never a callable. Enforced by the layering guard, not
  by prompt text.
- **D-003**: Policy V1 is frozen and the PolicyEngine default is `FORBIDDEN`. An action
  without a declared policy cannot run.
- **D-004**: no test suite in this loop. Build + full-tree layering check are the gates.
- **D-005/D-006/D-007**: approvals are their own entity, bound by `payloadHash`, single-use,
  with a TTL; a payload mismatch supersedes instead of silently passing.
- **D-009**: the Supabase token is exchanged at the HTTP boundary for an opaque
  `authContextId`. Tasks carry only that id. No refresh tokens. Expiry yields
  `AUTH_CONTEXT_EXPIRED`.
- **D-012**: everything in memory; a restart loses all state.
- **D-016**: the Noktos integration is mocked.
- **D-017**: `contracts/` is frozen at **1.0.0** and is a PROTECTED path. It is vendored into
  the frontend and verified there by hash. Changing it is a human operation across both repos.
- **D-018 — governs BE-007**: verify Supabase JWTs **locally against JWKS**, with no
  per-request call to the Supabase Auth endpoint. Configuration is exclusively non-secret:
  `SUPABASE_JWKS_URL`, `SUPABASE_JWT_ISSUER`, `SUPABASE_JWT_AUDIENCE`. No API key, no anon
  key, and **never the shared `JWT_SECRET`**. Required checks: signature against JWKS, exact
  issuer, exact audience, valid `exp`, non-empty `sub`. Every failure mode fails closed and
  creates no AuthContext; unsigned JWTs are never accepted. Local JWKS applies only if the
  Supabase project uses asymmetric signing keys — if that cannot be confirmed, raise a
  HUMAN_GATE rather than falling back silently. Verification sits behind an
  **`AuthTokenVerifier`** interface so a server-side strategy can later replace
  `JwksTokenVerifier` without touching tasks, SSE, approvals or executors. The AuthContext
  retains `userId`, `accessToken` and `expiresAt` in process memory only, until expiry,
  because executors must call Noktos on behalf of the user; the token crosses the auth
  boundary only inside an ephemeral `ExecutionContext`.

OPEN — escalate, never invent: Q-001 durable persistence/retention, Q-002 real Noktos
integration, Q-003 role-based approval.

## 4. Completed work

Six tasks, each approved by an independent reviewer and committed by the harness.
`.loop/STATE.json` shows `blocked_tasks: []` and `last_review: approve`.

| Task | Result | Commit |
| --- | --- | --- |
| BE-000-01 | Bootstrap the minimal NestJS application skeleton | `a882930` |
| BE-001-01 | Add validated runtime configuration boundary | `b62a829` |
| BE-002-01 | Implement conversation model and in-memory store | `5f180d3` |
| BE-003-01 | Add the in-memory operational event bus | `141aee6` |
| BE-004-01 | Enforce event payload redaction at publication | `b04b608` |
| BE-006-01 | Add the in-memory task queue and lifecycle | `125609d` |

Harness commits on the same branch: `ddec357` init, `bbf1947` retarget inherited role
prompts, `958e095` record D-018, `c5949dd` dependency provisioning.

**BE-005 (SSE endpoint with resumable stream) is not blocked** — the Architect simply has not
selected it yet, and `blocked_tasks` is empty. The backlog holds 27 items.

## 5. Current / pending work

**BE-007 — Supabase auth context boundary — PENDING.**

Two attempts were made; both were discarded and neither reached a commit. The second reached
the reviewer, received changes_requested, and the follow-up attempt stopped on the dependency
blocker in section 6. **No product code from either attempt survives**; the worktree is clean
at `c5949dd`.

The next attempt must start from the clean repo with a **fresh Architect, Implementer and
Reviewer**. Do not reuse either discarded diff.

Authorized dependency for this task: **`jose`** — the Architect emitted
`allowed_dependencies: ["jose"]`, verified in `.loop/runs/20260911-134800-001/task.json`.

## 6. Known blockers / incidents

### BLOCKER — BE-007 dependency install fails with EINTEGRITY

- **Symptom**: the implementer sandbox cannot reach the npm registry (`EACCES`) and cannot
  read the user npm cache (`EPERM`), so `jose` never installs and compilation fails with
  `TS2307`. Host-side provisioning then ran, reached the host `npm install`, and that **also
  failed**: `npm error code EINTEGRITY — wanted sha512-CHYbu8Rt… but got sha512-s+3Al/p9g…
  (72963 bytes)`, preceded by `tarball data for jose@…jose-5.10.0.tgz seems to be corrupted.
  Trying again.`
- **Diagnosis**: the implementer generated `package-lock.json` **offline**, writing an
  integrity hash it had no way to verify. The tarball the registry actually returns does not
  match it. That lockfile is not trustworthy. This is **not** a nonexistent package and
  **not** a wrong version.
- **The provisioning mechanism behaved correctly.** It verified the baseline, detected the
  missing dependency, confirmed both authorizations, checked that `package.json` changed only
  inside dependency sections, preserved evidence, attempted the host install, and then
  **refused** rather than installing something whose integrity check failed. An integrity
  mismatch is exactly when an install must not proceed. The gate standing is by design.
- **What NOT to do**: do not hand-edit `package-lock.json`; do not change the `jose` version
  to force an install; do not abandon JWKS; do not add a silent fallback; do not use the
  shared Supabase `JWT_SECRET`; do not reuse a discarded diff.
- **Agreed recovery**: rerun BE-007 fresh and let a new Implementer declare and lock `jose`.
  If the host install fails with `EINTEGRITY` again, treat it as a real dependency-resolution
  problem to solve deliberately — for example by letting the host generate the lockfile
  first — never by patching files by hand.
- **Evidence, still present**: `.loop/runs/20260911-134800-001/` — `provisioning.txt` with the
  full npm output, plus `package.json`, `package-lock.json`, `package.json.head`, `task.json`,
  `HUMAN_GATE.md`, `diff.patch`, `worker.attempt-1.json`, `worker.attempt-2.json`.
- `.loop/HUMAN_GATE.md` at the repo root corresponds to this incident.

### Context — this was the third dependency block
BE-000-01 here and FE-000 in the frontend were both recovered by hand before the mechanism
existed. That recurrence is why provisioning was formalized. `node_modules/` currently holds
97 top-level packages and **`jose` is absent**.

### Root cause never fixed
The Codex sandbox has no network and no access to the user npm cache. On Windows it needs an
elevated backend for permission profiles. Everything above is mitigation, not a cure.

## 7. Harness state

- **How to run**: `./.loop/scripts/loop.sh --max-iterations N --max-attempts 2` from the repo
  root, in bash. Never use `plan-next.sh` during normal operation.
- **Providers**: Architect = Codex (read-only), Implementer = Codex (workspace-write, not
  configurable), Reviewer = Codex (read-only, rotating slot). `CLAUDE_REVIEW_EVERY=0`;
  changing it is a human decision. Claude orchestrates and never writes product code.
- **Every role gets a fresh, independent session.** Never reuse a Codex conversation across
  roles or tasks.
- **Exit codes are instructions**: 0 complete · 1 fatal · 2 architect gate · 3 architect
  blocked · 4 implementer committed (forbidden) · 5 implementer gate · 6 guard violation
  (**do NOT auto-revert; a human inspects the diff**) · 7 reviewer gate · 8 failed after all
  attempts · 9 batch boundary (**not a gate**) · 10 provider CLI missing.
- **Guards**, all `exit 6`: G1 secret leakage; G2 LLM SDK imports only under `src/llm/`;
  G3 layering via `.loop/scripts/check-layering.sh` (both `--changed` and full-tree share one
  rule engine); G4 `process.env` only under `src/config/`; G6 no `reasoning` /
  `chainOfThought` / `scratchpad` fields. Plus scope enforcement against the task packet's
  `allowed_paths`.
- **PROTECTED_PATHS**: `.loop/GOAL.md`, `ARCHITECTURE_DECISIONS.md`, `CONTRACTS.md`,
  `BACKLOG.yaml`, `STATE.json`, `.loop/prompts/`, `.loop/schemas/`, `.loop/scripts/`,
  `CLAUDE.md`, `AGENTS.md`, `.gitattributes`, `contracts/`. An implementer can never edit the
  rules that govern it.
- **Deterministic verify**: `.loop/scripts/verify.sh` runs `npm run build --if-present` plus
  the full-tree layering check. No tests, per D-004.
- **Dependency provisioning** — `.loop/scripts/provision-dependencies.sh`, wired into
  `loop.sh` at the exit-5 site, flag `PROVISION_DEPENDENCIES=1`. When an implementer gates and
  a declared dependency is missing from `node_modules`, the **host** — never Codex — installs
  it, the entire unapproved diff is then discarded, and the task is retried once with fresh
  agents. A package is installed only when **two independent authorizations** hold: the
  Architect listed it in the task packet's `allowed_dependencies` **and** the Implementer
  declared it in `package.json`. `package.json` cannot authorize itself, because it comes from
  unreviewed work. Other locks: `npm install` with no package arguments; `--ignore-scripts`,
  never relaxed automatically (a dependency needing lifecycle scripts must escalate to
  HUMAN_GATE); at most one provision per task; `package.json` may not change outside
  `dependencies`/`devDependencies`; HEAD identical before and after; the worktree must be
  provably clean before any deletion and completely clean before the rerun. If the host
  install also fails, the problem is real and the gate stands.
- **`allowed_dependencies` is required** on every task packet
  (`.loop/schemas/architect.schema.json`); `[]` means none authorized.
- **`.loop/MAX_ITERATIONS_REACHED.md` is not a gate** — it is a receipt from a batch that spent
  its budget, and the harness deletes it at the start of the next batch.

## 8. Local environment assumptions

- Node **v22.15.0**, npm **10.9.2** — observed on the machine that produced this handoff.
- `bash` (Git Bash / MSYS on Windows). Loop scripts are LF-only, enforced by `.gitattributes`.
- `jq` on PATH. `loop.sh` normalizes jq output across platforms through `jq_run`.
- `codex` CLI installed and authenticated (codex-cli 0.153.0 at the time of writing).
- `node_modules/` is **not** in git. On a fresh clone, run `npm install` on the host before
  starting the loop, or the first task will gate on dependencies.
- Expected non-secret env var names, documented in `.env.example` with no real values:
  `PORT`, `LLM_PROVIDER`, `LLM_MODEL`, `APPROVAL_TTL_MS`, `NOKTOS_BASE_URL`.
  BE-007 will add `SUPABASE_JWKS_URL`, `SUPABASE_JWT_ISSUER`, `SUPABASE_JWT_AUDIENCE`.
- No secrets belong in this repo. The frontend's anon key and the backend's JWKS settings are
  all non-secret; a `service_role` key or the shared `JWT_SECRET` must never appear.

## 9. First steps when resuming

```bash
git status                    # expect clean
git branch --show-current     # expect loop/agent-backend
git log --oneline -2          # expect: docs handoff commit, then c5949dd
git remote -v                 # expect origin -> .../agback.git
git log --oneline -3
ls .loop/HUMAN_GATE.md        # expect PRESENT (the EINTEGRITY blocker)
cat .loop/STATE.json          # expect 6 completed, blocked_tasks: []
ls node_modules/jose          # expect ABSENT
```

If all of that matches, this handoff is still valid. Then:

1. Read section 6 and decide how to get `jose` installed, respecting "what NOT to do".
2. Once `jose` installs cleanly on the host, delete `.loop/HUMAN_GATE.md` and run
   `./.loop/scripts/loop.sh --max-iterations 1 --max-attempts 2` so BE-007 restarts with fresh
   agents.
3. If anything does not match, stop and reconcile before touching the loop.

## 10. Stop conditions

Do not continue automatically on any of these:

- a real `HUMAN_GATE` — a decision is genuinely missing
- worktree unexpectedly dirty
- HEAD is not the handoff commit on top of `c5949dd`, with no explanation in the log
- contract drift — anything under `contracts/` differing from 1.0.0
- any guard failure (`exit 6`) — do not auto-revert, inspect the diff
- dependency provisioning refused, or a dependency absent from `allowed_dependencies`
- an architectural change would be required, or an OPEN question (Q-001..Q-003) blocks progress
- `READY_FOR_HUMAN_REVIEW`

`exit 9` on its own is **not** a stop condition.

## 11. Important files

Read in this order:

1. `HANDOFF.md` — this file
2. `.loop/GOAL.md`
3. `.loop/ARCHITECTURE_DECISIONS.md` — especially D-018
4. `.loop/STATE.json`
5. `.loop/BACKLOG.yaml`
6. `.loop/HUMAN_GATE.md`
7. `.loop/runs/20260911-134800-001/provisioning.txt` — the EINTEGRITY evidence
8. `CLAUDE.md` and `AGENTS.md` — the supervisor contract
9. `.loop/scripts/provision-dependencies.sh` — the provisioning rules
10. `contracts/` — shared with the frontend, frozen at 1.0.0

## 12. One-screen resume summary

```text
STATUS:      6 tasks approved and pushed; BE-007 blocked on a dependency install
BRANCH:      loop/agent-backend
HEAD:        docs handoff commit on top of c5949dd (both pushed)
COMPLETED:   BE-000-01, BE-001-01, BE-002-01, BE-003-01, BE-004-01, BE-006-01
PENDING:     BE-007 Supabase auth context boundary - restart fresh, nothing is reusable
BLOCKER:     host npm install of jose fails with EINTEGRITY. The offline-generated
             package-lock.json carried an integrity hash the implementer could not verify.
             Provisioning correctly refused to install. The gate is present on purpose.
NEXT ACTION: get jose installed on the host without hand-editing files, delete
             .loop/HUMAN_GATE.md, then run
             ./.loop/scripts/loop.sh --max-iterations 1 --max-attempts 2
DO NOT:      hand-edit package-lock.json; change the jose version to force it; abandon JWKS;
             add a silent fallback; use the shared Supabase JWT_SECRET; reuse a discarded
             diff; write product code as the supervisor; push without approval
```
