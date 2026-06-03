import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Res,
  StreamableFile,
  UploadedFile as UploadedFileDecorator,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { STORAGE_PROVIDER } from '../storage/storage.types';
import type { StorageProvider } from '../storage/storage.types';
import { FilesService } from './files.service';
import type { UploadedFile } from './files.service';

@ApiTags('files')
@Controller('files')
export class FilesController {
  constructor(
    private readonly files: FilesService,
    @Inject(STORAGE_PROVIDER)
    private readonly storage: StorageProvider,
  ) {}

  @Get('raw/:key')
  @ApiOperation({ summary: 'Serve a locally-stored file (dev storage)' })
  async raw(
    @Param('key') key: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = this.storage.read ? await this.storage.read(key) : null;
    if (!file) throw new NotFoundException('File not found');
    res.setHeader('Content-Type', file.contentType);
    return new StreamableFile(file.buffer);
  }

  @Post('upload')
  @ApiOperation({
    summary: 'Upload a document into RAG memory (PDF/DOCX/TXT/MD)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        tags: {
          type: 'string',
          description: 'Comma-separated memory tags',
          example: 'brand_guideline,compliance',
        },
        importance: {
          type: 'string',
          description: 'Memory importance tier 0..1',
          example: '0.75',
        },
        locked: {
          type: 'string',
          description: 'Lock from auto-importance updates (true/false)',
          example: 'false',
        },
      },
      required: ['file'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'File stored and ingested into memory',
  })
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @UploadedFileDecorator() file: UploadedFile,
    @Body('tags') tags?: string,
    @Body('importance') importance?: string,
    @Body('locked') locked?: string,
  ) {
    const parsedTags = (tags ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    return this.files.upload(file, {
      tags: parsedTags,
      importance: importance != null ? Number(importance) : undefined,
      locked: locked === 'true',
    });
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a document’s importance / lock / markdown text (re-indexes memory)',
  })
  updateMeta(
    @Param('id') id: string,
    @Body() body: { importance?: number; locked?: boolean; text?: string },
  ) {
    return this.files.updateMeta(id, body);
  }

  @Get()
  @ApiOperation({ summary: 'List uploaded documents with chunk counts' })
  @ApiResponse({ status: 200, description: 'Uploaded files' })
  list() {
    return this.files.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single uploaded document' })
  get(@Param('id') id: string) {
    return this.files.get(id);
  }
}
