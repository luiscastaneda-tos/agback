# Runtime SSE captures

No recorded runtime fixture is included yet. `capture-hotel-search.mjs` prepares
capture tooling; adding it is not evidence of a runtime execution.

This is DEMO / FICTIONAL / SCRIPTED behavior. The provider is deterministic,
hotel results come from the labelled Noktos mock, and no real traveler PII is
permitted. The backend is in memory only: restarting loses conversations, tasks,
approvals, auth contexts and event buffers. This is not production readiness.

Use Node.js 20 or newer with an already running backend. Configure that backend
with `LLM_PROVIDER=demo-provider`, `LLM_MODEL=fictional-demo-model`, and the
remaining settings documented in `.env.example`, including the mock Noktos URL
and Supabase remote verification configuration. The utility does not start a
server, configure the provider, or replace authentication. Use a trusted backend
origin; use HTTPS when connecting remotely.

Obtain a valid Supabase access token for the configured project through your
existing sign-in flow before starting. In an interactive terminal, run:

```sh
node fixtures/capture-hotel-search.mjs --base-url http://localhost:3000 --output /tmp/hotel-search.sse
```

Enter the token only at the hidden prompt. Input is not echoed (including paste)
and is retained only in process memory for Authorization headers. Tokens must
never be supplied as arguments, URL components, files or environment variables.
Redirected/piped credential input is rejected. Ctrl-C cancels the capture.

The utility creates a conversation through authenticated `POST /conversations`,
opens authenticated `GET /conversations/:id/events`, then submits
`demo:hotel-delegation` with a fresh UUID through authenticated
`POST /conversations/:id/messages`. It correlates the accepted supervisor task
with `supervisor.delegated.payload.childTaskId` targeting `HotelSearchAgent` and
waits for both tasks' completion events. No task snapshots are fetched or saved.

The output is exclusively the original runtime SSE frames, through the event
that establishes both completions. Frame bytes, sequence numbers, event IDs,
timestamps and payloads remain unchanged; parsed copies serve validation and
correlation only. IDs and timestamps vary across executions. This is an SSE text
file (`id:` and `data:` lines separated by blank lines), not a JSON array.
Any subsequent recorded fixture must come from this actual authenticated runtime
flow; never fabricate or edit an event stream to claim runtime provenance.

There is a fixed two-minute deadline including credential entry and an 8 MiB
capture limit. HTTP errors, malformed events, sequence gaps, task failure or
cancellation, and premature stream closure fail with sanitized local messages.
The subscription closes on success or failure; no automatic replay or retry is
attempted. On failure the backend work may continue in memory.

The output parent directory must already exist. The file is created exclusively
after successful capture, with owner-only permissions; existing files are never
overwritten. No headers, credentials, or internal auth handles are serialized.
A filesystem write failure may leave an incomplete output file: do not treat it
as a successful fixture, and select an unused path for the next attempt.
