# NOKTOS — workspace overview

> [!IMPORTANT]
> **This is the CANONICAL, git-tracked copy of the workspace-level index.** It lives inside
> `noktos-agent-backend` purely for git persistence/continuity, not because the workspace
> overview belongs to the backend. Companion file: `PROGRESS.md` in this same directory —
> read that one for cross-repo V2 product decisions and roadmap. A local convenience copy
> of this file also exists at the workspace root (`../../../HANDOFF.md` relative to here);
> if the two diverge, this one wins.

This workspace holds four repositories, three existing and one planned, each with its own
remote, its own engineering loop (or, for the planned one, the same governance pattern once
created) and its own authoritative `HANDOFF.md`.

| Repo | Branch | Remote | State |
| --- | --- | --- | --- |
| `noktos-auth` | `loop/noktos-auth` | `AngelCstd/proyecto_esc` | `READY_FOR_HUMAN_REVIEW`, 29/29 tasks, no HUMAN_GATE |
| `noktos-agent-backend` | `loop/agent-backend` | `luiscastaneda-tos/agback` | `READY_FOR_HUMAN_REVIEW`, 63/63 tasks, no HUMAN_GATE. Human review in progress; frozen as V2's backend (`D-026`) |
| `noktos-agent-frontend` | `loop/agent-frontend` | `luiscastaneda-tos/agfront` | `READY_FOR_HUMAN_REVIEW`, 46/46 tasks, no HUMAN_GATE. Human review in progress; frozen as V1 baseline, V2 frontend is a **new** sibling repo (`D-016`) |
| `noktos-agent-next` | *(not yet created)* | *(not yet created)* | **RESOLVED (P-001, 2026-09-15):** name and shape decided — a new sibling repo, V2 frontend. Creating it is Track A slice A0 in `PROGRESS.md`, pending Phase 0. |

## How they relate

`noktos-agent-backend` owns `contracts/`, frozen at **1.0.0**. `noktos-agent-frontend`
vendors a read-only copy into `src/contracts/` and verifies it byte-for-byte against
`contracts.lock`. `noktos-agent-next` will do the same once it exists. Changing a contract
is a human operation across the repos that consume it.

`noktos-auth` is the authentication gateway and is independent of the agent repos; the
backend currently talks to an explicitly labelled Noktos mock because `noktos-auth` exposes
no public controllers yet, and because Noktos Core itself does not exist as a service yet
(see `PROGRESS.md` — `P-011` / backend `Q-002`). `noktos-agent-next` talks directly to
`noktos-agent-backend`, never through `noktos-auth` (`PROGRESS.md` — `Q-P3`, resolved).

## Where to start

Read `PROGRESS.md` in this same directory first for the current cross-repo state and the
next unambiguous action. Then open the repo you want to work on and read its own
`HANDOFF.md` in full before touching anything. Do not operate two loops on the same repo at
once. Each loop only ever edits its own repo.
