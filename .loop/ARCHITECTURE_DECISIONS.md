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

### Clarification — Internal contract consumption convention

Recorded while resolving the BE-008-01 HUMAN_GATE on 2026-09-14.
This clarifies D-017; it does not modify the frozen 1.0.0 contracts.

- `contracts/` remains the sole source of truth for public contracts.
- Code under `src/` must NOT directly import TypeScript from `contracts/` while `rootDir` remains `./src`.
- Do NOT modify `tsconfig.json`. Do NOT change `rootDir`. Do NOT write relative imports like `../../contracts/...` from `src/`.
- `src/` may define internal models / internal projections necessary for domain, application, or agent registry (e.g. `src/agents/agent-descriptor.ts`), but those types:
  - do not substitute the public contract;
  - are not considered canonical;
  - must not evolve independently of the contract;
  - must not silently add distinct public semantics.
- At HTTP, SSE, or adapter boundaries, map explicitly from the internal model to the public contract shape.
- Root contracts remain frozen at 1.0.0. If public contracts change in the future, the human coordinated operation across both repos applies and must reconcile any affected internal projections.

## D-018 - Supabase JWT verification and AuthContext credential retention (V1)

Frozen by the human while resolving the BE-007 HUMAN_GATE, after D-001..D-017.
Extends D-009, which froze what happens to the token but not how it is verified
or what is retained.

### Verification

The Agent Backend verifies Supabase-issued access tokens LOCALLY against the
Supabase JWKS. It does not call the Supabase Auth endpoint per request.

Required configuration is exclusively non-secret, documented in `.env.example`
with no real values:

```text
SUPABASE_JWKS_URL
SUPABASE_JWT_ISSUER
SUPABASE_JWT_AUDIENCE
```

No Supabase API key is required for this mechanism. `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` and `service_role` must NOT be introduced as a
requirement of BE-007.

The shared Supabase `JWT_SECRET` must never be copied into or used by this
backend.

Validation must require, at minimum:

- a valid signature against JWKS
- an exact issuer match
- an exact audience match
- a valid `exp`
- a `sub` that is present and non-empty

Expired tokens, invalid signatures, wrong issuer or audience, unknown keys and
an invalid JWKS must all FAIL CLOSED and must not create an AuthContext.
Unsigned JWTs are never accepted.

This local-JWKS mechanism is implemented only if the existing Supabase project
uses asymmetric signing keys compatible with JWKS. If that cannot be confirmed,
raise a HUMAN_GATE. A silent fallback is forbidden.

Verification is encapsulated behind an `AuthTokenVerifier` interface, so a
future server-side strategy such as `supabase.auth.getUser(token)` can replace
`JwksTokenVerifier` without affecting tasks, SSE, approvals or executors.

### Amendment (2026-09-14) — Supabase Auth remote verification (Option B)

Frozen by the human while resolving the BE-007 HUMAN_GATE on 2026-09-14.

#### Mechanical evidence from Supabase project
```http
GET https://iyuomxgqruhqjiygsgrw.supabase.co/auth/v1/.well-known/jwks.json
HTTP/2 200
{"keys":[]}
```
The live Supabase project does not publish asymmetric signing keys in its JWKS endpoint, operating under symmetric HS256 signing. Therefore local JWKS verification is impossible without exposing the secret.

#### Concrete Strategy
For V1, `AuthTokenVerifier` interface is retained, and implemented via remote verification:
```text
AuthTokenVerifier
        ↓
SupabaseAuthTokenVerifier
        ↓
supabase.auth.getUser(accessToken)
        ↓
Supabase Auth server
```
This preserves the boundary so that `JwksAuthTokenVerifier` can cleanly replace `SupabaseAuthTokenVerifier` in the future if the project migrates to asymmetric signing keys.

#### Security rules
- Strictly forbidden: `JWT_SECRET`, shared JWT secret, `service_role`, `SUPABASE_SERVICE_ROLE_KEY`.
- Never copy or use the HS256 secret to verify tokens locally.
- Verification is performed remotely against Supabase Auth.

#### Backend configuration
The implementation may require:
```text
SUPABASE_URL
SUPABASE_ANON_KEY
```
or equivalent public/publishable client key. This key is exclusively the public client key needed to communicate with Supabase Auth; never `service_role`. Documented in `.env.example` with non-secret placeholders only.

#### AuthContext & Failure Behavior
- Upon validation: `userId` (from Supabase `user.id`), `accessToken` (in-memory only), `expiresAt`.
- The rest of the system sees only the opaque `authContextId`.
- Access token forbidden in: prompts, LLM, task payloads, events/SSE, logs, errors, UI, URLs, persistent storage.
- No refresh tokens, no automatic refresh in V1.
- Expired token/context produces `AUTH_CONTEXT_EXPIRED`.
- If `getUser(accessToken)` fails, returns an invalid user, or Supabase Auth cannot confirm identity: fail closed (do NOT create AuthContext). Supabase Auth unavailability must never become token acceptance or a local fallback.

#### Dependencies
If the implementation requires `@supabase/supabase-js` and it is absent, use the formal host-side dependency provisioning mechanism. The Architect must explicitly authorize it via `allowed_dependencies`. Do not change strategy to avoid installing the dependency.

### AuthContext

Once the JWT is validated, the backend creates an opaque `authContextId`.
Conceptually the in-memory store retains:

```text
AuthContext
- userId
- accessToken
- expiresAt
```

`userId` comes from the verified `sub` of the JWT.

The raw access token may be held ONLY in process memory and ONLY until it
expires, because executors later need to call Noktos on behalf of the user.

The token is forbidden from appearing in:

- task payloads
- serializable conversation state
- prompts or any context sent to the LLM
- operational events / SSE
- logs
- errors
- the UI
- URLs
- files
- persistent storage

Tasks and every other component carry exclusively the opaque `authContextId`.
The token may cross the auth boundary only when the runtime creates an ephemeral
`ExecutionContext` for an authorized execution.

### Expiry

No refresh tokens are stored. No automatic refresh in V1.

An expired AuthContext must produce `AUTH_CONTEXT_EXPIRED` and must never
attempt execution with the expired credential. The application then requires
authentication again. Expired AuthContexts are invalid and must be evictable
from the store.

### Structural security

No agent and no LLM ever receives the access token.

`authContextId` must not appear in operational events or the UI either, unless
an explicitly approved technical need arises; use task and conversation ids for
public correlation.

## D-019 - add_reservation_to_cart specification (V1)

Recorded while resolving the BE-018 HUMAN_GATE on 2026-09-14.
Freezes the security, argument, material hashing, preview and mock contracts for
the `add_reservation_to_cart` tool.

### Arguments schema
```typescript
{
  hotelId: string;
  hotelName: string;
  checkIn: string;      // YYYY-MM-DD
  checkOut: string;     // YYYY-MM-DD
  travelerId: string;   // Binding identity for authorization and execution
  travelerName: string; // Human display only, not a substitute for identity
  rooms: number;        // integer > 0, default 1
  totalPrice: number;   // > 0
  currency: string;
}
```

- `travelerId` is the binding identity for execution and audit.
- `travelerName` is human-readable display information for the approval preview; it must never be used as a substitute for identity or authorization.

### Material fields for approval hashing
```json
[
  "hotelId",
  "hotelName",
  "checkIn",
  "checkOut",
  "travelerId",
  "travelerName",
  "rooms",
  "totalPrice",
  "currency"
]
```
Any modification to these fields during an ongoing conversation causes any prior approval to transition to `superseded` (D-007), requiring a new human approval.

### Human input preview
The human approval card displays exclusively an allowlisted projection:
- Hotel (`hotelName`)
- Check-in (`checkIn`)
- Check-out (`checkOut`)
- Huésped (`travelerName`)
- Habitaciones (`rooms`)
- Precio total (`totalPrice` + `currency`)

Raw argument JSON must never be serialized or rendered directly.

### Mock return shape
`MockNoktosClient.addReservationToCart(...)` returns:
```json
{
  "mock": true,
  "cartItemId": "string",
  "status": "added"
}
```
with a deterministic, synthetic `cartItemId`.

### Policy & Execution chokepoint
- `add_reservation_to_cart` is classified as `HUMAN_APPROVAL_REQUIRED` (D-003).
- It can only reach the executor through the strict pipeline:
  `ToolInvoker -> PolicyEngine -> ApprovalEngine -> ExecutorRegistry -> Executor`.
- No agent or LLM may invoke the executor or `NoktosClient` directly (D-002).

## D-020 - confirm_booking and cancel_booking specification (V1)

Recorded while resolving the second BE-018 HUMAN_GATE on 2026-09-14.
Freezes the security, arguments, material hashing, preview and mock contracts for
the `confirm_booking` and `cancel_booking` tools.

### 1. confirm_booking

#### Arguments schema
```typescript
{
  cartItemId: string;
  travelerId: string;   // Binding identity
  travelerName: string; // Human display only, derived from trusted source
  totalPrice: number;   // > 0
  currency: string;
}
```
`travelerId` is the binding identity for execution and audit. `travelerName` is display only and must be derived from a trusted source associated with `travelerId`.

#### Material fields for approval hashing
```json
[
  "cartItemId",
  "travelerId",
  "totalPrice",
  "currency"
]
```
`travelerName` does not form part of the hash while it remains display derived. (If it cannot be guaranteed to be derived from a trusted source, it must be included in `materialFields`).
Any change in `materialFields` produces: pending approval -> `superseded` -> new mandatory approval.

For V1, `cartItemId` must identify an immutable cart item once created. If future design permits materially modifying a cart item under the same ID, do not reuse this approval: introduce `cartItemVersion`, `cartItemSnapshotHash` or equivalent prior to real integration.

#### Human input preview
Allowlisted projection only:
- Ítem de carrito (`cartItemId`)
- Huésped (`travelerName`)
- Total a pagar + moneda (`totalPrice` + `currency`, with purchase/confirmation visual emphasis)

#### Mock return shape
`MockNoktosClient.confirmBooking(...)` returns:
```json
{
  "mock": true,
  "bookingId": "string",
  "status": "confirmed"
}
```

### 2. cancel_booking

#### Arguments schema
```typescript
{
  bookingId: string;
  travelerId: string;   // Binding identity
  travelerName: string; // Human display only
  reason?: string;
}
```

#### Material fields for approval hashing
```json
[
  "bookingId",
  "travelerId",
  "reason"
]
```
The absent value of `reason` must be deterministically canonicalized for `payloadHash`.
`reason` is material because it appears in human approval and audit. If changed after requesting approval -> pending approval transitions to `superseded` -> new mandatory approval.
`travelerName` remains display only.

#### Human input preview
Allowlisted projection only:
- ID de reserva (`bookingId`)
- Huésped (`travelerName`)
- Motivo de cancelación (`reason` or formatted placeholder)

#### Mock return shape
`MockNoktosClient.cancelBooking(...)` returns:
```json
{
  "mock": true,
  "bookingId": "string",
  "status": "cancelled"
}
```

### 3. Policy & Execution chokepoint
Both actions remain `HUMAN_APPROVAL_REQUIRED` (D-003).
Execution is exclusively permitted through:
`Agent -> ToolInvoker -> PolicyEngine -> ApprovalEngine -> ExecutorRegistry -> Executor -> NoktosClient`.
Never permit `Agent -> Executor` or `Agent -> NoktosClient` directly (D-002).
`inputPreview` must be an allowlisted projection, never raw argument serialization.

## D-021 - Demo scripted LLM provider for V1

Recorded while resolving the BE-024 HUMAN_GATE on 2026-09-14.
Freezes the LLM provider strategy, behavior, safety boundaries, and transparency
for V1 demo execution and fixture generation.

### 1. Authorized Configuration & Implementation
For V1, the system authorizes:
```text
LLM_PROVIDER=demo-provider
LLM_MODEL=fictional-demo-model
```
Implemented via:
```typescript
DemoScriptedLlmProvider implements LlmProvider
```
Registered behind the existing `LlmProvider` interface and managed through `LlmProviderRegistry`.

### 2. Scope & Purpose
This provider exists exclusively for:
- Local demonstration and runnable end-to-end multi-agent flow.
- Deterministic, hermetic, and reproducible generation of real SSE event fixtures.
- Known, fictional multi-agent scenarios without incurring token costs or relying on external network dependencies.
- It does NOT represent a real LLM provider and must never be portrayed as OpenAI, Gemini, Claude, or an external generative model.

### 3. Behavioral Rules & Intent Handling
`DemoScriptedLlmProvider` must respond deterministically to an explicit set of demo scenarios:
- **Greeting / General Clarification**: Direct textual response from `SupervisorAgent`.
- **Hotel Search Request**: `SupervisorAgent` returns delegation intent (`delegate_to_hotel_search`) to `HotelSearchAgent`.
- **Hotel Search Goal Execution**: `HotelSearchAgent` calls `search_hotels` via the standard tool protocol.
- **Cart & Reservation Intents**:
  - `add_reservation_to_cart`: triggers `HUMAN_APPROVAL_REQUIRED` policy.
  - `confirm_booking`: triggers `HUMAN_APPROVAL_REQUIRED` policy.
  - `cancel_booking`: triggers `HUMAN_APPROVAL_REQUIRED` policy.

### 4. Technical Chokepoints (Strict Invariant)
The scripted provider decides only what intent or tool call to request. It has zero execution capability.
It must NEVER bypass:
- `TaskQueue`
- `ToolInvoker`
- `PolicyEngine`
- `ApprovalEngine`
- `ExecutorRegistry`

All execution rules and invariants from D-001, D-002, and D-003 apply strictly.

### 5. Security & Transparency
- **No Leaks**: Never emit, synthesize, or leak `chain-of-thought`, internal reasoning, scratchpads, tokens, `authContextId`, or raw sensitive arguments.
- **Envelope Compatibility**: Output conforms strictly to `LlmAssistantOutput` (`{ text: string, toolCalls: LlmToolCall[] }`).
- **Transparency**: The implementation and documentation must clearly label this mode as `DEMO / FICTIONAL / SCRIPTED`.
- **Forbidden Claims**: Do not claim `production ready`, `real LLM`, or `autonomous reasoning` while `demo-provider` is active.

### 6. Clean Dependency Inversion & Future Architecture
`DemoScriptedLlmProvider` must not pollute agents, task processors, or domain services with provider-specific conditionals or branching.
The dependency graph remains strictly:
```text
SupervisorAgent / HotelSearchAgent
              ↓
         LlmProvider
              ↓
     LlmProviderRegistry
              ↓
DemoScriptedLlmProvider (V1) / RealLlmProvider (Future)
```
Swapping to a production LLM provider in a future release requires solely adding another `LlmProvider` implementation in `src/llm/`, without any changes to agents, task queues, tool invokers, or approval engines.

### 7. Recorded Fixtures in BE-024
The recorded event fixtures generated for `BE-024` must be captured directly from real runtime executions of the V1 pipeline running with `DemoScriptedLlmProvider`. Event streams must never be manually fabricated or edited outside actual runtime execution.
No external OpenAI, Gemini, or third-party generative SDKs or secrets are permitted in this closure.

## D-022 - Approved decision task requeueing and resumption

Recorded while resolving the BE-024-03 HUMAN_GATE on 2026-09-14.
Freezes the flow, preconditions, idempotency, and execution chokepoints for
automatically resuming paused tasks upon owner approval.

### 1. Resumption Flow
When an `ApprovalRequest` is resolved as `decision = approved` by the legitimate
conversation owner, the backend must automatically resume the paused task.
No additional manual trigger or action from the frontend is required.

```text
approval pending
  -> owner approves (POST /approvals/:id/decision)
  -> approval.status = approved
  -> task in awaiting_human_approval
  -> task requeue (TaskService.requeue)
  -> TaskQueue enqueue (TaskQueueService.enqueue)
  -> task processor resumes
  -> supplies activeApprovalId
  -> ToolInvoker
  -> ApprovalEngine validates & consumes approval
  -> ExecutorRegistry
  -> Executor
```

### 2. Mandatory Preconditions
Before requeueing a task:
- The approval must belong to the task (`approval.taskId === task.id`).
- The task must be strictly in `status === 'awaiting_human_approval'`.
- `task.activeApprovalId` must match the resolved approval ID (`task.activeApprovalId === approval.id`).
- The approval cannot be `expired`, `rejected`, `superseded`, or already consumed.
- The decision must have been authorized by the legitimate owner under existing authorization rules.
- **Fail Closed**: If any precondition fails, halt immediately: no requeue and no executor dispatch.

### 3. Idempotency & Concurrency
- A valid approval produces at most one requeue.
- Repeated calls to `POST /approvals/:id/decision` with the same decision and idempotency key must not enqueue duplicate entries into `TaskQueue`.
- If the task is already in `queued`, `running`, `completed`, `failed`, or `cancelled`, do not re-enqueue it.
- The state transition `awaiting_human_approval -> queued` is the deterministic single-winner gate.

### 4. Approval Consumption at Chokepoint
- Requeueing a task does NOT execute the underlying tool action.
- The approval is consumed strictly when the resumed processor invokes `ToolInvoker -> ApprovalEngine` and validates `activeApprovalId` + `payloadHash`.
- If material fields changed: the pending approval transitions to `superseded`, and a new mandatory approval is requested; previous approvals must never be reused.

### 5. Harness Task Scope
- Current task packet `BE-024-03` is not silently broadened.
- The Architect is authorized to emit a dedicated subtask (e.g. `BE-024-03B`) with `allowed_paths` covering `src/approvals/`, `src/tasks/`, and any strictly necessary minimal wiring to connect approved decisions to task requeueing.

### Clarification (2026-09-14) - activeApprovalId lifecycle and task store preservation

Recorded while resolving the BE-024-03B HUMAN_GATE on 2026-09-14.
Freezes the lifecycle, clean-up rules, security constraints, and harness scope
for preserving `activeApprovalId` in `InMemoryTaskStore`.

#### 1. Preservation across State Transitions
`activeApprovalId` must be preserved through:
```text
awaiting_human_approval -> queued -> running
```
This enables the resumed task processor to supply `activeApprovalId` to `ToolInvoker -> ApprovalEngine`, ensuring it validates and consumes the exact approval that triggered the resumption.

#### 2. End-to-End Lifecycle
```text
approval pending
  -> owner approves
  -> task requeued (activeApprovalId preserved)
  -> task running (activeApprovalId preserved)
  -> ToolInvoker validates:
       approval.id === activeApprovalId
       approval.taskId === task.id
       payloadHash matches material arguments
       approval.status === 'approved'
       approval not consumed
  -> ApprovalEngine consumes approval
  -> activeApprovalId cleared
  -> Executor executes action
```
Do not retain `activeApprovalId` unnecessarily until task completion if the approval has already been consumed successfully.

#### 3. Clearing Conditions
`activeApprovalId` must be cleared whenever any of the following conditions occurs:
- Approval is successfully consumed;
- Task reaches a terminal state (`completed`, `failed`, or `cancelled`);
- Approval transitions to `superseded`;
- A new approval request replaces the prior approval.

If the task enters `queued` or `running` due to an approved resumption and the approval has not yet been consumed, `InMemoryTaskStore` must retain `activeApprovalId`.

#### 4. Security
- Possessing `activeApprovalId` alone does NOT authorize execution.
- `ToolInvoker` / `ApprovalEngine` must still strictly verify:
  - `approval.taskId === task.id`
  - `activeApprovalId === approval.id`
  - `payloadHash` matches
  - `approval.status === 'approved'`
  - Approval is not consumed
- If any check fails -> fail closed -> no Executor dispatch.

#### 5. Harness Scope for BE-024-03B
- The Architect is authorized to include in `allowed_paths`:
  - `src/tasks/in-memory-task.store.ts`
  - `src/approvals/`
  plus only the minimal wiring strictly required by the subtask.
- `src/tasks/` must NOT be placed in `forbidden_paths` for this packet.

## D-023 - Runtime approval lifecycle event producers

Recorded while resolving the BE-024-08 HUMAN_GATE on 2026-09-14.
Freezes the emission points, payload shapes, security boundaries, and harness scope
for real runtime approval lifecycle events over the event bus and SSE stream.

### 1. Mandatory Lifecycle Events & Emission Triggers
The backend runtime must publish real approval lifecycle events to `EventBusService`;
recorded fixtures must never rely on manually fabricated events.

- `approval.requested`: Emitted when an action pauses for approval (`ToolInvoker` / `TaskService.pauseForApproval`).
- `approval.approved`: Emitted when the legitimate conversation owner records an approved decision (`ApprovalDecisionService` / `reconcileApproval`).
- `approval.rejected`: Emitted when the owner records a rejection.
- `approval.expired`: Emitted when a pending or unresolved approval expires past its TTL.
- `approval.superseded`: Emitted when material arguments change, rendering a previous approval obsolete.

### 2. Allowlisted Operational Payload
Payloads must be minimal, structured, and operational:
```typescript
{
  approvalId: string;
  status: string;
  action?: string;
}
```

### 3. Security & Redaction Boundaries
- **Strict Prohibitions**: Never emit raw tool arguments, `accessToken`, `authContextId`, unnecessary traveler PII, model reasoning, chain-of-thought, prompts, or the full unredacted tool payload.
- **Enforcement**: All approval events must pass through `EventBusService.publish(...)` and be subject to existing payload redaction rules (`redactEventPayload`).

### 4. Idempotency & Deduplication
- A state transition (e.g. `pending -> approved`) must produce at most one `approval.approved` event.
- Repeated calls to `POST /approvals/:id/decision` with identical decision or idempotency keys must not emit duplicate events.
- Replays from the SSE buffer retransmit existing frames using monotonic sequence numbers, but must never cause new event emissions in the domain.

### 5. Correlation Preservation
Every event must preserve existing correlation metadata:
- `conversationId`
- `taskId`
- `approvalId` (within the allowlisted payload)
- `correlationId`
without introducing sensitive data or tokens into the envelope.

### 6. Harness Scope & Prerequisite Task
- Current task packet `BE-024-08` is restricted to fixtures and documentation and must NOT be broadened.
- The Architect is authorized to emit a dedicated prerequisite subtask (e.g. `BE-024-07B`) with `allowed_paths`:
  - `src/approvals/`
  - `src/tools/`
  - `src/events/`
  plus any strictly necessary minimal wiring.
- Once runtime producers are active and committed, `BE-024-08` will capture genuine runtime-provenance fixtures.

## D-024 - Runtime fixture capture execution deferred to human review handoff

Recorded while resolving the second BE-024 HUMAN_GATE on 2026-09-14.
Freezes the completion criteria for BE-024, the security rationale for deferring
live execution, and the required manual verification procedure for BE-025 / HUMAN_REVIEW.md.

### 1. Scope & Completion Criteria for BE-024
For V1, the implementation of `BE-024` is considered fully complete because:
- The capture utilities `fixtures/capture-hotel-search.mjs` and `fixtures/capture-cart-approval.mjs` are fully implemented, verified, and documented.
- The actual live execution of these scripts—which requires real Supabase credentials and an interactive user prompt—is explicitly deferred to `BE-025` / `docs/HUMAN_REVIEW.md`.

### 2. Security Rationale
- The autonomous harness operates non-interactively, never receives real Supabase access tokens, never simulates interactive human approvals, and never fabricates artificial SSE fixture files.
- Actual execution of authenticated capture is conducted exclusively during human review.

### 3. Requirements for docs/HUMAN_REVIEW.md
The human review guide produced in `BE-025` must document the precise step-by-step procedure:
1. Configure necessary environment variables without committing secrets;
2. Start the backend locally (`npm run build && npm run start`);
3. Obtain/sign-in with a Supabase test user to obtain an access token;
4. Supply the access token strictly to the intended hidden interactive prompt;
5. Execute `node fixtures/capture-hotel-search.mjs --base-url http://localhost:3000 --output fixtures/hotel-search.sse`;
6. Execute `node fixtures/capture-cart-approval.mjs --base-url http://localhost:3000 --output fixtures/cart-approval.sse`;
7. Review the allowlisted approval preview in the terminal;
8. Type `APPROVE` manually at the confirmation prompt;
9. Verify that real runtime events include the expected lifecycle (`approval.requested`, `approval.approved`, `task.completed`);
10. Verify that no access tokens, `authContextId`, raw tool arguments, or sensitive PII appear anywhere in the captured fixtures.

### 4. Status Claims & Fixture Integrity
- `READY_FOR_HUMAN_REVIEW` does NOT mean `PRODUCTION_READY`.
- Pending `.sse` files must not be manually fabricated or artificially generated in the codebase.
- If fixtures captured during human review are subsequently committed, they must first be inspected to confirm they are completely sanitized.

## OPEN - escalate, never invent

### Q-001 - Durable persistence and retention
V1 is in-memory with fictional data. Retention, storage and PII handling for
real conversations are undecided.

### Q-002 - Real Noktos integration
Depends on noktos-auth exposing public routes. Until then the mock stands.

### Q-003 - Role-based approval
Approval by someone other than the conversation owner depends on the noktos-auth
role matrix (Q-001 there).
