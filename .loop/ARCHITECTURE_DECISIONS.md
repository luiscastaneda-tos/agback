# NOKTOS AGENT BACKEND - ARCHITECTURE DECISIONS V1

This file is authoritative for the Architect and for Codex. Every decision below
was frozen by the human during Phase 0 design, BEFORE any agent ran.

If a decision not covered here would change security, public contracts or the
execution boundary, stop with HUMAN_GATE.

## D-001 - Stack and scope

NestJS + TypeScript + npm. Demo backend for an observable multi-agent system.
Never declares production readiness.

## D-002 - Execution chokepoint (structural)

```text
Agent -> inert ToolHandle/definition -> ToolInvoker -> schema validation
      -> PolicyEngine -> ApprovalEngine -> ExecutorRegistry -> Executor -> NoktosClient
```

A tool definition carries `executorKey` as a STRING, never a callable. Agents
never receive an executable reference that could bypass the invoker.

Mechanically enforced by `.loop/scripts/check-layering.sh`, run twice: over the
diff as a loop guard, and over the full tree in `verify.sh`. Both fail closed.

## D-003 - Policy V1

```text
search_hotels              AUTO
traveler read/search       AUTO
add_reservation_to_cart    HUMAN_APPROVAL_REQUIRED
confirm_booking            HUMAN_APPROVAL_REQUIRED
cancel_booking             HUMAN_APPROVAL_REQUIRED
unknown action             FORBIDDEN
```

Engine default is FORBIDDEN. `AUTO` means no interactive confirmation; it does
not weaken identity authorization for traveler data.

## D-004 - No test suite in the loop

Cost decision. Deterministic checks are `npm run build` and the full-tree
layering check. Reversing this is a human decision.

## D-005 - Approvals are a separate entity, not task states

`awaiting_human_approval` is a Task status because it describes execution.
`approved` / `rejected` live on `ApprovalRequest`, because a single task may
require several approvals and each decision needs its own audit record bound to
concrete arguments.

## D-006 - Approval binding

```text
payloadHash = sha256(canonicalJson({
  action, actionVersion, conversationId, taskId, material
}))
```

`material` is the action's declared `materialFields` - not the whole payload, so
irrelevant fields do not invalidate a decision, and not too little, so price,
traveler, dates or action cannot change after approval.

`conversationId` and `taskId` are inside the hash to prevent replay across
conversations. Approvals are single-use and expire.

On mismatch: the approval becomes `superseded`, a new request is created, and
the task returns to `awaiting_human_approval`. Never silently reused.

## D-007 - Approval TTL

15 minutes by default, configurable through an environment variable. The number
is never hardcoded inside domain logic.

## D-008 - Who may approve (V1)

Only the authenticated `userId` that owns the conversation. Enforced in the
backend, never as a frontend affordance.

Administrator or supervisor approval is deliberately NOT implemented: it depends
on the role matrix still open in noktos-auth (Q-001 there).

## D-009 - Supabase token handling

The token is exchanged at the HTTP boundary for an opaque `authContextId`. Tasks
carry only that id. The token never enters a prompt, event, task payload, log or
UI.

No refresh tokens are stored. No impersonation, no service credentials. If the
token is expired when a task executes or resumes, the task fails with
`AUTH_CONTEXT_EXPIRED` and the UI must ask the user to re-authenticate.

## D-010 - LLM provider abstraction

Provider and model are configurable per environment. Domain logic is never
coupled to a concrete vendor. Provider SDKs may only be imported inside
`src/llm/`.

Demo data is fictional. There is no authorization to send real traveler PII to
any provider.

## D-011 - HotelSearchAgent is a real specialized agent

Deliberate product decision to demonstrate multi-agent delegation, accepting
that a pure tool would be cheaper. It gets its own descriptor, prompt, lifecycle,
child task, agent lifecycle events and a search-only tool subset.

This does not generalize: deterministic services and tools remain as they are.

## D-012 - Everything in memory in V1

Conversations, tasks, event buffers, pending approvals and auth contexts live in
process memory. A restart loses all of them. Accepted for the demo and
documented. No Redis, no database, no durable queue.

## D-013 - Concurrent conversation

Message submission returns 202 and never blocks. Messages arriving while work is
in flight are stored in `ConversationState.pendingUserNotes` and applied when a
result arrives or through a later task. In-flight jobs are never mutated.

## D-014 - Event transport

Server-sent events over `fetch` + `ReadableStream`, authenticated with the
`Authorization` header. Per-conversation monotonic `seq`, bounded ring buffer,
`Last-Event-ID` replay. No WebSockets in V1: the traffic is unidirectional and
actions travel over normal POSTs.

## D-015 - Events are operational only

No chain-of-thought, no private model reasoning, no raw tool arguments, no
credentials, no auth handles. `tool.called` carries an allowlist preview.

## D-016 - Noktos integration is mocked in V1

`NoktosClient` is a stable interface with an explicitly labelled mock adapter.
The mock must be obvious in logs and responses. Real integration is a later
milestone because noktos-auth exposes no public controllers yet.

Swapping the mock must not require changing agents or tools.

## D-017 - Shared contracts

`contracts/` at version 1.0.0 is owned by this repository and is a PROTECTED
PATH. The frontend consumes a vendored read-only copy verified by hash.

Changing a contract is a human operation: stop both loops, edit here, bump
`contracts/VERSION`, re-vendor, record the decision in both repositories,
commit separately, resume.

## OPEN - escalate, never invent

### Q-001 - Durable persistence and retention
V1 is in-memory with fictional data. Retention, storage and PII handling for
real conversations are undecided.

### Q-002 - Real Noktos integration
Depends on noktos-auth exposing public routes. Until then the mock stands.

### Q-003 - Role-based approval
Approval by someone other than the conversation owner depends on the noktos-auth
role matrix (Q-001 there).
