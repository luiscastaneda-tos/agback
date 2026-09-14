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
grants approval nor claims execution. SupervisorAgent still offers only
delegation, and HotelSearchAgent only search; reservation scenarios therefore
require a caller offering the corresponding handle and do not expand those agents.

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

The reservation rows above describe provider intent examples only. They are not
wired reservation flows through the message endpoint, and the full approval demo
remains pending. Runtime SSE fixture capture is also pending; future event fixtures
must be captured from actual runtime execution, never fabricated.
Everything described here is fictional demo behavior, with no production
readiness claim.
