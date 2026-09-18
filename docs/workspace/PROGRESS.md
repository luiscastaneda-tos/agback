# Noktos Agent Progress

> [!IMPORTANT]
> **This is the CANONICAL, git-tracked copy of cross-repo Noktos progress tracking.**
> It coordinates **four** repositories: `noktos-auth`, `noktos-agent-backend` (this repo),
> `noktos-agent-frontend`, and the future `noktos-agent-next` (V2 frontend, not created
> yet). **Its location inside `noktos-agent-backend` is purely for git
> persistence/continuity** — this repo already exists, is already a git remote, and
> already had a `docs/` directory. **The decisions recorded here do not belong
> exclusively to the backend**; treat this document as workspace-level, not
> backend-scoped, even though it happens to live in this repo's git history.
>
> A **local convenience copy** also exists at `../PROGRESS.md` (workspace root, which is
> **not** a git repository and cannot version this file). If the two ever diverge, **this
> copy — the one you are reading now — is authoritative.** The root copy should be
> resynced from this one, not the other way around.
>
> Companion file: `HANDOFF.md` in this same directory (workspace-level index, distinct
> from this repo's own root `HANDOFF.md`, which covers `noktos-agent-backend` only).

It exists because `P-xxx` product/progress decisions span four independent repos
(`noktos-auth`, `noktos-agent-backend`, `noktos-agent-frontend`, and the future
`noktos-agent-next`), each with its own `.loop/ARCHITECTURE_DECISIONS.md` (`D-xxx`/`Q-xxx`,
repo-scoped). No existing per-repo mechanism covers cross-repo product sequencing, so this
file is that mechanism. It does **not** replace any repo's `HANDOFF.md` or
`ARCHITECTURE_DECISIONS.md` — it indexes and cross-references them.

## How to read this file

Every claim below is tagged. Do not blur these categories:

- **FACT** — verifiable directly from code/config, not a claim about behavior.
- **DECISION** — a human chose this. Binding until a human changes it.
- **VALIDATED** — a human actually observed this behavior happen, with a specific method.
- **ASSUMPTION** — believed true, not verified.
- **PENDING** — known, unresolved, needs a human decision before proceeding.
- **DEFERRED** — deliberately not doing this now; not forgotten.

> **Rule: do not silently reinterpret accepted decisions.** If a proposed implementation
> conflicts with an accepted `P-xxx` or `D-xxx`, surface the conflict explicitly and stop —
> do not quietly pick the interpretation that's easiest to implement.

---

## Current phase

**V2-A Demo Milestone COMPLETE.**
Real OpenAI LLM integration (`OpenAiLlmProvider`), natural-language hotel delegation to `HotelSearchAgent`, 3 consistent Cancún mock hotels in `MockNoktosClient`, deterministic `demo:*` fallback, human approvals chokepoint, and simple agent activity visualization in `noktos-agent-next` (Next.js 16 Turbopack) are all implemented, tested, and verified.

**2026-09-18 — Multi-turn conversation memory added (post V2-A, "Noktos Agent Workspace" north star, Priority 1).**
`noktos-agent-backend` now carries a process-local `ConversationMemoryStore` (`src/memory/`),
keyed strictly by `conversationId`: bounded recent message history (last 16 turns) plus the last
validated structured hotel search (destination, criteria, hotels — captured directly from
`MockNoktosClient`'s tool output, never from LLM-generated text). `SupervisorAgent` now grounds
follow-ups like *"¿cuál es el más barato?"* / *"¿cuál está más cerca de la playa?"* in that stored
data instead of re-delegating or inventing hotels. No `contracts/`, frontend, or execution-chokepoint
changes; no new dependencies; `demo:*` and the approval flow (cart/confirm/cancel) are unaffected
— see commit `30b400c` on `loop/agent-backend` and `scripts/test-conversation-memory.mjs`.

**Process note:** this change was implemented via a directly-invoked Codex CLI session
(`codex exec --sandbox workspace-write`, scoped prompt from the Claude Code supervisor session),
**not** through the `.loop/loop.sh` harness. `.loop/loop.sh` refuses to start
(`.loop/HUMAN_GATE.md exists`) because of a stale, never-committed gate file from 2026-09-11 (an
npm/jose dependency-provisioning gate that predates 50+ since-approved tasks and several
since-shipped features — clearly resolved in substance, confirmed via `git log` showing this repo
reached `READY_FOR_HUMAN_REVIEW` and shipped V2-A well after that gate's timestamp). The sandbox
policy blocked the supervisor session from deleting or moving that file. **By explicit human
instruction, `.loop/HUMAN_GATE.md` was left untouched** as historical evidence rather than cleared;
a human should delete it (or formally record its resolution per its own "Continue" steps) before
the `.loop/` harness is used again for this repo.

## Repo map

| Repo | Path | Role | State |
|---|---|---|---|
| `noktos-auth` | `noktos-auth/` | Identity gateway (Supabase → `Principal`, API keys, future Core JWT boundary). No public HTTP routes yet. | `READY_FOR_HUMAN_REVIEW`, 29/29 tasks, no HUMAN_GATE |
| `noktos-agent-backend` | `noktos-agent-backend/` | NestJS multi-agent runtime: SupervisorAgent, HotelSearchAgent, execution chokepoint, approvals, SSE. | **V2-A COMPLETE & PUSHED (`loop/agent-backend`)**. OpenAiLlmProvider with structured tool routing, mock grounding, deterministic fallback. |
| `noktos-agent-frontend` | `noktos-agent-frontend/` | React + Vite chat/task/approval UI, consumes backend contract 1.0.0. **Frozen as V1 baseline per P-001** — no further feature work goes here. | `READY_FOR_HUMAN_REVIEW`, 46/46 tasks, no HUMAN_GATE |
| `noktos-agent-next` | `noktos-agent-next/` | V2 chat/task/approval/activity UI. Talks directly to `noktos-agent-backend` (`P-001`). | **V2-A COMPLETE & PUSHED (`main` → `AngelCstd/next_agent`)**. Next.js 16 (Turbopack), contract locked v1.0.0, SSE client, simple agent activity visualization, contextual approvals. |

Each repo has its own `CLAUDE.md`/`AGENTS.md`: **Claude Code is Supervisor only in every one
of them — never the implementer of product code.** Product code changes go through each
repo's `.loop/` harness (Codex architect/implementer/reviewer), or are made by a human. This
document does not change that; V2 implementation must go through the same governance.

## Current baseline (FACT)

- Backend: NestJS, in-memory stores, `DemoScriptedLlmProvider` (deterministic, zero real
  inference — see `noktos-agent-backend/docs/demo-provider.md`), `MockNoktosClient`
  (explicitly labelled mock). Execution chokepoint enforced mechanically by
  `.loop/scripts/check-layering.sh` (fails closed): `Agent → ToolInvoker → schema validation
  → PolicyEngine → ApprovalEngine → ExecutorRegistry → Executor → NoktosClient`.
- Frontend: React 18 + Vite 5 + TypeScript, Clean Architecture + Atomic Design, contracts
  vendored read-only into `src/contracts/` and byte-verified against `contracts.lock`
  (`npm run verify:contracts`). Session is memory-only (`persistSession: false`,
  `autoRefreshToken: false`); reload requires re-login.
- Auth: NestJS + Prisma, Supabase token verification → `Principal`, API-key infrastructure.
  **No public HTTP controllers exist.** Never connected to a real database. No automated
  tests (`D-017` in that repo, explicit cost decision).
- Contracts: `contracts/` in `noktos-agent-backend`, version **1.0.0**, frozen. Frontend
  copy verified byte-for-byte. Changing it is a human operation across both repos (`D-017`
  backend).
- Noktos Core (the actual travel-booking backend the whole system exists to front) **does
  not exist as a service anywhere in this workspace.** `noktos-auth/CLAUDE.md`: *"Web /
  Partner / MCP → NOKTOS AUTH → (future) NOKTOS CORE... Core does not exist yet."*

---

## Human validation completed (VALIDATED)

Everything below was observed by a human during this review session, in a real browser
against a running backend. Nothing here is inferred or assumed.

| # | What was validated | Method |
|---|---|---|
| 1 | Authenticated browser flow: frontend → backend, login through workspace | Manual browser session |
| 2 | SSE live: frontend receives events over the stream | Manual browser session |
| 3 | `demo:greeting` happy path: `POST /messages` accepted → task created → `SupervisorAgent` completed → frontend projected a response from the task snapshot | Manual, via demo-provider scripted scenario |
| 4 | Delegation: `demo:hotel-delegation` → `SupervisorAgent` creates child task → `HotelSearchAgent` runs `demo:hotel-search` → both tasks reach `completed`; parent/child relationship holds | Manual |
| 5 | Hotel mock invoked: `[MOCK] Noktos hotel search adapter invoked.` observed in logs | Manual, log inspection |
| 6 | Approval — Approve path: `demo:add-reservation-to-cart` → approval visible → decision `approved` → task resumed → `[MOCK] Noktos cart adapter invoked.` observed | Manual |
| 7 | Approval — Reject path: same scenario → decision `rejected` → task did not resume execution → **no** additional cart-adapter invocation observed attributable to the rejection | Manual |
| 8 | `HttpTransport` fetch-receiver bug found, root-caused, fixed, and regression-tested (see below) | Manual + Claude-assisted diagnosis this session |
| 9 | Dev-mode duplicate `POST /conversations` (two conversations created) in `vite` dev server | Manual, Network tab |
| 10 | Single `POST /conversations` in a production preview build (`vite build` + `vite preview`) | Manual, Network tab |

**Not yet validated** (see *Known V1 limitations* and *Current risks* — do not assume these
pass):
- Approval expiry/TTL behavior
- Approval `superseded` outcome
- Second-user / non-owner approval-decision rejection
- SSE reconnect/gap-repair exhaustive scenarios (only basic reconnect logic exists per code read, not exercised end-to-end)
- Idempotency-key retry exhaustive scenarios
- `noktos-auth` — nothing was run: no DB connection ever made, no HTTP request ever sent, no automated test ever executed (per that repo's own `HANDOFF.md`)
- Any security/production-readiness claim for any of the three repos

## Known V1 limitations (FACT, carried forward from each repo's own docs)

- Everything in-memory in all three repos where applicable; a process restart loses all
  state (backend: conversations/tasks/approvals/event buffers; frontend: session).
  Backend `D-012`.
- No real Noktos integration anywhere (`MockNoktosClient`, backend `D-016`). No real LLM
  anywhere (`DemoScriptedLlmProvider`, backend `D-021`).
- `noktos-auth` has no public controllers and has never been connected to a live database
  or exercised end-to-end (that repo's own `HANDOFF.md` §2).
- Noktos Core itself does not exist as a service (see *Current risks*).
- No automated test suite in any of the three loops (each repo's own `D-004`/`D-003`/`D-017`
  — explicit cost decisions, not oversights).
- Frontend session is memory-only by design (`D-004` frontend); reload forces re-login.
  **Confirmed non-priority for V2 by `P-005`.**
- V1 UI shows internal IDs (task/parent/conversation IDs, sequences) as primary UX.
  **Addressed by `P-006`/`P-012` for V2/V3.**
- Frontend chat currently surfaces `task.result.summary` (an administrative sentence, e.g.
  *"Supervisor answered the request."*) rather than the more natural text the backend
  already produces. See **Assistant response projection** below — this is scoped for V2 but
  requires a decision before implementation.
- Root workspace `HANDOFF.md` (this file's sibling) was stale prior to this session — it
  described backend as "6 tasks approved; blocked" and frontend as "5 tasks approved" when
  both had long since reached 63/63 and 46/46, `READY_FOR_HUMAN_REVIEW`. Corrected in this
  session; treat the **per-repo** `HANDOFF.md` as authoritative going forward, per that
  file's own stated policy.

## Bugs fixed during human review

### `HttpTransport` fetch-implementation receiver binding (frontend)

- **Symptom:** after login, all panels showed "could not be initialized"; zero `POST
  /conversations` requests reached the network; no console error (app has no `console.*`
  calls anywhere in `src/`, confirmed by repo-wide grep).
- **Diagnosis path (VALIDATED, not assumed):** ruled out env parsing, CORS/preflight
  (confirmed correct via direct `curl` against the real running backend from both
  `http://localhost:5173` and `http://127.0.0.1:5173` origins), stale build, duplicate
  processes, and RequestInit shape (replayed the exact `RequestInit` via Node's native
  `fetch` — succeeded). Added temporary diagnostic `console.error` in
  `useChatSession.ts`, which surfaced `HttpTransportError { code: 'network-failure' }`. User
  reproduced the exact mechanism directly in Chrome DevTools: a detached `fetch` reference
  invoked as a method throws `TypeError: Failed to execute 'fetch' on 'Window': Illegal
  invocation`.
- **Root cause:** [`HttpTransport.ts`](noktos-agent-frontend/src/infrastructure/api/HttpTransport.ts)
  stored `this.fetchImplementation = options.fetch ?? globalThis.fetch` (an unbound native
  method reference), then called it as `this.fetchImplementation(...)` — native `fetch`
  requires `window`/`globalThis` as its receiver; invoking it as a method on the
  `HttpTransport` instance passes the wrong receiver.
- **Fix:** `this.fetchImplementation = options.fetch ?? globalThis.fetch.bind(globalThis);`
- **Regression test added:** `noktos-agent-frontend/scripts/test-http-transport-fetch-binding.mjs`
  (`npm test`). No new dependency — uses `vite`'s programmatic `ssrLoadModule` (already a
  devDependency) to load the real TypeScript source, and a mock `fetch` that reproduces
  native fetch's receiver brand-check (Node's own global `fetch` does **not** enforce this
  check, so it can't catch the regression on its own — verified directly). **Verified the
  test fails against the pre-fix code** (temporarily reverted, ran, confirmed the exact
  `Illegal invocation` failure, then restored the fix) before accepting it as meaningful.
- **Post-fix validation:** `npm test` PASS, `npm run verify:contracts` OK, `npm run build`
  (contracts + `tsc` + `vite build`) clean, zero `console.*` left in `src/`.
- **Explicitly not touched:** auth, Supabase behavior, session persistence, backend CORS,
  contracts, SSE architecture.
- **Not yet committed.** Working tree has uncommitted changes in
  `noktos-agent-frontend/src/infrastructure/api/HttpTransport.ts`,
  `noktos-agent-frontend/src/presentation/hooks/useChatSession.ts` (temp instrumentation
  added then removed — net no-op vs. HEAD), `noktos-agent-frontend/package.json` (new `test`
  script), and the new test file.

### Dev-mode duplicate `POST /conversations` (observed, not a bug fix)

Two `POST /conversations` requests, two distinct conversations, observed under `vite`
**dev** server. A single production `vite build` + `vite preview` produced exactly one.
This is consistent with React 18 `StrictMode`'s deliberate double-invoke of effects in
development only (`noktos-agent-frontend/src/main.tsx` wraps `<App/>` in `<StrictMode>`).
**Not treated as a blocker.** Per explicit instruction: do not remove `StrictMode` just to
hide this. If it matters for V2, the correct fix (if any) belongs in whatever V2 component
owns session bootstrapping, using the same `active`-flag guard pattern the current
`useChatSession` effect already uses.

---

## Accepted product/progress decisions (`P-xxx`)

Numbering: `P-xxx` is a **new, workspace-level** sequence, independent of and never
renumbering any repo's `D-xxx`/`Q-xxx`. Rationale for this scheme (per the human's request
to justify rather than assume): each repo's decision log is scoped to that repo's own
architecture; none of them has a mechanism for a decision that spans repos (e.g. "the
frontend becomes a new Next.js project" is a decision *about* `noktos-agent-frontend` made
*from outside* it, before that repo's own loop would ever see it). `P-xxx` lives here, in
the one place that already sits above all three repos. Where a `P-xxx` is architecturally
binding *inside* a specific repo, a corresponding `D-xxx` has been recorded in that repo's
own `ARCHITECTURE_DECISIONS.md` (cross-referenced below) — `P-xxx` is the product-level
record of *why* and *when*; the repo's `D-xxx` is the enforceable architectural record
inside that repo's own loop.

### P-001 — V2 uses a new Next.js frontend, in a new sibling repository
**Status:** ACCEPTED (DECISION) — **name/location resolved 2026-09-15**
**Decision:** Do not convert the current Vite frontend in place. Create a **new, separate
sibling repository named `noktos-agent-next`**, alongside — not inside — the existing three:
```
noktos-agent-next/        ← NEW, V2 frontend (not created yet)
noktos-agent-frontend/    ← V1 baseline, frozen, kept
noktos-agent-backend/
noktos-auth/
```
The current Vite frontend (`noktos-agent-frontend`) is **frozen** as the V1 functional
baseline and regression reference — no new V2 feature work goes into it. It is **not**
deleted, replaced, or converted now.
**Rationale:** make the framework change now, before the frontend grows further.
**Implications:** Track A (below) targets `noktos-agent-next` once it exists (creating it is
slice A0). Track A never edits `noktos-agent-frontend` except to read it as a migration
reference.
**Explicitly not included:** rewriting the Vite app in place; deleting or archiving
`noktos-agent-frontend` now. **The decision to archive, deprecate, or delete
`noktos-agent-frontend` is explicitly deferred**: it will be made separately, later, only
after `noktos-agent-next` passes the agreed V2-A smoke tests and is stable enough. Do not
pre-empt that decision during V2-A work.
**Formal architecture record:** `noktos-agent-frontend/.loop/ARCHITECTURE_DECISIONS.md`
→ `D-016` (recorded 2026-09-15, amended same day with the resolved repo name — see
*Architecture decisions updated*). `noktos-agent-next` will record its own
`ARCHITECTURE_DECISIONS.md` once created, per `Q-P4` (resolved — see below).

### P-002 — NestJS backend is kept
**Status:** ACCEPTED (DECISION)
**Decision:** No V2 backend rewrite.
**Rationale:** not stated beyond "accepted" — no technical driver for a rewrite surfaced
during inspection either.
**Implications:** Track B works against the existing `noktos-agent-backend` codebase.
**Explicitly not included:** any backend framework change.

### P-003 — Execution chokepoint is preserved
**Status:** ACCEPTED (DECISION)
**Decision:** No LLM, agent, or future framework may execute a Noktos action directly. The
authority path (`ToolInvoker` / `PolicyEngine` / `ApprovalEngine` / `ExecutorRegistry` /
`NoktosClient`, or an explicitly-equivalent evolution) must be preserved.
**Rationale:** this is the single hardest invariant in the backend (`D-002`, enforced
mechanically by `check-layering.sh`, fails closed). It is the whole reason the backend
exists in its current shape.
**Implications:** any future LLM real, LangGraph, or Noktos-real integration is bound by
this without exception — see `P-010`, `P-011`.
**Explicitly not included:** a "trusted caller" exemption, a fast path, or any bypass —
these are explicitly forbidden by backend `AGENTS.md` §2 regardless of what a future
framework's design might prefer.
**Formal architecture record:** already exists as backend `D-002`; no new `D-xxx` needed —
`P-003` is a restatement/confirmation, not a new commitment.

### P-004 — V2 prioritizes functionality over branding
**Status:** ACCEPTED (DECISION)
**Decision:** V2 needs none of: final branding, commercial design system, full visual
polish, production-grade UI. It needs to be clear, usable, and sufficient for a demo.
Branding/design-system/commercial polish are explicitly deferred to V3+.
**Rationale:** stated explicitly — avoid an ambiguous reading of "post-V1" pulling branding
work into V2.
**Implications:** supersedes any inference that frontend `D-015` ("visual design deferred
after V1") implies V2 *must* address it. It does not, until V3+.
**Explicitly not included:** any design-system selection, Tailwind/CSS-framework adoption,
or brand asset work in V2.

### P-005 — Session persistence is not a V2 requirement
**Status:** ACCEPTED (DECISION)
**Decision:** Do not spend V2 time on: remembering login across reloads, sophisticated
auto-refresh, full logout, advanced session recovery. Memory-only session (current V1
behavior) is sufficient for the demo.
**Rationale:** stated explicitly — this is V3+ scope unless a real blocker appears.
**Implications:** the new Next.js frontend can port the current memory-only auth pattern
largely as-is (see Track A slice A3).
**Explicitly not included:** any session-persistence mechanism, `localStorage`/cookie-based
token storage, or logout UI, in V2.

### P-006 — V2 functional scope
**Status:** ACCEPTED (DECISION)
**Decision:** V2 must deliver, at minimum:
- **Chat** — send/receive, natural-looking assistant responses (not just administrative
  summaries), can still use mock/scripted responses.
- **Tasks** — visible per-conversation, agent, status, comprehensible delegation
  relationship, **no technical IDs as primary UX**, Supervisor + specialist agents
  observable.
- **Approvals** — in scope now, not deferred: request visible, understandable preview,
  Approve/Reject, `pending`/`approved`/`rejected` states reflected, contextual-in-chat
  presentation, optional secondary panel, never execute before approval, reject never
  triggers execution.
- **Activity/debug** — a separate technical panel is acceptable, must be visibly distinct
  from the chat experience.
**Rationale:** stated explicitly as "what a functional demo product needs."
**Explicitly not included:** visual perfection (see `P-004`).

### P-007 — Mock-first to accelerate delivery
**Status:** ACCEPTED (DECISION)
**Decision:** The first V2 milestone may run entirely on `DemoScriptedLlmProvider` +
`MockNoktosClient`. Not everything needs solving at once — first, a functional
end-to-end experience.
**Rationale:** stated explicitly.
**Implications:** defines Milestone V2-A (see *V2 scope*).

### P-008 — Frontend and backend tracks run in parallel
**Status:** ACCEPTED (DECISION)
**Decision:** Two work streams (Track A / Track B, defined below) can run simultaneously,
**after** a shared-contract freeze phase (Phase 0). See *Parallel work strategy*.
**Rationale:** stated explicitly — avoid the two tracks independently inventing
incompatible interfaces.
**Implications:** Phase 0 must complete, and be written down, before Track A/B start
concurrently.

### P-009 — Real LLM comes after the Next.js baseline
**Status:** ACCEPTED (DECISION)
**Decision:** After Next + Nest + chat/tasks/approvals work on mock/scripted, add a real
LLM provider behind the existing `LlmProvider` interface (backend `D-010`). Do **not**
remove `DemoScriptedLlmProvider` — keep it for deterministic tests/demos/regression. The
first real-LLM integration may continue using `MockNoktosClient`.
**Rationale:** stated explicitly — isolate "does the AI work" from "does real Noktos work."
**Implications:** defines Milestone V2-B. The `LlmProvider` seam already exists and is
already provider-agnostic (`src/llm/llm-provider.ts`, `src/llm/llm-provider-registry.ts`);
no backend architectural change is required to add a second provider — see the
Claude-API-skill-informed estimate already discussed earlier in this project's history
(a `LlmProvider` implementation is additive, ~150–250 LOC, isolated to `src/llm/`).
**Explicitly not included:** removing or degrading the demo provider; LLM fallback-chain
logic (not requested for V2; if wanted later, it composes cleanly on top of
`LlmProviderRegistry` without new architecture).

### P-010 — LangGraph is deferred
**Status:** ACCEPTED (DECISION)
**Decision:** Do not introduce LangGraph (or LangChain) in the first V2 milestone.
Evaluate after the functional baseline and, preferably, after the first real-LLM
integration. Do not add either "because it's trendy" — only if it demonstrably helps with
Supervisor/specialist orchestration, state, human-approval pause/resume, or multi-step
workflows.
**Rationale:** stated explicitly — the delivery is tomorrow; do not increase risk surface.
**Implications:** if adopted later, it **must not** bypass `ToolInvoker`/`PolicyEngine`
/`ApprovalEngine`/`ExecutorRegistry` (`P-003`/backend `D-002` bind it unconditionally) and
must not become an authority boundary for external actions.
**Explicitly not included:** any LangGraph/LangChain dependency or code in V2-A, V2-B, or
V2-C's "evaluate" step itself (evaluation ≠ adoption).

### P-011 — Real Noktos integration comes later
**Status:** ACCEPTED (DECISION)
**Decision:** UI functional → workflow functional → mock → *then* real LLM. *Then*
`NoktosClient` real, behind its current interface or a compatible evolution. Do not mix
real-Noktos integration into the first Next.js migration.
**Rationale:** stated explicitly.
**⚠️ Technical finding that changes this milestone's shape (reported, not silently
resolved):** "Real Noktos" is blocked by **two** independent gaps, not one:
1. `noktos-auth` exposes no public HTTP controllers yet (already tracked as backend `Q-002`
   / auth's own roadmap).
2. **Noktos Core itself does not exist as a service anywhere in this workspace** —
   `noktos-auth/CLAUDE.md`: *"Web / Partner / MCP → NOKTOS AUTH → (future) NOKTOS
   CORE... Core does not exist yet."* This is a new fact surfaced during this inspection,
   not previously written down at the workspace level.

   This means Milestone V2-D (*Noktos real*) is **not just an integration task** — it is
   gated on a third, currently nonexistent system being designed and built. It should be
   treated as a distinct, larger, separately-scoped effort, likely well beyond "V2," not
   estimated or scheduled here. Flagging this explicitly rather than letting a future
   session assume V2-D is "just wiring."
**Implications:** V2-A/B/C as scoped below do not depend on this. V2-D's real scope needs a
fresh human/architect decision once Core's existence and shape are known.
**Explicitly not included:** any Noktos-real work, or any estimate of when Core will exist.

### P-012 — Branding and session UX go to V3+
**Status:** ACCEPTED (DECISION)
**Decision:** V3+ may cover: branding, design system, commercial polish, logout, session
persistence, better recovery, role-aware UX, formal accessibility, commercial details.
**Rationale:** stated explicitly — do not let these divert tomorrow's V2 milestone.
**Implications:** consistent with `P-004`/`P-005`. Frontend `Q-002` (role-aware UI) and
`Q-003` (accessibility target) remain open in that repo's own log and are **not** V2
requirements.

### P-013 — Demo-First Delivery Priority for V2-A
**Status:** ACCEPTED (DECISION, 2026-09-17)
**Decision:** The priority for V2-A is DEMO-FIRST. The delivery milestone focuses strictly on an end-to-end functional demo for "Busca hoteles en Cancún para dos personas". Non-blocking documentation refinements, complex recovery, and architectural expansion are deferred.
**Rationale:** Meet the immediate delivery deadline with a fully working, observable multi-agent product rather than getting blocked in exhaustive hardening.

### P-014 — Real LLM Scoped Exclusively to OpenAI (`OpenAiLlmProvider`)
**Status:** ACCEPTED (DECISION, 2026-09-17)
**Decision:** The real LLM provider for V2-A is strictly OpenAI using the official `openai` SDK (`openai: ^7.17.0`). No universal multi-vendor abstraction (Anthropic, Gemini, Ollama) is built for this milestone. Extensibility is preserved by implementing the existing `LlmProvider` interface.
**Configuration:** Backend-only via `LLM_PROVIDER=openai`, `OPENAI_API_KEY` (strictly never exposed to frontend or committed), and `OPENAI_MODEL` (defaulting to `gpt-4o-mini`).

### P-015 — Structured Supervisor Intent Routing (Zero Direct Tool Execution by LLM)
**Status:** ACCEPTED (DECISION, 2026-09-17)
**Decision:** The Supervisor produces validated structured intents only (`delegate_to_hotel_search` with destination/goal, direct response, or reservation tools) validated via Zod schemas. OpenAI NEVER executes tools directly.
**Pipeline:** The runtime sovereign pipeline (`SupervisorAgent -> TaskProcessor -> HotelSearchAgent -> ToolInvoker -> PolicyEngine -> ApprovalEngine -> Executor -> MockNoktosClient`) owns all execution. Malformed LLM outputs fail-safe without invoking any tools.

### P-016 — Strict Mock Hotel Grounding & Accent Normalization
**Status:** ACCEPTED (DECISION, 2026-09-17)
**Decision:** All hotel information must originate from `MockNoktosClient` (3 consistent Cancún mock hotels: Mock Resort Cancún Caribe, Mock Cancún Oasis Hotel, Mock Playa Cancún Suites with prices in MXN, currency, and descriptions). Destination matching is accent- and case-insensitive (`normalize('NFD')`).
**Instructions:** The subagent's prompt strictly mandates using ONLY the mock hotel tool results, never inventing hotels/pricing/availability, and presenting them in conversational Spanish.

### P-017 — Simple, Non-CoT Agent Activity Visualization
**Status:** ACCEPTED (DECISION, 2026-09-17)
**Decision:** In `noktos-agent-next`, visualize agent coordination simply and cleanly without technical clutter.
**Visual Steps:**
- `Supervisor — Analizando solicitud...`
- `Agente de hoteles — Buscando hoteles en Cancún...`
- `Agente de hoteles — 3 opciones encontradas`
- `Supervisor — Respuesta preparada`
**Strict Exclusions:** Zero chain-of-thought, zero internal reasoning, zero raw prompts, zero raw JSON, zero UUIDs, and zero auth tokens/secrets in the user-facing view. Displayed inline in chat and in a dedicated "Agentes" sidebar tab.

### P-018 — Deterministic Fallback & Human Approval Preservation
**Status:** ACCEPTED (DECISION, 2026-09-17)
**Decision:** `DemoScriptedLlmProvider` is retained as an unconditional fallback. Queries starting with `demo:` automatically route to the scripted provider. Setting `LLM_PROVIDER=demo-provider` allows immediate offline demo execution. The human approval chokepoint (`demo:add-reservation-to-cart`) remains fully intact with interactive in-chat approval cards and strict idempotency.

---

## Architecture decisions updated (`D-xxx`, per-repo)

Determined which `P-xxx` above are architecturally binding *inside* a specific repo (vs.
purely cross-repo sequencing, which stays in `P-xxx` only, per the human's own allowance).

| New `D-xxx` | Repo | Maps to | What it records |
|---|---|---|---|
| `D-016` | `noktos-agent-frontend` | `P-001` | V2 frontend is a new Next.js project; current Vite app is the frozen V1 baseline, not converted in place. |
| `D-026` | `noktos-agent-backend` | `P-002`, `P-003`, `P-007`, `P-009`, `P-010`, `P-011` | V2 backend is not rewritten; the execution chokepoint (already `D-002`) is unconditionally preserved through any Next.js/real-LLM/LangGraph/Noktos-real integration; milestone sequencing is mock-first. |

**Not added, and why:**
- `noktos-auth` — no `P-xxx` above changes that repo's own architecture. Its existing
  `Q-002` (real Noktos integration depends on public routes) already anticipates this
  territory; nothing new to record there yet.
- `P-004`/`P-005`/`P-006`/`P-008`/`P-012` — product scope/sequencing/process decisions, not
  architectural invariants inside any one repo. Correctly stay as `P-xxx` only, per the
  human's own instruction that priority/product decisions may remain there.

Full text of `D-016` and `D-026` is in each repo's own `.loop/ARCHITECTURE_DECISIONS.md`
(appended, nothing renumbered or removed).

---

## V2 scope

**Milestone V2-A** — Next.js (new) + existing Nest backend + `DemoScriptedLlmProvider` +
`MockNoktosClient` + functional chat + visible tasks + actionable approvals + usable
activity/debug. **This is tomorrow's deliverable target.**

**Milestone V2-B** — real LLM provider behind `LlmProvider`, `DemoScriptedLlmProvider`
retained, `MockNoktosClient` still in place.

**Milestone V2-C** — evaluate LangGraph/LangChain; adopt only if it earns its cost; must
respect `P-003`/`D-002` unconditionally if adopted.

**Milestone V2-D+** — real Noktos integration. Scope TBD pending Noktos Core's own
existence (see `P-011`).

## V2 non-goals (DEFERRED, explicit)

- Branding, commercial design system, visual polish (`P-004`, → V3+)
- Session persistence, logout, advanced recovery (`P-005`, → V3+)
- Role-aware UI, formal accessibility conformance (`P-012`, frontend `Q-002`/`Q-003` → V3+)
- LangGraph/LangChain in V2-A (`P-010`)
- Real Noktos integration in V2-A/B/C (`P-011`)
- Rewriting the backend (`P-002`)
- Converting the Vite frontend in place (`P-001`)

## V3+ deferred work

Branding & design system, commercial polish, logout, session persistence/recovery,
role-aware UX (blocked on `noktos-auth`'s role matrix — that repo's own `Q-001`),
formal accessibility target (frontend `Q-003`), and whatever V2-D's real-Noktos scoping
turns up.

---

## Parallel work strategy

### Phase 0 — shared contract freeze (sequential, blocks Track A/B parallelism)

One session (human or a single Claude/architect session — **not** two agents in parallel)
defines and writes down, before Track A and Track B start concurrently:

1. **Endpoint expectations** for `noktos-agent-next` — almost certainly the *same*
   contract 1.0.0 the Vite frontend already consumes (`POST /conversations`, `POST
   /conversations/:id/messages`, `GET /conversations/:id/tasks`, `GET
   /conversations/:id/approvals`, `POST /approvals/:id/decision`, `GET /agents`, `GET
   /conversations/:id/events` SSE), talked to **directly, with no `noktos-auth` proxy**
   (`Q-P3`, RESOLVED/ACCEPTED). Confirm no new endpoint is needed for V2-A before Track B
   does any backend work.
2. **DTOs** — reuse `contracts/` as-is unless Phase 0 finds a concrete gap.
3. **Assistant response projection** — RESOLVED (`Q-P2`, see dedicated section below):
   defensive `result.data.text` narrowing with `result.summary` fallback, no contract
   change. Phase 0 just needs to confirm the exact narrowing predicate, not the decision
   itself.
4. **Approval flow contract** — already fully specified by contract 1.0.0
   (`ApprovalRequest`, `ApprovalDecision`) and validated end-to-end this session (see
   *Human validation completed* #6–7). Phase 0 should confirm no gap, not redesign it.
5. **Env expectations** — `NEXT_PUBLIC_*` naming for anything the browser needs (backend
   URL, Supabase URL/anon key), mirroring current `VITE_*` vars. No secret ever gets a
   `NEXT_PUBLIC_` prefix.

Output of Phase 0: **COMPLETED.** Canonical interface freeze is recorded in
[`V2_PHASE0_INTERFACE_FREEZE.md`](V2_PHASE0_INTERFACE_FREEZE.md). Both tracks treat this specification
as frozen for the duration of V2-A. Changing it mid-flight requires stopping both tracks, not a unilateral edit by either.


### Track A — Frontend / Next.js

Works in **`noktos-agent-next`** (sibling repo, does not exist yet — creating it is slice
A0). Governance for that new repo: `Q-P4` RESOLVED/ACCEPTED — it gets its own
`CLAUDE.md`/`AGENTS.md`/`.loop`, equivalent to the other three, with Claude Code acting as
supervisor/orchestrator there too, never as the product-code implementer.
**Never edits `noktos-agent-frontend/`** (frozen V1 baseline, `P-001`) except to *read* it
as a reference for what to port. Never edits `noktos-agent-backend/` or `noktos-auth/`. Talks
directly to `noktos-agent-backend`'s HTTP/SSE API — never through `noktos-auth` (`Q-P3`).

Suggested slices (sequenced, not all independent — evaluate what to actually reuse vs.
rewrite from `application/`, `contracts/`, `infrastructure/`, `presentation/view-models/`,
and atoms/molecules; do not copy folders blindly):

| Slice | Content |
|---|---|
| A0 | Create `noktos-agent-next` (clean Next.js project, sibling repo, own `.loop/` governance per `Q-P4`) |
| A1 | Base structure, env plumbing (`NEXT_PUBLIC_*`) |
| A2 | Port `contracts/` (same vendoring/verification discipline as the Vite app) |
| A3 | Port/adapt minimal auth (memory-only, per `P-005` — this is largely portable as-is from `src/auth/auth.ts`) |
| A4 | Port/adapt `HttpTransport`/SSE — **carry the fetch-binding fix forward**; SSE still needs `Authorization` header + `fetch`/`ReadableStream`, do **not** blindly swap to `EventSource` (it can't send custom headers) |
| A5 | Functional chat — implements the `Q-P2`-approved `result.data.text`/`summary` projection |
| A6 | Usable task projection (no raw IDs as primary UX, per `P-006`) |
| A7 | Usable approval flow (contextual-in-chat + optional panel, per `P-006`) |
| A8 | Activity/debug view, visibly separate from chat |
| A9 | End-to-end smoke test against the real backend |

Next.js note: chat, SSE, and approval state need client components (`"use client"`).
Do not force everything into Server Components on principle — this is a live, streaming,
interactive session, not a content site.

### Track B — Backend

Works only in `noktos-agent-backend/`, through that repo's own `.loop/` governance (Claude
= Supervisor, not implementer, there too). Never edits `noktos-agent-frontend/` or
`noktos-auth/`.

| Slice | Content |
|---|---|
| B0 | Confirm/freeze the minimal contract Next.js needs (Phase 0 output) — likely a no-op given contract 1.0.0 already covers it |
| B1 | Ensure a usable assistant-response projection is available (see decision below — may be zero backend work, since `result.data.text` already exists) |
| B2 | Confirm tasks projection is sufficient (`GET /conversations/:id/tasks`, already implemented per `D-025`) |
| B3 | Confirm approvals projection/decision flow is sufficient (already implemented and validated this session) |
| B4 | Keep `DemoScriptedLlmProvider` working, untouched |
| B5 | Prepare (not implement) the real-LLM extension point — confirm `LlmProvider`/`LlmProviderRegistry` need no change to accept a second provider |
| B6 | Smoke tests against the new Next.js frontend |
| B7 | *(V2-B, later)* real LLM provider |

**Do not introduce LangGraph in Track B during V2-A** (`P-010`).

### File-ownership boundaries (avoid collision)

- Track A: read-only access to `noktos-agent-frontend/`; full access to the new Next.js
  project directory only.
- Track B: full access to `noktos-agent-backend/src/`, `contracts/`; **must not** touch
  `.loop/`, `CLAUDE.md`, `AGENTS.md`, `.gitattributes` per that repo's own `AGENTS.md` §7
  (binding regardless of who's asking).
- Shared, edit-once-in-Phase-0-then-freeze: `contracts/` (backend-owned, frontend
  vendors a copy — no track edits contracts/ during V2-A parallel work; if a real gap
  appears, stop both tracks and treat it as a `D-017`-governed human operation, same as
  today).
- This file (`PROGRESS.md`) and each repo's `HANDOFF.md`: either track may append findings,
  but should avoid simultaneous edits — coordinate via whatever session-handoff mechanism
  the human is using (sequential turns, or one authoritative session merging both tracks'
  notes).

### Integration checkpoint

The single end-to-end smoke test that validates Track A + Track B actually integrated:
send a message that triggers the `add_reservation_to_cart` approval flow from the **new**
Next.js frontend against the **existing** backend, unmodified contract, and confirm Approve
executes the mock and Reject does not — i.e., re-run *Human validation completed* #6–7
against the new frontend. Until that passes, the tracks are not considered integrated.

### If the harness supports parallel loops

Nothing found in either repo's `.loop/scripts/` suggests built-in support for two
*simultaneous* loops against the same repo, and each repo's `CLAUDE.md` says "Do not
operate two loops on the same repo at once" (root `HANDOFF.md`). Track A and Track B
target **different repos** (new Next.js project vs. `noktos-agent-backend`), so running
one loop per repo, concurrently, does not violate that rule. Do not invent a mechanism for
running two loops against the *same* repo concurrently — that would violate stated
governance.

---

## Assistant response projection — RESOLVED (Q-P2, 2026-09-15)

**Status:** ACCEPTED (DECISION). Path 1 below is approved for V2-A. Not implemented yet —
approval unblocks Track A slice A5, it does not itself constitute implementation.

**Decision (verbatim intent):** In V2-A, a defensive frontend projection of
`task.result.data.text` is permitted, **only** when the result has an answer/text-compatible
shape; fallback to `task.result.summary` otherwise. Do not modify frozen contracts for this.

**Finding:** `noktos-agent-backend/src/tasks/supervisor-task-processor.ts:64` already sets
`result: { kind: 'answer', data: { text: outcome.text }, summary: 'Supervisor answered the
request.' }` for a plain completed answer. The natural-language text is already on the wire
today — the frontend just doesn't read it.

**Why V1 doesn't use it:** frontend `D-014` §3 explicitly anticipated this and set a
conservative rule: *"`task.result.data.text` may ONLY be used if frozen contract 1.0.0
already defines it in a discriminated and safe manner for `kind === "answer"`. If not
formally typed as such in contracts 1.0.0, do not invent that interpretation."*
`contracts/task.ts` defines `TaskResult { kind: string; data: unknown; summary: string }` —
`kind` is a bare `string`, `data` is `unknown`. Neither is a discriminated union. By the
letter of `D-014`, the frontend loop was right to not use it.

**Two compatible paths for V2, in order of recommendation:**

1. **(Recommended, minimal) Frontend-only defensive runtime narrowing — no contract
   change.** In the new Next.js frontend's response view-model: if `result.kind ===
   'answer'` and `result.data` is an object with a string `text` field, show it; otherwise
   fall back to `result.summary`. This is the *same* pattern `HttpTransport.ts` already uses
   everywhere else to safely narrow `unknown` wire data (`object()`, `strings()`,
   `optional()` helpers) — it does not claim the contract guarantees the field, it treats it
   as an optional hint with a guaranteed fallback. **This does not touch `contracts/`,
   `contracts.lock`, or `VERSION`.** It does, however, revisit the *interpretation* `D-014`
   settled for V1 — which is exactly the kind of thing this document's "do not silently
   reinterpret" rule exists for. **Approved by the human as `Q-P2`, 2026-09-15** — this is
   now path 1, ACCEPTED for V2-A. Implementation still belongs to Track A slice A5, and
   should be recorded in `noktos-agent-next`'s own `ARCHITECTURE_DECISIONS.md` once that
   repo exists (cross-referencing frontend `D-014`, which it does not override — `D-014`
   remains the correct record of what V1 actually did and why).
2. **(Heavier, not recommended for V2-A) Evolve the frozen contract** to a true
   discriminated union (`TaskResult` keyed by `kind` with per-kind `data` shape). This is a
   `D-017`-governed human operation across both `noktos-agent-backend` and
   `noktos-agent-frontend` (stop both loops, edit `contracts/`, bump `VERSION`, re-vendor,
   record in both repos, commit separately, resume). Real benefit (type safety at the
   wire boundary) but real cost and blast radius for a deadline-driven milestone. Consider
   for V2-B/V2-C if the ad-hoc narrowing in path 1 starts feeling fragile in practice.

**For the other `kind: 'answer'` cases** (`cart_completed`/`confirmation_completed`/
`cancellation_completed`), `result.data` has no `text` field, only structured fields
(`mock`, `cartItemId`/`bookingId`, `status`). Continue using `result.summary` for those (it
already reads reasonably: *"Fictional mock reservation added to the cart after owner
approval."*) — or, if desired, have the Next.js view-model compose a short sentence from
the structured fields. Either is compatible with path 1 above; no contract change either
way.

---

## Security / technical-data display rules for V2 (binding, not new — restating what already governs both repos)

Never render in normal UI: access token, `authContextId`, unnecessary internal UUIDs, raw
headers, chain-of-thought, secrets. IDs continue to exist internally and remain necessary
for SSE/task/approval correlation and debugging — they are hidden from primary UX, not
removed from the data model or the contract. Never log credentials. Never commit secrets to
documentation (this file included).

---

## Current risks

1. **Noktos Core does not exist yet** (new finding, see `P-011`). V2-D has unscoped,
   possibly large, hidden work behind it. Not a V2-A/B/C blocker, but do not let a future
   session assume V2-D is "just wiring."
2. **`noktos-auth` has never been run** — no DB connection, no HTTP request, no test, ever.
   If V2 ever needs real auth (beyond Supabase-direct, which is all V2-A/B/C need), this is
   unvalidated territory.
3. ~~Assistant-response projection reinterpretation is unapproved.~~ **RESOLVED 2026-09-15
   — approved as `Q-P2`.** Path 1 (defensive narrowing) is ACCEPTED for V2-A; see that
   section above.
4. **Dev-mode double `POST /conversations`** is understood (`StrictMode`) but not
   eliminated. Low risk for a demo; would matter more if V2 tracked conversation-creation
   side effects that aren't idempotent (none currently are known to be).
5. **Two parallel tracks without Phase 0 completed first** risk exactly the incompatibility
   the human explicitly warned about. Phase 0 is a hard prerequisite, not a nice-to-have.
6. **Deadline pressure vs. thoroughness.** The stated delivery is "tomorrow." The roadmap
   above is scoped to make V2-A achievable in that window *only if* Phase 0 stays small and
   Track A reuses aggressively rather than rebuilding from scratch.

## Open questions requiring human decision

**`Q-P1` through `Q-P4` are RESOLVED as of 2026-09-15.** Kept here, struck through, so no
future session mistakes them for still-open — the resolutions are the authoritative record,
not a deletion of the question:

- ~~**Q-P1** — Name and location for the new Next.js project.~~ **RESOLVED/ACCEPTED:**
  `noktos-agent-next`, a sibling repo alongside `noktos-agent-frontend`,
  `noktos-agent-backend`, `noktos-auth`. See `P-001`.
- ~~**Q-P2** — Approve or reject the assistant-response projection path 1.~~
  **RESOLVED/ACCEPTED:** approved for V2-A — defensive `result.data.text` narrowing with
  `result.summary` fallback, no contract change. See *Assistant response projection* above.
- ~~**Q-P3** — Should `noktos-agent-next` talk to `noktos-agent-backend` directly, or
  through `noktos-auth`?~~ **RESOLVED/ACCEPTED:** directly. `noktos-auth` is explicitly
  **not** introduced as a proxy for the Agent API in V2.
- ~~**Q-P4** — Who/what authors the Next.js code?~~ **RESOLVED/ACCEPTED:**
  `noktos-agent-next` uses governance equivalent to the other three repos
  (`CLAUDE.md`/`AGENTS.md`/`.loop`), Claude Code as supervisor/orchestrator, never as
  product-code implementer. Phase 0 first; Track A/Track B in parallel after.

*(Carried forward, still genuinely open, unaffected by this session):* backend `Q-001`
(durable persistence/retention), backend `Q-003` (role-based approval), frontend `Q-002`
(role-aware UI), frontend `Q-003` (accessibility target), auth `Q-001`/`Q-002`/`Q-003`
(role matrix, MCP OAuth flow, Auth↔Core internal token). None of these block V2-A.

## RESUME FROM HERE — the next action is unambiguous

**Phase 0 is COMPLETED.** The canonical shared interface freeze is recorded in
[`V2_PHASE0_INTERFACE_FREEZE.md`](V2_PHASE0_INTERFACE_FREEZE.md).

**Next action:** Await human authorization to launch Track A and Track B in parallel.
Neither track is marked as started yet.

```
Phase 0 (sequential, one session/owner):
  → [COMPLETED] Interface freeze canonicalized in V2_PHASE0_INTERFACE_FREEZE.md
    (endpoints, DTOs 1.0.0, Q-P2 narrowing predicate, approval flow, SSE model,
     NEXT_PUBLIC_* env convention).

Next (in parallel, upon human authorization):
  Track A — create `noktos-agent-next`, build chat / tasks / approvals / activity
            (slices A0–A9, see table above; slice A0 creates repo).
  Track B — strictly necessary backend adaptations only (slices B0–B7, see table above;
            confirm minimal contract, prepare LLM extension seam).

Then:
  Integration — DemoScriptedLlmProvider + MockNoktosClient, full V2-A stack, re-run the
                Integration checkpoint smoke test (Approve/Reject flow against the new
                frontend) before calling V2-A done.
```

**Explicitly OUT of this milestone** (do not let scope creep pull any of these in):
- LangGraph (`P-010`)
- Real LLM (`P-009` — comes after V2-A, not during)
- Real Noktos (`P-011` — also blocked on Noktos Core not existing yet, see *Current risks*)
- Branding (`P-004`/`P-012`)
- Session persistence (`P-005`/`P-012`)
- Logout (`P-012`)

## Next actions — ordered

1. [COMPLETED] Human review and commit split for V1 review changes (`HttpTransport` fix + test in frontend, CORS fix + SSE fixtures + docs in backend).
2. [COMPLETED] Human authorizes start of Phase 0.
3. [COMPLETED] Phase 0 output recorded in [`V2_PHASE0_INTERFACE_FREEZE.md`](V2_PHASE0_INTERFACE_FREEZE.md).
4. Human authorizes start of Track A and Track B in parallel.
5. Track A slice A0 (create `noktos-agent-next`) and Track B slice B0 (confirm contract) begin, in parallel.
6. Proceed slice by slice per the tables above; re-run the *Integration checkpoint* smoke test before declaring V2-A done.
7. Only after V2-A is demoed: begin V2-B (real LLM) planning — do not start V2-B work concurrently with V2-A "to save time"; `P-009` explicitly sequences it after.


## Workspace closure snapshot (2026-09-15) — for remote handoff

Produced so a session on a different machine doesn't have to re-derive what's in each
working tree. Classification: **A** = made/documented this review session and approved,
**B** = a previously-known change *from this human-review pass* (not this exact
conversation turn, but the same review effort), **C** = pre-existing, provenance not
confirmed in any conversation on record, **D** = secret/local-only, must never be
committed. Root workspace `noktos/` is confirmed **not** a git repository — `git status`
does not apply there; `PROGRESS.md` and `HANDOFF.md` at that level are plain files.

### `noktos-auth`
Branch `loop/noktos-auth`, remote `origin` → `https://github.com/AngelCstd/proyecto_esc.git`.
`git status`: **clean.** Nothing to classify, nothing to commit.

### `noktos-agent-backend`
Branch `loop/agent-backend`, remote `origin` → `https://github.com/luiscastaneda-tos/agback.git`.

**Human disposition on class-C items (2026-09-15, second pass): resolved.** All four backend
class-C items below now have an explicit human decision — none are still "unconfirmed,
exclude by default."

| Path | Class | Disposition | What it is |
|---|---|---|---|
| `.loop/ARCHITECTURE_DECISIONS.md` | A | KEEP, docs commit | `D-026` (V2 sequencing, chokepoint preservation) + factual addendum to `Q-002` (Noktos Core doesn't exist yet). |
| `HANDOFF.md` | A | KEEP, docs commit | §0 "Revisión humana real" + V2-freeze note. |
| `docs/workspace/PROGRESS.md`, `docs/workspace/HANDOFF.md` | A | KEEP, docs commit | **New, canonical cross-repo continuity docs** — see *Canonical documentation location* below. |
| `src/main.ts` | C → **KEEP, human-approved** | Separate functional commit | CORS fix: `app.enableCors({ origin: ["http://localhost:5173"], methods: ["GET","POST","OPTIONS"], allowedHeaders: ["Content-Type","Authorization","Last-Event-ID"] })`. Verified: **no wildcard origin, no `credentials` flag** (no insecure wildcard+credentials combination). **However, the diff is not CORS-only** — it also changes single→double quotes on the 4 import lines at the top of the file (cosmetic, no functional difference, but present in the diff as-is). Approved to keep as one functional commit; flagged so the quote-style noise isn't mistaken for something I added — I did not touch this file this session. |
| `package-lock.json` | C → **REVERTED** | Not committed (reverted) | Confirmed pure key-reordering, no version/integrity/tree change. Executed `git checkout -- package-lock.json` this session; working tree now matches `HEAD` exactly. Nothing to commit. |
| `fixtures/hotel-search.sse`, `fixtures/cart-approval.sse` (untracked) | C → **KEEP, human-approved** | Separate evidence commit | Real captured SSE streams from the documented `Paso 3` procedure. Re-confirmed clean of secret-shaped strings (`Bearer`/`token`/`sb_`/JWT patterns) this session. Approved as human-review evidence, kept out of the functional/docs commits. |
| `.env`, credentials | D (would-be) | Never committed | `.gitignore` covers `.env`/`.env.*` (`!.env.example` negation), confirmed via `git check-ignore -v .env`. |

**Recommended commit split (backend) — three commits**, per explicit human direction:
1. Documentation: `.loop/ARCHITECTURE_DECISIONS.md`, `HANDOFF.md`, `docs/workspace/PROGRESS.md`, `docs/workspace/HANDOFF.md`.
2. CORS runtime fix: `src/main.ts` only.
3. Human-review evidence: `fixtures/cart-approval.sse`, `fixtures/hotel-search.sse`.

`package-lock.json` is excluded entirely — already reverted to `HEAD`, not part of any commit.

### `noktos-agent-frontend`
Branch `loop/agent-frontend`, remote `origin` → `https://github.com/luiscastaneda-tos/agfront.git`.

| Path | Class | What it is |
|---|---|---|
| `src/infrastructure/api/HttpTransport.ts` | **A** | The `fetchImplementation` receiver-binding fix (`globalThis.fetch.bind(globalThis)`), diagnosed and applied this session. Diff verified to contain **only** that one change (checked with `git diff`). Confirmed by you in Chrome DevTools before the fix, and by the added test after. |
| `scripts/test-http-transport-fetch-binding.mjs` (untracked) | **A** | The regression test for the same bug. Verified this session to fail against the pre-fix code and pass against the fix. |
| `package.json` → `"test": "node scripts/test-http-transport-fetch-binding.mjs"` line | **A** | Added this session, to wire up the test above. |
| `package.json` → `"dev": "vite"` line | C → **KEEP, human-approved** | **Not added by me** — `git show HEAD:package.json` has no `dev` script at all, matching `docs/HUMAN_REVIEW.md`'s own statement (*"package.json has no `dev` or `start` script"*). Pre-existing in the working tree before this session touched the file; I only inserted the adjacent `"test"` line. **Approved to keep**, explicitly because it makes it easy to run the V1 baseline. Included in commit 1 (bug-fix commit) alongside the `"test"` line, with this provenance note carried into the commit message rather than silently merged in. |
| `useChatSession.ts` | *(no diff)* | The temporary diagnostic `console.error` was added, then removed, this session — net change vs. `HEAD` is zero. Confirmed via `git diff --name-only` (file does not appear). Nothing to commit, nothing to classify. |
| `.loop/ARCHITECTURE_DECISIONS.md` | **A** | `D-016` appended this session (V2 = new `noktos-agent-next` repo; this repo frozen as V1 baseline; archiving decision explicitly deferred). Documentation only. |
| `HANDOFF.md` | **A** | §0 "Revisión humana real", §4 bug-fix writeup, §5 dev-duplicate-POST observation, V2-freeze note — all added this session. Documentation only. |
| `.env` | **D** (would-be) | `.gitignore` covers `.env`/`.env.*` with `!.env.example` negation — confirmed via `git check-ignore -v .env`. `.env.example` itself currently matches `HEAD` exactly (no diff) — an earlier apparent deletion of it, noted mid-session, is no longer present; nothing to act on. |

**Recommended commit split (frontend), two commits:**
1. **Bug fix + test** (class A, code): `src/infrastructure/api/HttpTransport.ts`,
   `scripts/test-http-transport-fetch-binding.mjs`, and *only* the `"test"` line of
   `package.json`.
2. **Documentation** (class A, docs): `.loop/ARCHITECTURE_DECISIONS.md`, `HANDOFF.md`.

The `"dev"` script line in `package.json` doesn't cleanly split from commit 1 without a
partial-file (hunk-level) commit — flagging this so you decide: fold it into commit 1 with
an explicit note in the commit message that it was pre-existing and being formalized, or
stage it separately with `git add -p`. Not deciding this silently either way.

### Root workspace (`noktos/`) — now a convenience copy, not the source of truth

**RESOLVED (2026-09-15, second pass).** The gap flagged earlier — root `noktos/` is not a
git repository, so this file couldn't travel via git — is closed as follows, by explicit
human direction:

- **Canonical, git-tracked copy:** `noktos-agent-backend/docs/workspace/PROGRESS.md` and
  `noktos-agent-backend/docs/workspace/HANDOFF.md`. These travel with that repo's normal
  git history (commit/push/pull/clone) like any other tracked file — no separate
  documentation-only repository was created, per explicit instruction.
- **This file** (`noktos/PROGRESS.md`, root workspace) **is now a local convenience copy
  only.** It is reconciled with the canonical copy as of this update, but going forward the
  canonical copy is the authority — if the two ever diverge, `noktos-agent-backend/docs/workspace/PROGRESS.md`
  wins. Do not edit this root copy as if it were authoritative; edit the canonical copy and
  re-sync this one (or just point people at the canonical copy directly).
- **Why backend, not a neutral location:** purely for git persistence/continuity — backend
  is one of the three existing git repos and already had a `docs/` directory. The decisions
  recorded here do not "belong" to backend more than to frontend or auth; the location is
  an implementation detail of where the file can be committed, not a claim about scope.

## Resume instructions

A new Claude Code session (any machine) should, in order:
0. **This file's own provenance is not machine-verifiable** — the workspace root is not a
   git repo (see *Workspace closure snapshot* above), so there is no commit hash to confirm
   this copy of `PROGRESS.md` is current. If you're not on the same machine/filesystem this
   was written on, ask the human whether this is the latest copy before trusting it as
   current, especially the `Open questions`/`RESUME FROM HERE` sections.
1. Read this file (`PROGRESS.md`) in full.
2. Read the `HANDOFF.md` of whichever repo the next task touches (per-repo files are
   authoritative for that repo's own state; this file is authoritative for cross-repo
   product decisions and V2 sequencing).
3. Read that repo's `CLAUDE.md`/`AGENTS.md` before touching anything — governance has not
   changed.
4. Check `git status` **and `git log -1`** in that repo before doing anything — if
   `git status` shows uncommitted changes that aren't described in this file's *Workspace
   closure snapshot*, or `HEAD` has moved past what's recorded there, treat this file as
   partially stale and reconcile before proceeding, rather than assuming it's still
   accurate.
5. If the task is V2 implementation: confirm `Q-P1`–`Q-P4` (RESOLVED, see above) and
   `RESUME FROM HERE` still match what the human wants; if something looks like it's
   changed, ask rather than assume the old default still holds.
6. Never reinterpret an accepted `P-xxx`/`D-xxx` silently — if something here seems wrong
   or outdated, say so and ask, rather than deciding unilaterally.

## Last updated

2026-09-15 (third pass, same day): all class-C items dispositioned by explicit human
decision — backend `src/main.ts` (CORS) KEEP, `package-lock.json` REVERTED to `HEAD`
(executed this pass), both `fixtures/*.sse` KEEP, frontend `package.json` `"dev"` line KEEP.
Canonical documentation location established at
`noktos-agent-backend/docs/workspace/{PROGRESS.md,HANDOFF.md}`; this root copy is now a
convenience copy only (see notice at the top of this file). Three-commit backend split and
two-commit frontend split prepared (not executed). **Still no commits made in any repo as
of this update** — `git add`/`commit`/`push` remain pending explicit human confirmation.
Backend `HEAD` still `d857dc4` (unchanged); auth untouched, clean.
