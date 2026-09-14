# V1 human review handoff

Prepared for BE-025-01; reconciled with task snapshots in BE-025-10 on
2026-09-14. Maximum readiness status:
`READY_FOR_HUMAN_REVIEW`. Human review and authenticated runtime captures are
**pending**. This document does not certify that V1 satisfies every invariant;
the findings below require review. It does not claim production readiness.

The authority is [GOAL](../.loop/GOAL.md), the frozen
[architecture decisions](../.loop/ARCHITECTURE_DECISIONS.md), the
[internal contracts](../.loop/CONTRACTS.md), and public
[contracts version 1.0.0](../contracts/VERSION). D-024 explicitly defers live
capture to this human handoff; absent `.sse` files must not be fabricated.

## Evidence and verification status

| Evidence class | What is known |
| --- | --- |
| Implementation inspection | The paths below were read as source evidence. Observations are not executed security checks. |
| Harness-reported verification | [STATE.json](../.loop/STATE.json) records the BE-025-09 harness review at `2026-09-14T21:03:17Z`, reporting build and full-tree layering checks passed. This is a prior harness report, not a new verification of this handoff or proof of runtime behavior. |
| This documentation task | No build, layering guard, test suite, authenticated capture, approval decision, or backend execution was performed. Only this guide is updated. |
| Human verification | Every checkbox below remains unchecked. Record reviewer, date, revision, observed outcome, and sanitized evidence when conducting review. |

## Implementation observations and human checklist

### Execution and policy

The intended path is:

```text
Agent -> inert ToolHandle/definition -> ToolInvoker -> schema validation
      -> PolicyEngine -> approval validation/consumption
      -> ExecutorRegistry -> Executor -> NoktosClient
```

[ToolDefinition](../src/tools/definitions/tool-definition.ts) declares a string
`executorKey`; its schema and preview mapper supply validation/display behavior,
not execution capability. [ToolRegistry](../src/tools/tool-registry.ts) exposes
copied JSON handles. [ToolInvoker](../src/tools/tool-invoker.ts) validates before
policy and approval checks, then resolves the
[executor registry](../src/execution/executor-registry.ts). The approval-engine
responsibilities currently reside in the invoker and
[approval store](../src/approvals/in-memory-approval.store.ts); there is no
separate class named `ApprovalEngine`.

- [ ] Review import boundaries: agents, definitions, and tool registry cannot
  import execution or Noktos code; external access to execution enters through
  ToolInvoker; concrete executors are imported through ExecutorRegistry; Noktos
  access from outside its own implementation is confined to executors. Use the
  harness's full-tree layering report for mechanical evidence.
- [ ] Confirm malformed arguments and unknown tools stop before executor lookup.
  Verify an undeclared policy returns `FORBIDDEN`, including prototype property
  names, using [PolicyEngine](../src/policy/policy-engine.ts).
- [ ] Compare the frozen policy: `search_hotels` and traveler read/search are
  `AUTO`; cart addition, booking confirmation, and cancellation require human
  approval; everything else is `FORBIDDEN`. AUTO never grants identity access.
  Traveler actions are an implementation gap described below.

### Approval boundary and resumption

[Payload hashing](../src/policy/payload-hash.ts) uses SHA-256 over
[canonical JSON](../src/policy/canonical-json.ts) containing action, actionVersion,
conversationId, taskId and declared material fields. The
[cart](../src/tools/definitions/add-reservation-to-cart.ts),
[confirmation](../src/tools/definitions/confirm-booking.ts), and
[cancellation](../src/tools/definitions/cancel-booking.ts) definitions provide
explicit previews. Confirmation includes `travelerName` in material fields under
D-020's permitted fallback because trusted display-name derivation is absent.
Cancellation normalizes absent `reason` by omitting it before hashing.

[ApprovalDecisionService](../src/approvals/approval-decision.service.ts) checks
conversation ownership, caches idempotent decisions, and requeues only the
matching paused task. [TaskQueueService](../src/tasks/task-queue.service.ts)
dispatches it asynchronously. The
[task store](../src/tasks/in-memory-task.store.ts) preserves `activeApprovalId`
through queued/running states; the
[supervisor processor](../src/tasks/supervisor-task-processor.ts) supplies it to
the invoker. Consumption and clearing precede executor dispatch.

- [ ] Submit each reservation scenario from [demo-provider.md](demo-provider.md).
  Before deciding, observe `approval.requested` and verify no corresponding
  `[MOCK]` cart/confirmation/cancellation invocation appears in the local backend
  log. Fetch `GET /conversations/:id/tasks` as the owner and inspect the
  matching task's `awaiting_human_approval` status and `activeApprovalId`.
- [ ] Review only the allowlisted preview; approve as the conversation owner.
  Verify automatic queued -> running -> completed progression without a separate
  resume call and exactly one mock invocation. Fetch a task snapshot after
  completion to verify `status: completed`, `result`, `finishedAt`, and omitted
  `activeApprovalId`; use events for intermediate states that snapshots may miss.
- [ ] Retry the same decision/idempotency UUID and then an identical decision
  with another UUID. Verify no duplicate execution, requeue or approved event.
- [ ] With a second test user, verify approval decisions and conversation access
  are denied. An administrator label must not grant owner approval authority.
- [ ] Reject a pending request and confirm no dispatch. Check expiry with a
  short, explicitly configured `APPROVAL_TTL_MS` in a separate local run; restore
  `900000` afterward. Pending reads expire lazily and publish one `approval.expired` event per
  pending-to-expired transition. Verify repeated reads, listings and decisions
  publish no duplicate expiry event. Expired approval consumption fails. Do not assume a background task-expiry scheduler exists.
- [ ] Review binding failures for another task/conversation, wrong active ID,
  changed material fields/version, expired or consumed approvals. For material
  mismatch, verify supersession, replacement request, and a fresh pause. The
  fixed scripts do not exercise changed arguments; use source/debugger review
  without bypassing checks or treating new chat text as mutation of a paused job.
- [ ] Verify active approval clearing on consumption, terminal task state and
  replacement. Confirm the ID alone cannot authorize execution.

### Task snapshots and owner access

[ConversationTasksController](../src/http/conversation-tasks.controller.ts),
registered in [HttpModule](../src/http/http.module.ts) with TaskModule, implements
`GET /conversations/:id/tasks -> 200 AgentTask[]`. Its class-level
`@UseGuards(BearerAuthGuard)` requires bearer authentication. Before calling
`InMemoryTaskStore.listByConversation(conversationId)`, it checks that the
conversation exists and `conversation.userId === identity.userId`. Both a missing
conversation and another user's conversation return 404 `CONVERSATION_NOT_FOUND`.
Errors use `{ error: { code, message, requestId } }`.

The controller explicitly projects the frozen [task contract](../contracts/task.ts):
`id`, `conversationId`, `agentName`, `goal`, `status`, `authContextId`, `createdAt`,
and, when defined, `parentTaskId`, `startedAt`, `finishedAt`, `result`, `failure`,
and `activeApprovalId`. It projects result fields `kind`, `data`, `summary` and
failure fields `code`, `message`. These are source observations; authenticated
runtime verification remains pending.

D-025 authorizes the narrow D-018 exception for the opaque `authContextId` in task
snapshots to satisfy frozen contract 1.0.0 and support frontend task/result
projection. It is a server-side handle, never the Supabase access token. The
frontend may handle it internally in transport but must not render it to users.
This exception does not permit `authContextId` in operational events/SSE or
rendered UI, or access tokens in tasks, responses, prompts, events, logs or UI.

- [ ] As the authenticated owner, fetch `GET /conversations/:id/tasks`; verify
  200 and the explicit contract fields above, including only an opaque
  `authContextId`. Check completed task results for assistant response projection.
- [ ] Repeat the request without valid bearer authentication and verify 401.
  With a second authenticated test user, request the owner's conversation and
  verify 404 `CONVERSATION_NOT_FOUND` with no task data. As the owner, request a
  nonexistent conversation and verify the same 404 code and standard envelope.
- [ ] Verify `authContextId` is not rendered in UI or emitted in events/SSE,
  and no access token appears in any task snapshot.

### Credentials, events, and SSE

[BearerAuthGuard](../src/auth/bearer-auth.guard.ts) exchanges the Authorization
header for a non-enumerable request identity. Under the D-018 amendment,
[SupabaseAuthTokenVerifier](../src/auth/supabase-auth-token-verifier.ts) calls
`supabase.auth.getUser(accessToken)` remotely; decoded expiry is retention
metadata, not identity verification. There is no local HS256-secret fallback.
[AuthContextService](../src/auth/auth-context.service.ts) keeps credentials in
private memory and exposes a separate execution resolver. The invoker builds
ephemeral execution credentials only after authorization.

[EventBusService](../src/events/event-bus.service.ts) redacts before buffering and
publishing, assigns per-conversation sequence numbers, and retains 100 events by
default. [Event redaction](../src/events/event-redactor.ts) removes forbidden keys
recursively and projects `tool.called` to action plus label/value previews.
[SSE controller](../src/http/conversation-events.controller.ts) checks ownership,
validates numeric `Last-Event-ID`, replays retained events and subscribes without
an asynchronous gap. Slow connections are closed on write backpressure.

- [ ] Verify missing/invalid/expired bearer credentials and unavailable Supabase
  Auth fail closed. Verify expired task credentials produce
  `AUTH_CONTEXT_EXPIRED` before a mock invocation; re-authenticate, with no
  refresh, impersonation or service credentials. A new HTTP token does not
  replace the original task's retained auth context.
- [ ] Inspect task inputs, provider requests, HTTP responses, logs and SSE using
  fictional data: no access token or credential may escape; operational events
  and rendered UI must also exclude `authContextId`, raw arguments, prompts, reasoning,
  chain-of-thought and scratchpads. Do not paste credentials into chat content.
- [ ] With authenticated `fetch` + `ReadableStream`, disconnect and reconnect
  using the last received numeric sequence in `Last-Event-ID` and the owner
  Authorization header. Verify retained frames retain IDs, timestamps and seq,
  with no new domain emissions. Never put a token in a URL or use EventSource
  as an authenticated-header substitute.
- [ ] Check malformed replay headers return 400, another owner cannot read the
  conversation, and evicted events cause a visible sequence gap requiring
  resynchronization per [HTTP contract](../contracts/http.md). Replay is bounded,
  not durable history; capture utilities do not implement reconnect/replay.
- [ ] Inspect requested/approved/rejected lifecycle event correlation and
  deduplication. Approval payloads should contain only `approvalId`, `status`,
  and optional `action`. Each envelope needs conversation/task/correlation IDs;
  a decision creates a new correlation ID, so do not require one correlation ID
  across the entire conversation. Supersession and pending-expiry producers are implemented; runtime verification
  and approved-but-expired coverage remain pending as noted below.

### Delegation and concurrent messages

[TaskDelegationService](../src/tasks/task-delegation.service.ts) creates a
HotelSearchAgent child with the parent's conversation/auth context and emits the
child ID. [HotelSearchAgent](../src/agents/hotel-search/hotel-search.agent.ts) has
its own prompt, descriptor, bounded provider loop and search-only handle.
[MessageSubmissionService](../src/conversations/message-submission.service.ts)
creates a follow-up supervisor task for each new client message UUID, appends
notes when work is active, and does not edit the existing job. The
[HTTP adapter](../src/http/conversation-messages.controller.ts) returns 202.

- [ ] Capture hotel delegation; correlate `supervisor.delegated` to child
  `parentTaskId` in owner-authenticated task snapshots and both task completions. Verify the supervisor
  completes delegation without awaiting the child and the child cannot book.
- [ ] While a cart task awaits approval, submit `demo:greeting` with a new UUID.
  Verify 202 and a separate task in owner-authenticated snapshots, with no
  change to the paused task's goal. Inspect the stored pending note and unchanged
  material in local state. Retry the same client UUID and verify no duplicate task.
  The queue drains processors serially; asynchronous acceptance does not imply
  simultaneous processor execution.

## Manual capture procedure (D-024; not yet executed)

1. Use Node.js 20 or newer, provisioned npm dependencies, a trusted local checkout,
   an interactive terminal, and network access to the configured Supabase Auth
   project. Read [fixture instructions](../fixtures/README.md) and both utilities:
   [hotel capture](../fixtures/capture-hotel-search.mjs) and
   [cart capture](../fixtures/capture-cart-approval.mjs).
2. Configure the backend process environment from [.env.example](../.env.example):
   `PORT=3000`, `LLM_PROVIDER=demo-provider`, `LLM_MODEL=fictional-demo-model`,
   `APPROVAL_TTL_MS=900000`, `NOKTOS_BASE_URL=http://localhost:4010/mock-noktos`,
   and your test project's `SUPABASE_URL` and public/publishable
   `SUPABASE_ANON_KEY`. Never supply JWT secrets, service-role keys or refresh
   tokens. Do not commit credentials or local environment files. Configuration
   reads process environment in [runtime-config.ts](../src/config/runtime-config.ts);
   [main.ts](../src/main.ts) does not automatically load a `.env` file. The mock
   adapter is in-process; a live Noktos server is not required.
3. From the repository root, start the backend in its terminal:

   ```sh
   npm run build && npm run start
   ```

4. Sign in through your existing Supabase test-user flow for that project and
   obtain an unexpired access token. Keep it out of shell history, command-line
   arguments, environment variables, files, URLs, logs and chat messages. Enter
   it **only at each capture utility's hidden interactive token prompt**.
5. Ensure `fixtures/` exists and both requested output files are absent. In a
   second interactive terminal at the repository root, run:

   ```sh
   node fixtures/capture-hotel-search.mjs --base-url http://localhost:3000 --output fixtures/hotel-search.sse
   ```

   Enter the test-user token at the hidden prompt. The utility creates a
   conversation, subscribes before submitting `demo:hotel-delegation`, then
   requires the supervisor and its correlated HotelSearchAgent child to complete.
6. Run the cart capture separately:

   ```sh
   node fixtures/capture-cart-approval.mjs --base-url http://localhost:3000 --output fixtures/cart-approval.sse
   ```

   Enter the token only at this utility's hidden token prompt. It submits
   `demo:add-reservation-to-cart` in a new conversation and fetches the matching
   pending approval after its runtime event arrives.
7. Review the terminal's allowlisted preview: Hotel, Check-in, Check-out,
   Huésped, Habitaciones, Precio total. It should describe the fictional demo
   hotel/traveler, January 10–12, 2030, one room, 200 MXN. Inspect backend output
   to confirm no cart invocation has occurred before approval.
8. Only after review, **manually type `APPROVE` and press Enter** at the separate
   hidden confirmation prompt. Never pipe input, automate approval or simulate a
   human. Any other answer cancels without submitting a rejection; the pending
   request remains in backend memory until expiry is observed.
9. Inspect the resulting original SSE frames: cart success requires
   `approval.requested`, then `approval.approved` with the same approval/task,
   then that task's `task.completed`. Check conversation ID, task IDs, approval
   ID, correlation metadata and contiguous numeric sequences. Hotel success
   requires both correlated task completions. Merely having a file is not proof
   of a successful capture.
10. Before any subsequent human commit, inspect **every captured frame** for
    access tokens, `authContextId`, credentials, raw tool arguments, sensitive PII
    and private model content, including values under otherwise innocuous keys.
    Preserve original frame bytes, IDs, timestamps, sequence numbers and payloads.
    The utilities validate structure; they do not certify sanitization. If unsafe
    content exists, do not commit or edit the stream into apparent evidence:
    report the issue for correction and capture anew. Only sanitized, unchanged
    runtime captures may be considered for a later human-controlled commit.

- [ ] Hotel runtime capture completed and inspected.
- [ ] Cart runtime capture manually approved, completed and inspected.
- [ ] Both files reviewed for provenance, correlation and sanitization.

### Capture limitations and failure handling

Both utilities require TTY stdin and stderr and refuse redirected/piped credential
input. Their fixed 120-second deadline includes token entry, network calls and
cart preview/confirmation; the stream limit is 8 MiB. They reject redirects,
malformed frames, sequence gaps/duplicates, failed/cancelled tasks and premature
stream closure. The cart utility also rejects rejected, expired or superseded
approval lifecycles. They neither start the backend nor retry or reconnect.

Files are opened only after successful capture with exclusive `wx` creation and
mode `0600`; existing files and symlinks are refused. This refusal occurs at the
end, so check output availability **before** running: backend work/approval may
already have happened when a write fails. The parent directory must exist. A
write failure can leave a partial file; do not treat it as evidence or silently
overwrite it. Resolve/archive failed output deliberately before recapturing at
the prescribed paths.

Ctrl-C/timeout closes capture, not backend tasks. Cancellation after approval
cannot undo execution. Saved content contains original SSE frames through the
required completion, not HTTP headers, approval responses or task snapshots.

## Review findings and unresolved coverage

These are source observations for human assessment, not fixes or new policy.

| Finding | Evidence and consequence |
| --- | --- |
| Supersession and pending-expiry producers implemented | `src/tools/tool-invoker.ts` publishes `approval.superseded` through EventBusService immediately after a successful mismatch replacement, identifying the original approval with trusted conversation/task metadata and the supervisor worker correlation ID. Publication precedes active-approval clearing and the replacement `approval.requested` event from TaskService; unsuccessful or repeated replacement attempts emit nothing. Payload contains only approval ID, status and action. Runtime verification remains pending. `src/approvals/in-memory-approval.store.ts` now publishes `approval.expired` through the existing EventBusService injected by ApprovalModule immediately after its synchronous pending-to-expired transition. The envelope uses stored conversation/task IDs and a server-generated correlation UUID; the payload contains exactly `approvalId`, `status`, and `action`. The transition itself deduplicates repeated reads, listings and decisions. TTL and lazy expiry triggers are unchanged; no timer was added. Pending-expiry runtime verification remains pending. Requested/approved/rejected producers exist in TaskService/ApprovalDecisionService; do not mark the full lifecycle complete. |
| Traveler read/search absent | PolicyEngine explicitly leaves traveler action identifiers undeclared; ToolRegistry contains only search and three reservation tools. Frozen AUTO traveler policy does not imply a working authorized traveler API. |
| Tasks endpoint implemented; runtime verification pending | [ConversationTasksController](../src/http/conversation-tasks.controller.ts) is registered in [HttpModule](../src/http/http.module.ts), requires bearer authentication, checks ownership before listing tasks, and returns 404 `CONVERSATION_NOT_FOUND` for missing or non-owned conversations. Its explicit projection matches frozen `AgentTask` 1.0.0. D-025 approves the opaque `authContextId` in snapshots only as described above; tokens remain prohibited and the handle must not enter events or rendered UI. Owner-only access and result projection still require authenticated human verification. |
| Redaction is key-based | `src/events/event-redactor.ts` retains scalar text values and preview strings. It is not a general secret/PII detector. Safe producers and human fixture inspection remain necessary. |
| Tool, HotelSearchAgent and SupervisorAgent lifecycle producers implemented | `src/tools/tool-invoker.ts` publishes `tool.called` through EventBusService immediately before executor dispatch, after authorization, approval consumption, executor resolution and credential checks. Its payload contains only the registered action and allowlisted preview label/value entries. Successful execution publishes `tool.completed` with only the registered action; executor rejection publishes no completion. Both events use trusted conversation/task IDs, the task's agent name, and the invocation correlation ID falling back to the task ID. Paths stopped before dispatch publish neither event. Runtime verification remains pending. `src/tasks/hotel-search-task-processor.ts` now publishes `agent.started` immediately before HotelSearchAgent invocation after task/context validation, then `agent.completed` for a completed invocation or `agent.failed` for a failed or throwing invocation. Stopped invocations publish only `agent.started` and retain their existing task outcomes. These events pass through EventBusService with empty payloads, trusted conversation/task IDs, `HotelSearchAgent` as agentName, and the unchanged context correlation ID. Invalid task/context input publishes no agent lifecycle events. HotelSearchAgent runtime verification remains pending. `src/tasks/supervisor-task-processor.ts` now uses EventBusService injected through AgentRuntimeModule to publish `agent.started` immediately before validated SupervisorAgent invocation, `agent.completed` for answer/cart/confirmation/cancellation success or after successful child-task delegation without awaiting child execution, and `agent.failed` for failed outcomes or invocation/delegation exceptions. Stopped outcomes emit only `agent.started`, preserving approval pauses and rejection/forbidden handling. Invalid task/context inputs emit no lifecycle events. SupervisorAgent lifecycle payloads are empty and use trusted conversation/task IDs, `SupervisorAgent` as agentName, and the unchanged context correlation ID; existing task results and failure mappings are preserved. This is source implementation evidence; SupervisorAgent runtime verification remains pending under D-024. |
| Pending notes are retained | MessageSubmissionService creates separate follow-up tasks, but no reader that applies/clears `pendingUserNotes` on child result was found. Do not claim result-driven note reconciliation; the implemented path is separate task submission. |
| Expiry is not a timer-driven event | ApprovalStore expires pending entries on access and publishes the transition once. Approved-but-expired requests still fail consumption without becoming expired or publishing an expiry event there; that remaining D-023 coverage needs review. Runtime verification remains pending. SSE authenticates on connection; the controller has no ongoing token-expiry closure timer. Do not claim continuous reauthentication. |
| Demo search destination corrected in source | `demo:hotel-search` now requests `Demo Harbor`, matching the mock catalog destination. Source inspection indicates two expected fictional matches: Mock Lantern House and Mock Cloud Garden. Authenticated runtime verification remains pending; this correction does not establish live availability. |

- [ ] Review and disposition each finding with the architect/human; do not
  silently invent security, retention, integration or public-contract decisions.
- [ ] Record remaining gaps even if both happy-path captures succeed.

## Demo limits and final human disposition

V1 is **DEMO / FICTIONAL / SCRIPTED**:
[DemoScriptedLlmProvider](../src/llm/demo-scripted-llm-provider.ts) is deterministic,
not a real external generative model. [MockNoktosClient](../src/noktos/mock-noktos-client.ts)
returns `mock: true` and logs `[MOCK]`; reservation identifiers are synthetic.
Confirmation and cancellation scripts use independent fictional IDs, not a real
cart/booking integration. No real traveler PII is permitted.

Everything is in process memory. Restart loses **conversations, tasks, approvals,
auth contexts and event buffers**, including queued work and replay history.
There is no durable persistence, Redis, external queue, WebSocket transport,
real Noktos integration or role-based approval beyond the conversation owner.
Durable retention/PII policy, real integration and non-owner approval remain open
architecture decisions. Remote Supabase verification is still a network
prerequisite even though the provider and Noktos operations are scripted/mocked.

- [ ] Confirm these limitations are acceptable for a fictional demo and that no
  production claim is made.
- [ ] Record human disposition, unresolved findings and sanitized evidence. The
  maximum status remains `READY_FOR_HUMAN_REVIEW`; this checklist does not grant
  permission to deploy, release, change frozen contracts or commit credentials.
