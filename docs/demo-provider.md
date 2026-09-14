# DEMO / FICTIONAL / SCRIPTED provider

`DemoScriptedLlmProvider` is a deterministic fictional script, not an external
generative model. It produces only the existing `{ text, toolCalls }` intent
envelope. It performs no network requests or tool execution.

The intended configuration is:

```dotenv
LLM_PROVIDER=demo-provider
LLM_MODEL=fictional-demo-model
```

`createDemoProviderRegistry({ llmProvider: 'demo-provider', llmModel:
'fictional-demo-model' })` constructs the existing registry and registers the
scripted provider. Selecting an unregistered provider still fails when generating;
there is no fallback. The script does not vary by model name.

Use exactly one of these strings as the latest user message (case-sensitive,
with no surrounding whitespace). System prompts do not select scenarios.

| Exact input | Output when the required handle is offered |
| --- | --- |
| `demo:greeting` | Fixed fictional greeting, no calls |
| `demo:clarification` | Fixed scenario clarification, no calls |
| `demo:hotel-delegation` | `delegate_to_hotel_search({ goal: 'demo:hotel-search' })` |
| `demo:hotel-search` | `search_hotels({ destination: 'Fictional Demo City' })` |
| `demo:add-reservation-to-cart` | `add_reservation_to_cart` with fixed fictional reservation arguments |
| `demo:confirm-booking` | `confirm_booking` with fixed fictional cart arguments |
| `demo:cancel-booking` | `cancel_booking` with fixed fictional booking arguments |

Unknown input or an absent required handle returns the same fixed clarification
without calls. No natural-language inference is performed. Calls are limited to
names offered in `request.tools`; the provider imports no agents or prompts.

Reservation inputs use `fictional-traveler-1` / `Fictional Demo Traveler`.
The cart scenario uses `fictional-hotel-1` / `Fictional Demo Hotel`, January
10–12, 2030, one room, and a total of 200 MXN. Confirmation uses the standalone
synthetic `fictional-cart-item-1` and 200 MXN. Cancellation uses
`fictional-booking-1` and reason `Fictional demo cancellation`. These are
independent intent fixtures, not IDs obtained from completed runtime operations.
The existing confirmation definition binds the supplied display name in its
material fields; the script does not assert trusted identity derivation.

Call IDs are deterministic: `demo-delegation-1`, `demo-search-1`, `demo-cart-1`,
`demo-confirm-1`, and `demo-cancel-1`, respectively. To continue a search, include
the assistant output followed by a tool message whose `toolCallId` matches
`demo-search-1`. The provider returns a fixed terminal fictional summary with
no further call. It does not echo result contents or assert a result count.
An already requested call without its result is not repeated. Correlation uses
only history after the latest user message; no shared conversation state exists.

Reservation calls remain subject to schema validation, policy and mandatory
human approval through the existing runtime chokepoint. This provider neither
grants approval nor claims execution. SupervisorAgent offers delegation and the
registered `add_reservation_to_cart` and `confirm_booking` handles through
AgentRuntime. HotelSearchAgent remains search-only. Neither agent offers cancellation.

`AppModule` imports `AgentRuntimeModule`, which registers both agent descriptors
and their existing task processors during initialization, before HTTP traffic is
accepted. It uses the shared task infrastructure, agent registry, tool registry
and invoker. The provider adapter uses `loadRuntimeConfig()` and
`createDemoProviderRegistry`; configured provider/model selection is preserved,
and an unknown provider fails generation without fallback.

With the demo configuration above and the remaining required runtime configuration,
create a conversation through the authenticated `POST /conversations` endpoint.
Submit either body to `POST /conversations/:id/messages` using the existing
Authorization header authentication:

```json
{ "content": "demo:greeting", "clientMessageId": "00000000-0000-4000-8000-000000000001" }
```

```json
{ "content": "demo:hotel-delegation", "clientMessageId": "00000000-0000-4000-8000-000000000002" }
```

Use a new client message UUID for each new submission. Submission returns 202;
results arrive through `GET /conversations/:id/events`. The greeting runs through
`SupervisorTaskProcessor` and completes with an answer. Hotel delegation completes
the supervisor task with a child task ID; `HotelSearchTaskProcessor` runs that
child with the `demo:hotel-search` goal, invokes `search_hotels` through
`ToolInvoker`, and completes with a fictional summary. Sending `demo:hotel-search`
directly to the supervisor produces clarification because it has no search handle.

To run the implemented cart approval flow, use the same conversation owner’s
`Authorization: Bearer <supabase_access_token>` header on every request, including
SSE (use `fetch` + `ReadableStream`; never put the token in the URL).

1. Submit to `POST /conversations/:id/messages`:

   ```json
   { "content": "demo:add-reservation-to-cart", "clientMessageId": "00000000-0000-4000-8000-000000000003" }
   ```

2. After the 202 response, observe `GET /conversations/:id/events` or inspect
   `GET /conversations/:id/tasks` and `GET /conversations/:id/approvals`.
   The supervisor task pauses as `awaiting_human_approval`. Review the approval’s
   allowlisted `inputPreview`; no cart addition has executed at this point.
3. As the conversation owner, submit to `POST /approvals/:id/decision` using
   the pending approval ID:

   ```json
   { "decision": "approve", "idempotencyKey": "00000000-0000-4000-8000-000000000004" }
   ```

   Reuse that key when retrying the same decision. A valid approval automatically
   requeues the paused task once; there is no manual resume request.
4. The resumed supervisor passes the task’s existing approval ID to ToolInvoker,
   which validates binding, material arguments, expiry and single-use consumption
   before dispatch. Only a completed invocation produces the task result data
   `{ "mock": true, "cartItemId": "<synthetic ID>", "status": "added" }`.
   Observe completion over SSE or the tasks endpoint. Authentication expiry
   produces `AUTH_CONTEXT_EXPIRED` and requires authentication again.

Use `"decision": "reject"` with its own idempotency key to decline an approval;
rejection does not authorize or resume cart execution. Changes to material
arguments require a replacement approval under the existing runtime checks.

To run the implemented confirmation flow, use the same authenticated conversation
owner and endpoints as above:

1. Submit to `POST /conversations/:id/messages`:

   ```json
   { "content": "demo:confirm-booking", "clientMessageId": "00000000-0000-4000-8000-000000000005" }
   ```

   This scenario uses standalone synthetic cart input `fictional-cart-item-1`,
   fictional traveler `fictional-traveler-1` / `Fictional Demo Traveler`, and
   200 MXN. It does not use the preceding cart result or require that scenario.
2. After the 202 response, observe SSE or the tasks and approvals endpoints.
   The task pauses as `awaiting_human_approval`; review the confirmation preview,
   including the cart item, traveler and total to pay. No booking is confirmed yet.
3. As the owner, submit to `POST /approvals/:id/decision` with this pending
   confirmation approval ID:

   ```json
   { "decision": "approve", "idempotencyKey": "00000000-0000-4000-8000-000000000006" }
   ```

   Reuse the same key for retries. Approval automatically requeues the paused
   task once, preserving its active approval ID; no manual resume is needed.
4. The resumed processor passes that ID through AgentRuntime to ToolInvoker.
   Existing approval binding, material fields, expiry and single-use checks
   precede executor dispatch. Only a completed, validated confirmation outcome
   yields `{ "mock": true, "bookingId": "<synthetic ID>", "status": "confirmed" }`
   in the task result, with a fictional mock summary. Provider text never supplies
   confirmation success. Observe completion over SSE or the tasks endpoint.

Rejecting the confirmation with `"decision": "reject"` and its own idempotency
key does not resume execution. Changed material arguments require a replacement
approval; authentication expiry remains `AUTH_CONTEXT_EXPIRED` and requires
authentication again.

Cancellation remains a provider intent example with its message flow pending. Recorded runtime SSE fixtures are also pending; future fixtures
must be captured from actual runtime execution, never fabricated.
Everything described here is fictional demo behavior, with no production
readiness claim.
