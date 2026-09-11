# NOKTOS AGENT BACKEND - GOAL V1

## Mission

Build an observable multi-agent demo backend: a Supervisor agent that delegates
to specialized agents, asynchronous task execution, a streaming operational
event feed, and a hard human-approval boundary before sensitive side effects.

This is a DEMO. It runs on fictional data and must never claim production
readiness.

## Invariant 1 - the execution chokepoint

No agent, tool definition or LLM output may produce a side effect directly.
Exactly one path exists:

```text
Agent
  -> ToolHandle / inert definition
  -> AgentRuntime / ToolInvoker
  -> schema validation
  -> PolicyEngine
  -> ApprovalEngine (when the policy demands it)
  -> ExecutorRegistry
  -> Executor
  -> NoktosClient
```

A tool definition is DATA. It carries an `executorKey` string, never a callable
reference, so possessing a definition grants no ability to execute anything.

Enforced mechanically by the layering guard, not by prompt text:

- `src/agents/**`, `src/tools/definitions/**` and `src/tools/tool-registry.ts`
  may not import `src/execution/**` or `src/noktos/**`.
- `NoktosClient` is reachable only from `src/execution/executors/**`.
- `src/execution/**` is reachable only from `src/tools/tool-invoker.ts`.

## Invariant 2 - human approval is a technical boundary

An action classified `HUMAN_APPROVAL_REQUIRED` must halt BEFORE any side
effect. The agent may prepare arguments, explain intent, produce a preview and
create an approval request. It may not execute.

A system prompt instruction is not enforcement. The stop happens in code.

## Invariant 3 - the token never reaches the model

The Supabase access token enters through the HTTP layer, is exchanged for an
opaque `authContextId`, and is injected into executors through runtime context.
It must never appear in a prompt, an event, a task payload, a log or the UI.

## Policy V1 (frozen)

```text
search_hotels              AUTO
traveler read/search       AUTO
add_reservation_to_cart    HUMAN_APPROVAL_REQUIRED
confirm_booking            HUMAN_APPROVAL_REQUIRED
cancel_booking             HUMAN_APPROVAL_REQUIRED
unknown action             FORBIDDEN
```

`AUTO` means no interactive confirmation is required. It does not weaken
identity authorization: traveler reads remain subject to it.

The PolicyEngine default is `FORBIDDEN`. An action without a declared policy
cannot run.

## Agents in V1

- `SupervisorAgent` - answers or delegates, never blocks on delegated work.
- `HotelSearchAgent` - specialized agent with its own descriptor, prompt,
  lifecycle, child task and tool subset limited to search.

Do not turn deterministic functions into agents. Services stay services and
tools stay tools.

## Out of scope for V1

- Durable persistence. Everything is in memory and is lost on restart.
- Redis, external queues, WebSockets.
- Refresh tokens, impersonation, service credentials.
- Rate limiting.
- Real Noktos integration. `NoktosClient` runs against an explicitly labelled
  mock; noktos-auth exposes no public controllers yet.
- Real traveler PII. Fictional data only.

## Definition of Done

This loop does not run test suites and cannot declare production readiness.
The maximum final state is:

```text
READY_FOR_HUMAN_REVIEW
```
