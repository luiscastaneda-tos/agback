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

Application wiring and runtime fixture capture are subsequent work. This task
does not establish a completed end-to-end flow or recorded SSE fixtures. Future
event fixtures must be captured from actual runtime execution, never fabricated.
Everything described here is fictional demo behavior, with no production
readiness claim.
