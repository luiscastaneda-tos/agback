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

## OPEN - escalate, never invent

### Q-001 - Durable persistence and retention
V1 is in-memory with fictional data. Retention, storage and PII handling for
real conversations are undecided.

### Q-002 - Real Noktos integration
Depends on noktos-auth exposing public routes. Until then the mock stands.

### Q-003 - Role-based approval
Approval by someone other than the conversation owner depends on the noktos-auth
role matrix (Q-001 there).
