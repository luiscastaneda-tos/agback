import { Body, Controller, HttpCode, HttpException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { ApprovalDecision, ApprovalDecisionFailure, ApprovalDecisionService } from '../approvals/approval-decision.service';
import type { ApprovalRequest } from '../approvals/approval-request';
import { AuthenticationFailure } from '../auth/auth-token-verifier';
import { AuthenticatedRequest, BearerAuthGuard, REQUEST_AUTH } from '../auth/bearer-auth.guard';

@Controller('approvals')
@UseGuards(BearerAuthGuard)
export class ApprovalDecisionsController {
  constructor(private readonly decisions: ApprovalDecisionService) {}

  @Post(':id/decision')
  @HttpCode(200)
  recordDecision(
    @Param('id') approvalId: string,
    @Req() request: AuthenticatedRequest,
    @Body() decision: unknown,
  ): ApprovalRequest {
    try {
      const identity = request[REQUEST_AUTH];
      if (!identity) throw new AuthenticationFailure();

      // The service validates this untrusted body before using any decision fields.
      const approval = this.decisions.recordDecision(
        identity.authContextId,
        approvalId,
        decision as ApprovalDecision,
      );

      // Explicit wire projection to frozen contracts/approval.ts (1.0.0).
      return {
        id: approval.id,
        conversationId: approval.conversationId,
        taskId: approval.taskId,
        action: approval.action,
        actionVersion: approval.actionVersion,
        requestedByAgent: approval.requestedByAgent,
        status: approval.status,
        summary: approval.summary,
        inputPreview: approval.inputPreview.map((field) => ({
          label: field.label,
          value: field.value,
          ...(field.emphasis === undefined ? {} : { emphasis: field.emphasis }),
        })),
        payloadHash: approval.payloadHash,
        createdAt: approval.createdAt,
        expiresAt: approval.expiresAt,
        ...(approval.resolvedAt === undefined ? {} : { resolvedAt: approval.resolvedAt }),
        ...(approval.resolvedBy === undefined ? {} : { resolvedBy: approval.resolvedBy }),
        ...(approval.rejectionReason === undefined ? {} : { rejectionReason: approval.rejectionReason }),
      };
    } catch (error) {
      if (error instanceof ApprovalDecisionFailure) {
        if (error.code === 'INVALID_APPROVAL_DECISION') {
          throw this.error(400, 'INVALID_APPROVAL_DECISION', 'Invalid approval decision.');
        }
        if (error.code === 'APPROVAL_UNAVAILABLE') {
          throw this.error(404, 'APPROVAL_UNAVAILABLE', 'Approval unavailable.');
        }
      }
      if (error instanceof AuthenticationFailure) {
        if (error.code === 'AUTH_CONTEXT_EXPIRED') {
          throw this.error(401, 'AUTH_CONTEXT_EXPIRED', 'Authentication expired. Authenticate again.');
        }
        throw this.error(401, 'AUTHENTICATION_FAILED', 'Authentication failed.');
      }
      throw this.error(500, 'APPROVAL_DECISION_FAILED', 'Unable to record approval decision.');
    }
  }

  private error(status: number, code: string, message: string): HttpException {
    return new HttpException({
      error: { code, message, requestId: 'req_' + randomUUID() },
    }, status);
  }
}
