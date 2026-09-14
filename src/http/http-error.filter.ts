import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ServerResponse } from 'node:http';

// Internal wire projection of the frozen contracts/http.md error envelope.
interface HttpErrorEnvelope {
  error: { code: string; message: string; requestId: string };
}

function projectEnvelope(value: unknown): HttpErrorEnvelope | undefined {
  if (typeof value !== 'object' || value === null || !('error' in value)) return;
  const error = value.error;
  if (typeof error !== 'object' || error === null ||
      !('code' in error) || typeof error.code !== 'string' ||
      !('message' in error) || typeof error.message !== 'string' ||
      !('requestId' in error) || typeof error.requestId !== 'string') return;

  return {
    error: { code: error.code, message: error.message, requestId: error.requestId },
  };
}

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<ServerResponse>();
    if (response.destroyed || response.writableEnded) return;
    if (response.headersSent) {
      response.destroy();
      return;
    }

    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const envelope = (exception instanceof HttpException
      ? projectEnvelope(exception.getResponse())
      : undefined) ?? {
      error: {
        code: status === HttpStatus.INTERNAL_SERVER_ERROR
          ? 'INTERNAL_ERROR'
          : HttpStatus[status] ?? `HTTP_${status}`,
        message: 'Unable to process request.',
        requestId: 'req_' + randomUUID(),
      },
    };

    response.statusCode = status;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(JSON.stringify(envelope));
  }
}
