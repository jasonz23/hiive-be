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
import { AdsService } from './ads.service';
import { CreateAdDto, UpdateAdDto } from './dto/ad.dto';

@ApiTags('ads')
@Controller('ads')
export class AdsController {
  constructor(private readonly ads: AdsService) {}

  @Post()
  @ApiOperation({ summary: 'Create an ad (with derived CTR/CPC/CPA)' })
  @ApiResponse({ status: 201, description: 'Ad created' })
  create(@Body() dto: CreateAdDto) {
    return this.ads.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List ads (optionally by campaign)' })
  @ApiQuery({ name: 'campaignId', required: false })
  findAll(@Query('campaignId') campaignId?: string) {
    return this.ads.findAll(campaignId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an ad with derived metrics' })
  findOne(@Param('id') id: string) {
    return this.ads.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an ad' })
  update(@Param('id') id: string, @Body() dto: UpdateAdDto) {
    return this.ads.update(id, dto);
  }

  @Post(':id/analyze')
  @ApiOperation({ summary: 'AI optimization analysis for the ad’s campaign' })
  async analyze(@Param('id') id: string) {
    const ad = await this.ads.findOne(id);
    return this.ads.analyze(ad.campaignId);
  }
}
