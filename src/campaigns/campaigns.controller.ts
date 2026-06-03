import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CampaignHealth, CampaignStatus } from '@prisma/client';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto, UpdateCampaignDto } from './dto/campaign.dto';

@ApiTags('campaigns')
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a campaign' })
  @ApiResponse({ status: 201, description: 'Campaign created' })
  create(@Body() dto: CreateCampaignDto) {
    return this.campaigns.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List campaigns (optionally filter by status/health)',
  })
  @ApiQuery({ name: 'status', required: false, enum: CampaignStatus })
  @ApiQuery({ name: 'health', required: false, enum: CampaignHealth })
  findAll(
    @Query('status') status?: CampaignStatus,
    @Query('health') health?: CampaignHealth,
  ) {
    return this.campaigns.findAll({ status, health });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a campaign with posts, ads, and open recommendations',
  })
  findOne(@Param('id') id: string) {
    return this.campaigns.findOne(id);
  }

  @Get(':id/summary')
  @ApiOperation({ summary: 'Campaign summary: goal progress + AI narrative' })
  summary(@Param('id') id: string) {
    return this.campaigns.summary(id);
  }

  @Get(':id/progress')
  @ApiOperation({ summary: 'Goal attainment and health snapshot' })
  progress(@Param('id') id: string) {
    return this.campaigns.goalProgress(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a campaign' })
  update(@Param('id') id: string, @Body() dto: UpdateCampaignDto) {
    return this.campaigns.update(id, dto);
  }
}
