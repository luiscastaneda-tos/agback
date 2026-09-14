import { Controller, Get, HttpException, Param, Req, Res, UseGuards } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { AuthenticatedRequest, BearerAuthGuard, REQUEST_AUTH } from '../auth/bearer-auth.guard';
import { InMemoryConversationStore } from '../conversations/in-memory-conversation.store';
import { AgentEvent } from '../events/agent-event';
import { EventBusService, Unsubscribe } from '../events/event-bus.service';

@Controller('conversations')
@UseGuards(BearerAuthGuard)
export class ConversationEventsController {
  constructor(
    private readonly conversations: InMemoryConversationStore,
    private readonly events: EventBusService,
  ) {}

  @Get(':id/events')
  stream(
    @Param('id') conversationId: string,
    @Req() request: IncomingMessage & AuthenticatedRequest,
    @Res() response: ServerResponse,
  ): void {
    let unsubscribe: Unsubscribe | undefined;
    let stopped = false;
    const stop = (): void => {
      stopped = true;
      unsubscribe?.();
      unsubscribe = undefined;
      request.off('aborted', fail);
      response.off('finish', stop);
    };
    const close = (): void => {
      stop();
      response.off('error', fail);
      response.off('close', close);
    };
    const fail = (): void => {
      stop();
      // Do not pass transport errors to destroy, publishers, or the client.
      response.destroy();
    };

    try {
      const identity = request[REQUEST_AUTH];
      if (!identity) {
        throw this.error(401, 'AUTHENTICATION_FAILED', 'Authentication failed.');
      }
      const conversation = this.conversations.getById(conversationId);
      if (!conversation || conversation.userId !== identity.userId) {
        throw this.error(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found.');
      }

      const header = request.headers['last-event-id'];
      let lastSeq = 0;
      if (header !== undefined) {
        if (typeof header !== 'string' || !/^[0-9]+$/.test(header) ||
            !Number.isSafeInteger(Number(header))) {
          throw this.error(400, 'INVALID_LAST_EVENT_ID', 'Last-Event-ID must be a nonnegative safe integer.');
        }
        lastSeq = Number(header);
      }

      // Replay and subscription are synchronous, with no yield between them.
      // Serialize replay before opening the stream so failures use the envelope.
      const replay = this.events.replay(conversationId, lastSeq).map((event) => ({
        seq: event.seq,
        frame: this.frame(event),
      }));
      const write = (seq: number, frame: string): void => {
        if (stopped || seq <= lastSeq) return;
        if (response.destroyed || response.writableEnded) {
          fail();
          return;
        }
        lastSeq = seq;
        // Bound transport buffering: reconnect/replay instead of queuing on drain.
        if (!response.write(frame)) fail();
      };
      unsubscribe = this.events.subscribe(conversationId, (event) => {
        if (stopped || event.conversationId !== conversationId || event.seq <= lastSeq) return;
        try {
          write(event.seq, this.frame(event));
        } catch {
          fail();
        }
      });
      request.once('aborted', fail);
      response.once('finish', stop);
      response.on('error', fail);
      response.once('close', close);
      if (request.aborted || response.destroyed) {
        fail();
        close();
        return;
      }
      response.statusCode = 200;
      response.setHeader('Content-Type', 'text/event-stream');
      response.setHeader('Cache-Control', 'no-cache');
      response.flushHeaders();
      for (const event of replay) {
        if (stopped) break;
        write(event.seq, event.frame);
      }
    } catch (error) {
      if (response.headersSent) {
        fail();
        return;
      }
      close();
      if (error instanceof HttpException) throw error;
      throw this.error(500, 'EVENT_STREAM_FAILED', 'Unable to open event stream.');
    }
  }

  private frame(event: AgentEvent): string {
    return `id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`;
  }

  private error(status: number, code: string, message: string): HttpException {
    return new HttpException({
      error: { code, message, requestId: 'req_' + randomUUID() },
    }, status);
  }
}
