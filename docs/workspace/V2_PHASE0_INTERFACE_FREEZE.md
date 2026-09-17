# V2-A Phase 0: Shared Interface Freeze

> [!IMPORTANT]
> **CANONICAL, FROZEN INTERFACE SPECIFICATION FOR V2-A.**
> This document binds both **Track A** (`noktos-agent-next`) and **Track B** (`noktos-agent-backend`).
> Neither track may unilaterally alter the contracts, endpoints, DTO shapes, or behaviors defined here.
> If a genuine defect is discovered during parallel work, both tracks must halt, and the change must be
> coordinated and recorded by a human across both repositories.

---

## 1. Executive Summary & Constraints

- **Milestone:** V2-A (Functional demo on Next.js + NestJS + `DemoScriptedLlmProvider` + `MockNoktosClient`).
- **Repositories Involved:**
  - `noktos-agent-backend` (`agback/`): NestJS backend runtime. Unchanged framework (`P-002`), preserved execution chokepoint (`P-003`).
  - `noktos-agent-next` (`noktos-agent-next/`, sibling repo): New Next.js frontend (`P-001`).
  - `noktos-agent-frontend` (`agfront/`): Frozen V1 baseline. Read-only reference for migration; no V2 code.
  - `noktos-auth` (`noktos-auth/`): Independent identity gateway. Not used as a proxy for the Agent API (`Q-P3`).
- **Contract Version:** `1.0.0` (FROZEN). No DTO or wire format is modified for V2-A.
- **Explicitly OUT of V2-A Scope:**
  - LangGraph / LangChain (`P-010`).
  - Real LLM providers (`P-009`, scheduled for V2-B).
  - Real Noktos Core integration (`P-011`, blocked on Noktos Core service existence).
  - Branding, commercial design system, CSS framework additions (`P-004`, `P-012`).
  - Session persistence, refresh tokens, advanced logout (`P-005`, `P-012`).
  - Role-based UI / multi-role flows (`P-012`, `Q-002`).

---

## 2. HTTP & SSE API Surface (Frozen at Contract 1.0.0)

All endpoints require the HTTP header:
```http
Authorization: Bearer <supabase_access_token>
```
Tokens are validated by NestJS `@UseGuards(BearerAuthGuard)`. The token is never accepted in query parameters, never serialized in events or responses, and never logged.

### Endpoint Matrix

| Method | Path | Auth | Request Body | Response Body | Status Codes | Authoritative Source | SSE Invalidation Role |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/conversations` | Bearer Token | *(empty)* | `Conversation` | `201 Created`<br>`401`, `500` | `InMemoryConversationStore` | Root entity creation. Yields `conversationId`. |
| `POST` | `/conversations/:id/messages` | Bearer Token | `ChatRequest` | `ChatResponse` | `202 Accepted`<br>`400`, `401`, `404`, `500` | `MessageSubmissionService` | Accepts message asynchronously. Results arrive via SSE and task updates. |
| `GET` | `/conversations/:id/tasks` | Bearer Token | *(none)* | `AgentTask[]` | `200 OK`<br>`401`, `404`, `500` | `InMemoryTaskStore` | **Canonical task authority**. Re-fetched on task/approval SSE events. |
| `GET` | `/conversations/:id/approvals` | Bearer Token | *(none)* | `ApprovalRequest[]` | `200 OK`<br>`401`, `404`, `500` | `InMemoryApprovalStore` | **Canonical approval authority**. Re-fetched on approval SSE events. |
| `POST` | `/approvals/:id/decision` | Bearer Token | `ApprovalDecision` | `ApprovalRequest` | `200 OK`<br>`400`, `401`, `404`, `500` | `ApprovalDecisionService` | Records decision. Triggers automatic requeue (approve) or rejection halt. |
| `GET` | `/agents` | Bearer Token | *(none)* | `AgentDescriptor[]` | `200 OK`<br>`401` | `AgentRegistryService` | Static agent registry snapshot loaded at boot. |
| `GET` | `/conversations/:id/events` | Bearer Token (`fetch`) | *(none)* | `text/event-stream` | `200 OK`<br>`400`, `401`, `404`, `500` | `EventBusService` | **Operational signal channel**. Replay via `Last-Event-ID`. |

---

### Detailed Endpoint Specifications

#### 1. `POST /conversations`
- **Purpose:** Initiates an isolated conversation for the authenticated user.
- **Request:** Empty body.
- **Response (201 Created):**
  ```typescript
  interface Conversation {
    id: string; // UUID
    userId: string; // Supabase user id
    title?: string;
    createdAt: string; // ISO8601
    updatedAt: string; // ISO8601
    state: {
      preferences: Record<string, unknown>;
      pendingUserNotes: string[];
      lastAppliedAt?: string; // ISO8601
    };
  }
  ```
- **Error Codes:** `401 AUTHENTICATION_FAILED`, `500 CONVERSATION_CREATION_FAILED`.

#### 2. `POST /conversations/:id/messages`
- **Purpose:** Submits a user prompt into the conversation. Returns immediately (`202 Accepted`) by contract; processing is delegated asynchronously.
- **Request:**
  ```typescript
  interface ChatRequest {
    content: string;
    clientMessageId: string; // UUID, client-generated for idempotency
  }
  ```
- **Response (202 Accepted):**
  ```typescript
  interface ChatResponse {
    messageId: string; // UUID
    conversationId: string; // UUID
    accepted: true;
    createdTaskIds: string[]; // UUIDs of root tasks scheduled
    assistantMessage?: string; // Empty in V1/V2-A asynchronous model
  }
  ```
- **Error Codes:** `400 INVALID_CHAT_REQUEST`, `401 AUTHENTICATION_FAILED`, `404 CONVERSATION_NOT_FOUND`, `500 MESSAGE_SUBMISSION_FAILED`.

#### 3. `GET /conversations/:id/tasks`
- **Purpose:** Fetches the full authoritative list of tasks for the conversation.
- **Wire Projection (`D-025`):**
  ```typescript
  interface AgentTask {
    id: string; // UUID
    conversationId: string; // UUID
    parentTaskId?: string; // UUID
    agentName: string;
    goal: string;
    status: 'queued' | 'running' | 'awaiting_human_approval' | 'completed' | 'failed' | 'cancelled';
    authContextId: string; // UUID (Internal handle; MUST NOT be displayed in UI)
    createdAt: string; // ISO8601
    startedAt?: string; // ISO8601
    finishedAt?: string; // ISO8601
    result?: {
      kind: string;
      data: unknown;
      summary: string;
    };
    failure?: {
      code: 'TOOL_ERROR' | 'UPSTREAM_ERROR' | 'TIMEOUT' | 'APPROVAL_REJECTED' | 'APPROVAL_EXPIRED' | 'AUTH_CONTEXT_EXPIRED' | 'POLICY_FORBIDDEN' | 'CANCELLED';
      message: string;
    };
    activeApprovalId?: string; // UUID
  }
  ```
- **Security Rule:** `authContextId` is strictly a backend opaque reference required by contract 1.0.0; the frontend must **never** render it or log it.

#### 4. `GET /conversations/:id/approvals`
- **Purpose:** Fetches all approvals associated with the conversation.
- **Wire Projection:**
  ```typescript
  interface ApprovalRequest {
    id: string; // UUID
    conversationId: string; // UUID
    taskId: string; // UUID
    action: string; // e.g. 'add_reservation_to_cart'
    actionVersion: number;
    requestedByAgent: string;
    status: 'pending' | 'approved' | 'rejected' | 'expired' | 'superseded';
    summary: string;
    inputPreview: Array<{
      label: string;
      value: string;
      emphasis?: 'normal' | 'warning';
    }>;
    payloadHash: string;
    createdAt: string; // ISO8601
    expiresAt: string; // ISO8601
    resolvedAt?: string; // ISO8601
    resolvedBy?: string; // Supabase user id
    rejectionReason?: string;
  }
  ```

#### 5. `POST /approvals/:id/decision`
- **Purpose:** Records a human decision (`approve` or `reject`) on a pending approval.
- **Request:**
  ```typescript
  interface ApprovalDecision {
    decision: 'approve' | 'reject';
    reason?: string;
    idempotencyKey: string; // UUID, client-generated
  }
  ```
- **Response (200 OK):** Returns the updated `ApprovalRequest`.
- **Behavior:**
  - Idempotent: repeated calls with identical `idempotencyKey` return the cached `ApprovalRequest` without duplicate processing.
  - Ownership: Only the conversation owner `userId` can approve/reject.
  - Fail closed: If already resolved, expired, or superseded, returns current state without re-executing.

#### 6. `GET /agents`
- **Purpose:** Returns registered agent descriptors.
- **Response (200 OK):**
  ```typescript
  interface AgentDescriptor {
    name: string;
    displayName: string;
    description: string;
    kind: 'supervisor' | 'specialist';
    toolNames: string[];
    status: 'active' | 'disabled';
  }
  ```

#### 7. `GET /conversations/:id/events` (SSE)
- **Purpose:** Real-time event stream providing operational telemetry and cache invalidation signals.
- **Headers:**
  - `Authorization: Bearer <supabase_access_token>`
  - `Last-Event-ID: <seq>` *(optional, on reconnect)*
- **Transport Requirements:** Native browser `fetch` + `ReadableStream`. `EventSource` is **strictly forbidden** because it cannot pass custom headers.
- **Wire Framing:**
  ```text
  id: <seq>
  data: {"id":"...","seq":<seq>,"type":"...","conversationId":"...","taskId":"...","correlationId":"...","occurredAt":"...","payload":{...}}
  ```

---

## 3. Contracts & DTO Freeze (1.0.0)

1. **Vendoring Discipline:**
   - `noktos-agent-next` will vendor all `.ts` files from `noktos-agent-backend/contracts/` into its own `src/contracts/`.
   - `noktos-agent-next` will include a `contracts.lock` and `scripts/verify-contracts.mjs` running during `npm run build` to guarantee zero drift.
2. **Contracts Included:**
   - `common.ts`: UUID, ISO8601.
   - `conversation.ts`: `Conversation`, `ConversationState`, `ChatRequest`, `ChatResponse`.
   - `task.ts`: `AgentTask`, `TaskStatus`, `TaskResult`, `TaskFailure`, `TaskFailureCode`.
   - `approval.ts`: `ApprovalRequest`, `ApprovalStatus`, `ApprovalPreviewField`, `ApprovalDecision`.
   - `agent.ts`: `AgentDescriptor`, `AgentKind`, `AgentStatus`.
   - `events.ts`: `AgentEvent`, `AgentEventType`, `ToolCalledPayload`.
3. **Data Redaction & Safe Rendering:**
   - **`authContextId`:** Stored internally in task models; NEVER rendered to DOM, NEVER logged.
   - **`payloadHash`:** Internal verification only; NEVER displayed in primary UX.
   - **UUIDs:** Primary UI must display friendly labels (Agent names, task goals, timestamps), never raw UUIDs (`P-006`).
   - **Chain of Thought:** Forbidden in all payloads and views (`AGENTS.md`).

---

## 4. Assistant Response Projection (`Q-P2` Resolved)

### The Runtime Narrowing Predicate (Track A)
In V1, `chatResponses.ts` rendered only `task.result.summary`.
For V2-A, under approved decision `Q-P2`, `noktos-agent-next` will implement the following defensive narrowing logic:

```typescript
/**
 * Safe runtime check for structured answer text.
 * Does not alter frozen contract 1.0.0.
 */
export function isAnswerTextData(data: unknown): data is { text: string } {
  return (
    typeof data === 'object' &&
    data !== null &&
    'text' in data &&
    typeof (data as { text: unknown }).text === 'string' &&
    (data as { text: string }).text.trim().length > 0
  );
}

/**
 * Projects conversational assistant content from completed tasks.
 */
export function projectTaskAssistantContent(task: AgentTask): string | null {
  if (task.status === 'completed' && task.result) {
    if (task.result.kind === 'answer' && isAnswerTextData(task.result.data)) {
      return task.result.data.text;
    }
    // Fallback for cart_completed, confirmation_completed, or missing text
    return task.result.summary;
  }

  if (task.status === 'failed' && task.failure) {
    // failure.message is guaranteed sanitized by contract 1.0.0
    return task.failure.message;
  }

  return null;
}
```

### Invariants:
- **No Contract Mutation:** `contracts/task.ts` retains `data: unknown`.
- **Arbitrary Data Guard:** Raw JSON or unvalidated properties are never rendered directly.
- **Snapshots as Authority:** Chat responses are derived from task snapshots (`GET /conversations/:id/tasks`), never inferred directly from raw SSE frames.

---

## 5. Approval Flow Contract

### Sequence & Responsibilities
1. **Trigger:** `SupervisorAgent` delegates or invokes a tool requiring approval (e.g. `add_reservation_to_cart`).
2. **Backend Pause:** Backend pauses execution before calling any executor (`D-002`, `D-003`). `ApprovalRequest` is created with status `pending`. Event `approval.requested` is emitted.
3. **Frontend Invalidation:** Frontend receives `approval.requested` and triggers `approvals.refresh()` + `tasks.refresh()`.
4. **Presentation:** Frontend displays the approval card contextually in chat and/or in the approvals panel:
   - Only allowlisted `inputPreview` rows (`label`, `value`, `emphasis`) are rendered.
   - Buttons "Approve" and "Reject" are enabled **only if** `status === 'pending'`.
5. **Decision Submission:** User clicks Approve or Reject:
   - Frontend sets local state to `submitting` (disabling buttons to prevent double-clicks).
   - Frontend generates a unique `idempotencyKey: randomUUID()`.
   - Sends `POST /approvals/:id/decision`.
6. **Backend Execution / Chokepoint:**
   - **On `approve`:** Backend marks approval `approved`, emits `approval.approved`, requeues task, enqueues to `TaskQueue`. On task resumption, `ToolInvoker` passes `activeApprovalId` to `ApprovalEngine`, which validates and consumes the approval, then invokes `ExecutorRegistry -> Executor -> MockNoktosClient`.
   - **On `reject`:** Backend marks approval `rejected`, emits `approval.rejected`, marks task `failed` with code `APPROVAL_REJECTED`. **Zero executor calls occur.**
7. **No Optimistic Execution:** Frontend updates UI status only upon receiving server response or snapshot refresh.

---

## 6. SSE & Snapshot Synchronization Model

```
   [ Backend EventBus ]
            │
      (SSE stream)
            │
            ▼
   [ Frontend SSE Parser ] ──(Deduplicate by seq)──► [ Activity Store ]
            │
   (Operational Signal)
            │
            ├─► Task Event? ──────► Trigger: GET /conversations/:id/tasks
            │
            └─► Approval Event? ──► Trigger: GET /conversations/:id/approvals
```

### Rules:
1. **SSE = Signal; HTTP = Authority:** SSE frames do not replace task or approval models. They inform the client that state has changed, prompting a coalesced refresh.
2. **Task Invalidation Events:**
   - `task.created`, `task.queued`, `task.started`, `task.completed`, `task.failed`, `task.cancelled`
   - `approval.requested`, `approval.approved`, `approval.rejected`, `approval.expired`, `approval.superseded`
3. **Approval Invalidation Events:**
   - `approval.requested`, `approval.approved`, `approval.rejected`, `approval.expired`, `approval.superseded`
4. **Ordering & Replay:**
   - Client tracks highest received `seq`.
   - Reconnect sends `Last-Event-ID: <seq>`.
   - Backend replays from `seq + 1`.
   - If a gap in `seq` is detected that cannot be reconciled, client immediately executes full reload of tasks and approvals.

---

## 7. Environment & Auth Contract

### Frontend (`noktos-agent-next/.env.local`)
```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
NEXT_PUBLIC_BACKEND_URL=http://localhost:3000
```

### Security Invariants:
- **`NEXT_PUBLIC_*` strictly:** Only public, safe-to-expose values may use this prefix.
- **No Service Role Keys:** Never place `SUPABASE_SERVICE_ROLE_KEY` in frontend environment files.
- **No Backend Secrets:** Database URLs, API secret keys, etc., stay in backend `.env` only.
- **Memory-Only Session:** Tokens are stored in JavaScript memory (`auth.ts`). No `localStorage`, no `sessionStorage`, no cookies (`P-005`). Page reload forces re-login.

---

## 8. Track Ownership & Boundary Matrix

| Entity / Directory | Track A (`noktos-agent-next`) | Track B (`noktos-agent-backend`) | Notes |
| :--- | :--- | :--- | :--- |
| `noktos-agent-next/` | **Full Read/Write** | **Forbidden** (No access) | Frontend V2 codebase. |
| `noktos-agent-backend/src/` | **Forbidden** (No access) | **Full Read/Write** | Backend implementation. |
| `noktos-agent-backend/contracts/` | **Read-Only** (Vendored) | **Read-Only** (Frozen) | Contract 1.0.0 frozen. No modifications allowed. |
| `noktos-agent-frontend/` | **Read-Only** (Reference only) | **Forbidden** (No access) | Frozen V1 baseline. |
| `noktos-auth/` | **Forbidden** (No access) | **Forbidden** (No access) | Independent service. |
| `docs/workspace/` | **Read-Only** | **Append/Update Only** | Workspace documentation. |

*Coordination rule:* Track A and Track B commit only to their own separate repositories. Neither track modifies files owned by the other.

---

## 9. V2-A Integration Checkpoint (Verification Script)

Before V2-A is declared complete, the integrated stack must pass this deterministic smoke test:

1. **Auth:** User logs in via Supabase in `noktos-agent-next`.
2. **Session Creation:** App performs exactly one `POST /conversations` (verified in Network tab).
3. **Greeting:** User sends `demo:greeting`. Assistant responds with natural text (e.g. *"Hello! I am your Noktos travel assistant..."*) projected via `result.data.text`.
4. **Delegation:** User sends `demo:hotel-delegation`.
   - SupervisorAgent task appears.
   - HotelSearchAgent child task appears.
   - Relationship is displayed cleanly without raw UUIDs in primary UX.
5. **Approval - Approve Path:** User sends `demo:add-reservation-to-cart`.
   - Approval card appears with status `pending` showing hotel preview.
   - Backend logs confirm cart mock has **not** executed.
   - User clicks **Approve**.
   - Status updates to `approved`.
   - Backend logs confirm exactly one `[MOCK] Noktos cart adapter invoked.`.
   - Task finishes with status `completed`.
6. **Approval - Reject Path:** User triggers a second approval and clicks **Reject**.
   - Status updates to `rejected`.
   - Backend logs confirm zero cart adapter invocations.
   - Task finishes with status `failed` (`APPROVAL_REJECTED`).
7. **Cleanliness:** Zero access tokens, `authContextId`s, raw JSON payloads, or chain-of-thought strings rendered in DOM or browser console.

---

## 10. Pendientes Documentales / Post-Entrega (No Bloqueantes para V2-A Demo)

Registrados formalmente para refinamiento posterior a la demo, sin detener la implementación de V2-A:
1. **SSE Gap Repair:** Aclarar que V1 no cuenta con un mecanismo automático de SSE gap repair (un gap no recuperable detona resincronización de snapshots).
2. **Reutilización de `idempotencyKey`:** Precisar semántica de reutilización del mismo `idempotencyKey` para reintentos de la misma intención en approvals.
3. **Distribución de responsabilidades de aprobación:** Evitar referirse a "ApprovalEngine" como una clase concreta monolítica, ya que la responsabilidad de aprobación se encuentra distribuida entre `ApprovalDecisionService`, `InMemoryApprovalStore` y `ToolInvoker`.

