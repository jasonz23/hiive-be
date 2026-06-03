import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ChatRequestDto } from './dto/chat.dto';
import { ChatService } from './chat.service';

@ApiTags('chat')
@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Post()
  @ApiOperation({ summary: 'Chat with the marketing co-pilot (tool-calling)' })
  @ApiResponse({
    status: 201,
    description: 'Answer + tool-call trace + run id',
  })
  send(@Body() dto: ChatRequestDto) {
    return this.chat.chat(dto.message, dto.history ?? []);
  }
}
