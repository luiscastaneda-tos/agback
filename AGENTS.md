# Noktos Agent Backend - rules for every agent in this repository

These rules bind the Architect, the Implementer and the Reviewer. They are
enforced mechanically wherever enforcement is possible; where a guard exists,
the guard is the authority, not this text.

## 1. The execution chokepoint is structural

```text
Agent -> inert ToolHandle/definition -> ToolInvoker -> schema validation
      -> PolicyEngine -> ApprovalEngine -> ExecutorRegistry -> Executor -> NoktosClient
```

- A tool definition is DATA. It carries `executorKey` as a string, never a
  callable. Possessing a definition must grant no ability to execute anything.
- `src/agents/**`, `src/tools/definitions/**` and `src/tools/tool-registry.ts`
  may not import `src/execution/**` or `src/noktos/**`.
- `NoktosClient` is reachable only from `src/execution/executors/**`.
- `src/execution/**` is reachable only from `src/tools/tool-invoker.ts`.
- Individual executors are reachable only from `src/execution/executor-registry.ts`.

Checked by `.loop/scripts/check-layering.sh`, over the diff during the loop and
over the full tree in `verify.sh`. Both fail closed.

## 2. Human approval stops execution, not just intent

An action classified `HUMAN_APPROVAL_REQUIRED` must return
`awaiting_approval` BEFORE any side effect. Preparing arguments, explaining
intent, building a preview and creating the approval request are allowed.
Executing is not.

Never implement a bypass, a fast path, a retry that skips approval, or a
"trusted" caller exemption.

## 3. Secrets

- The Supabase access token never enters a prompt, an event payload, a task
  payload, a log or the UI.
- Tasks carry an opaque `authContextId`, never the token.
- No credential-shaped value is ever committed.
- No refresh tokens, no impersonation, no service credentials in V1.

## 4. Events are operational

No chain-of-thought, no private model reasoning, no raw tool arguments.
`tool.called` carries an allowlist preview only. Fields named `reasoning`,
`chainOfThought`, `scratchpad` or similar are forbidden in event types.

## 5. Boundaries

- LLM provider SDKs may only be imported inside `src/llm/`.
- `process.env` may only be read inside `src/config/`.
- `contracts/` is frozen and protected. Never edit it.

## 6. Policy

Default is FORBIDDEN. An action without a declared policy cannot run. Policy is
data, not conditionals spread through call sites.

## 7. Scope

Stay inside the task packet's `allowed_paths`. Never touch `.loop/`,
`CLAUDE.md`, `AGENTS.md`, `.gitattributes` or `contracts/`.

## 8. Never commit

The implementer never creates commits. The harness commits approved work.

## 9. When a decision is missing

Return `human_gate`. Do not invent security behavior, policy, retention,
persistence or integration decisions.
