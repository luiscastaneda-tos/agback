# NOKTOS AGENT BACKEND - INTERNAL CONTRACTS V1

The shared wire contracts live in `contracts/` at version 1.0.0 and are a
PROTECTED PATH. This file covers internal seams that are not on the wire.

## 1. Tool definition is inert

```ts
interface ToolDefinition {
  name: string;
  description: string;
  argsSchema: ZodSchema;
  actionVersion: number;
  materialFields: string[];                    // feeds payloadHash
  toPreview(args): ApprovalPreviewField[];     // per-action allowlist
  executorKey: string;                         // a NAME, never a function
}
```

`executorKey` being a string is what closes the bypass. Resolution requires the
executor registry, which only the tool invoker may import.

## 2. What an agent receives

```ts
interface AgentRuntime {
  invoke(toolName: string, args: unknown, ctx: ToolContext): Promise<ToolOutcome>;
}

type ToolOutcome =
  | { kind: 'completed'; data: unknown }
  | { kind: 'awaiting_approval'; approvalId: string }
  | { kind: 'rejected'; reason: string }
  | { kind: 'forbidden'; reason: string };
```

`awaiting_approval` is a first-class return value, not an exception: the agent
must be able to explain the pause to the user.

Agents receive `ToolHandle` metadata and this runtime. Nothing else.

## 3. Executor

```ts
interface Executor<TArgs> {
  execute(args: TArgs, ctx: ExecutionContext): Promise<unknown>;
}
```

`ExecutionContext` carries the resolved credential. It is constructed by the
runtime and is never derived from model output.

## 4. Invocation order inside ToolInvoker

1. registry lookup - unknown action is FORBIDDEN
2. schema validation
3. policy evaluation
4. payload hash over declared material fields
5. approval check or creation - returns `awaiting_approval` with no side effect
6. single-use approval consumption
7. executor resolution
8. execution

## 5. Approval binding

```text
payloadHash = sha256(canonicalJson({
  action, actionVersion, conversationId, taskId,
  material: pick(args, definition.materialFields)
}))
```

Approvals are single-use and expire. A hash mismatch supersedes the approval and
requires a new decision. An approval is never silently reused.

## 6. Agent vs Tool vs Service

- Service - deterministic, no LLM, invisible to the model.
- Tool - a capability exposed to a model with a schema; deterministic execution.
- Agent - owns an LLM loop, a prompt and a tool subset; decomposes a goal.

If it can be written as a function it is a Service. If the model decides whether
to invoke it, it is a Tool. If it decides how to decompose a goal, it is an Agent.
