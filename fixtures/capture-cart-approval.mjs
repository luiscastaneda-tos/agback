// DEMO / FICTIONAL / SCRIPTED runtime capture; no replacement runtime or auth.
import { randomUUID } from 'node:crypto';
import { open } from 'node:fs/promises';
import { parseArgs } from 'node:util';

class CaptureFailure extends Error {}
const fail = (message) => { throw new CaptureFailure(message); };
const uuid = (value) => typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const eventTypes = new Set([
  'conversation.message.received', 'conversation.state.updated',
  'supervisor.started', 'supervisor.delegated', 'supervisor.result.received',
  'task.created', 'task.queued', 'task.started', 'task.completed', 'task.failed',
  'task.cancelled', 'agent.started', 'agent.completed', 'agent.failed',
  'tool.called', 'tool.completed', 'approval.requested', 'approval.approved',
  'approval.rejected', 'approval.expired', 'approval.superseded',
]);

function readToken(signal, prompt = 'Supabase access token (hidden): ') {
  if (signal.aborted) fail('Capture interrupted or timed out.');
  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    fail('An interactive terminal is required for hidden credential input.');
  }
  return new Promise((resolve, reject) => {
    let token = '';
    const wasRaw = process.stdin.isRaw;
    const finish = (error) => {
      process.stdin.off('data', onData);
      process.stdin.off('end', onEnd);
      process.stdin.off('error', onEnd);
      signal.removeEventListener('abort', onAbort);
      process.stdin.setRawMode(wasRaw);
      process.stdin.pause();
      process.stderr.write('\n');
      if (error) reject(error);
      else resolve(token);
      token = '';
    };
    const onEnd = () => finish(new CaptureFailure('Credential input closed.'));
    const onAbort = () => finish(new CaptureFailure('Capture interrupted or timed out.'));
    const onData = (chunk) => {
      for (const byte of chunk) {
        if (byte === 3 || byte === 4) { onAbort(); return; }
        if (byte === 13 || byte === 10) {
          finish(token.length ? undefined : new CaptureFailure('Credential input is empty.'));
          return;
        }
        if (byte === 127 || byte === 8) token = token.slice(0, -1);
        else if (byte >= 33 && byte <= 126) token += String.fromCharCode(byte);
        else { finish(new CaptureFailure('Invalid credential input.')); return; }
        if (token.length > 16384) {
          finish(new CaptureFailure('Credential input is too long.')); return;
        }
      }
    };
    process.stdin.setRawMode(true);
    process.stdin.on('data', onData);
    process.stdin.once('end', onEnd);
    process.stdin.once('error', onEnd);
    signal.addEventListener('abort', onAbort, { once: true });
    process.stderr.write(prompt);
    process.stdin.resume();
  });
}

async function main() {
  const { values } = parseArgs({ options: {
    'base-url': { type: 'string' }, output: { type: 'string' },
    help: { type: 'boolean' },
  }, allowPositionals: false });
  if (values.help) {
    process.stdout.write('node fixtures/capture-cart-approval.mjs --base-url http://localhost:3000 --output /tmp/cart-approval.sse\n');
    return;
  }
  if (!values['base-url'] || !values.output) fail('Both --base-url and --output are required.');
  const base = new URL(values['base-url']);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password ||
      base.search || base.hash || base.pathname !== '/') {
    fail('Base URL must be an HTTP(S) origin without credentials, query, or fragment.');
  }

  const controller = new AbortController();
  const interrupt = () => controller.abort();
  const timeout = setTimeout(interrupt, 120000);
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  let reader;
  let token;
  try {
    token = await readToken(controller.signal);
    const request = async (path, status, body, stream = false, method = stream ? 'GET' : 'POST') => {
      const response = await fetch(new URL(path, base), {
        method,
        headers: { Authorization: `Bearer ${token}`,
          ...(stream ? { Accept: 'text/event-stream' } : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal, redirect: 'error',
      });
      if (response.status !== status) {
        await response.body?.cancel();
        fail('Backend rejected a capture request. Check authentication and runtime configuration.');
      }
      return response;
    };
    const conversation = await (await request('/conversations', 201)).json();
    if (!uuid(conversation?.id)) fail('Malformed conversation response.');
    const path = `/conversations/${conversation.id}`;
    const stream = await request(`${path}/events`, 200, undefined, true);
    if (stream.headers.get('content-type')?.split(';')[0].trim() !== 'text/event-stream' || !stream.body) {
      await stream.body?.cancel();
      fail('Backend did not return an SSE stream.');
    }
    reader = stream.body.getReader();
    // Subscribe before submitting. Fetch buffers early frames while POST completes.
    const acceptance = await (await request(`${path}/messages`, 202, {
      content: 'demo:add-reservation-to-cart', clientMessageId: randomUUID(),
    })).json();
    if (acceptance?.accepted !== true || acceptance.conversationId !== conversation.id ||
        !Array.isArray(acceptance.createdTaskIds) || acceptance.createdTaskIds.length !== 1 ||
        !uuid(acceptance.createdTaskIds[0])) fail('Malformed message acceptance.');
    const taskId = acceptance.createdTaskIds[0];
    let approvalId;
    let approved = false;
    let seq = 0;
    let pending = Buffer.alloc(0);
    let size = 0;
    const frames = [];
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let done = false;
    while (!done) {
      const chunk = await reader.read();
      if (chunk.done) fail('SSE ended before the approved task completed.');
      size += chunk.value.length;
      if (size > 8 * 1024 * 1024) fail('Capture exceeded its 8 MiB limit.');
      pending = Buffer.concat([pending, chunk.value]);
      // Parse copies only; retain original bytes including line endings.
      while (!done) {
        const boundary = /\r?\n\r?\n/.exec(pending.toString('latin1'));
        if (!boundary) break;
        const end = boundary.index + boundary[0].length;
        const frame = pending.subarray(0, end);
        pending = pending.subarray(end);
        const lines = decoder.decode(frame).trimEnd().split(/\r?\n/);
        const ids = lines.filter((line) => line.startsWith('id:'));
        const data = lines.filter((line) => line.startsWith('data:'));
        if (ids.length !== 1 || data.length === 0 || lines.some((line) =>
          !line.startsWith('id:') && !line.startsWith('data:'))) fail('Malformed SSE frame.');
        const event = JSON.parse(data.map((line) => line.slice(5).replace(/^ /, '')).join('\n'));
        if (!event || !uuid(event.id) || !Number.isSafeInteger(event.seq) ||
            ids[0].slice(3).trim() !== String(event.seq) || !eventTypes.has(event.type) ||
            event.conversationId !== conversation.id ||
            typeof event.correlationId !== 'string' || !event.correlationId ||
            typeof event.occurredAt !== 'string' || !Number.isFinite(Date.parse(event.occurredAt)) ||
            !event.payload || typeof event.payload !== 'object' || Array.isArray(event.payload) ||
            (event.taskId !== undefined && !uuid(event.taskId))) fail('Malformed runtime event.');
        if (event.seq !== seq + 1) fail('SSE sequence gap or duplicate detected.');
        seq = event.seq;
        if (['task.failed', 'task.cancelled', 'agent.failed'].includes(event.type)) {
          fail('Runtime task failed or was cancelled.');
        }
        if (event.type.startsWith('approval.')) {
          const status = event.type === 'approval.requested' ? 'pending' : event.type.slice(9);
          if (!uuid(event.payload.approvalId) || !uuid(event.taskId) ||
              event.payload.status !== status ||
              (event.payload.action !== undefined && typeof event.payload.action !== 'string')) {
            fail('Malformed approval lifecycle event.');
          }
          if (['rejected', 'expired', 'superseded'].includes(status)) {
            fail('Runtime approval was rejected, expired, or superseded.');
          }
          if (event.taskId !== taskId ||
              (event.payload.action !== undefined && event.payload.action !== 'add_reservation_to_cart')) {
            fail('Unexpected approval in cart capture.');
          }
          if (event.type === 'approval.requested') {
            if (approvalId) fail('Duplicate or replacement approval requested.');
            approvalId = event.payload.approvalId;
            const approvals = await (await request(`${path}/approvals`, 200, undefined, false, 'GET')).json();
            if (!Array.isArray(approvals)) fail('Malformed approvals response.');
            const matches = approvals.filter((item) => item?.id === approvalId);
            const approval = matches[0];
            if (matches.length !== 1 || approval.conversationId !== conversation.id ||
                approval.taskId !== taskId || approval.action !== 'add_reservation_to_cart' ||
                approval.status !== 'pending' ||
                !(Date.parse(approval.expiresAt) > Date.now())) {
              fail('Matching pending cart approval is unavailable.');
            }
            const labels = ['Hotel', 'Check-in', 'Check-out', 'Huésped', 'Habitaciones', 'Precio total'];
            const preview = approval.inputPreview;
            if (!Array.isArray(preview) || preview.length !== labels.length ||
                preview.some((field, index) => !field || field.label !== labels[index] ||
                  typeof field.value !== 'string' || field.value.length > 1024 ||
                  /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(field.value) ||
                  (field.emphasis !== undefined && !['normal', 'warning'].includes(field.emphasis)))) {
              fail('Malformed allowlisted cart approval preview.');
            }
            // Display only the declared preview, never summary, arguments, or response JSON.
            for (const field of preview) process.stderr.write(`${field.label}: ${field.value}\n`);
            const confirmation = await readToken(controller.signal,
              'Type APPROVE then Enter to approve this fictional cart action (hidden); anything else cancels: ');
            if (confirmation !== 'APPROVE') fail('Approval declined; no decision sent.');
            if (controller.signal.aborted || !(Date.parse(approval.expiresAt) > Date.now())) {
              fail('Capture interrupted or approval expired; no decision sent.');
            }
            const decision = await (await request(`/approvals/${approvalId}/decision`, 200, {
              decision: 'approve', idempotencyKey: randomUUID(),
            })).json();
            if (decision?.id !== approvalId || decision.taskId !== taskId ||
                decision.conversationId !== conversation.id ||
                decision.action !== 'add_reservation_to_cart' || decision.status !== 'approved') {
              fail('Backend did not confirm the matching approval decision.');
            }
          } else if (event.type === 'approval.approved') {
            if (!approvalId || event.payload.approvalId !== approvalId || approved) {
              fail('Unexpected approved event.');
            }
            approved = true;
          }
        }
        if (event.type === 'task.completed' && event.taskId === taskId) {
          if (!approvalId || !approved || event.payload.status !== 'completed') {
            fail('Task completed without the required approval lifecycle.');
          }
          done = true;
        }
        frames.push(frame);
      }
    }
    controller.abort();
    await reader.cancel().catch(() => {});
    // Exclusive creation also refuses symlinks and races with other writers.
    const file = await open(values.output, 'wx', 0o600);
    try { await file.writeFile(Buffer.concat(frames)); }
    finally { await file.close(); }
    process.stdout.write('Runtime SSE capture saved successfully.\n');
  } finally {
    token = undefined;
    controller.abort();
    await reader?.cancel().catch(() => {});
    clearTimeout(timeout);
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
  }
}

main().catch((error) => {
  // Never render remote bodies, raw exceptions, URLs, headers, or credentials.
  process.stderr.write(error instanceof CaptureFailure ? `${error.message}\n` :
    'Capture failed: check options, runtime, timeout, event format, and unused output path.\n');
  process.exitCode = 1;
});
