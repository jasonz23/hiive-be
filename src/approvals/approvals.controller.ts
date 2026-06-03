import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApprovalStatus } from '@prisma/client';
import { ApprovalsService } from './approvals.service';

@ApiTags('approvals')
@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get()
  @ApiOperation({ summary: 'List approval requests' })
  @ApiQuery({ name: 'status', required: false, enum: ApprovalStatus })
  list(@Query('status') status?: ApprovalStatus) {
    return this.approvals.list(status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an approval request' })
  get(@Param('id') id: string) {
    return this.approvals.get(id);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve and execute the gated action' })
  approve(@Param('id') id: string) {
    return this.approvals.approve(id);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject (captured as a learning example)' })
  reject(@Param('id') id: string, @Body('feedback') feedback?: string) {
    return this.approvals.reject(id, feedback);
  }

  @Post(':id/edit')
  @ApiOperation({
    summary: 'Edit + approve (captures the human-edit delta as learning)',
  })
  edit(
    @Param('id') id: string,
    @Body('editedAction') editedAction: Record<string, unknown>,
    @Body('feedback') feedback?: string,
  ) {
    return this.approvals.edit(id, editedAction, feedback);
  }
}
