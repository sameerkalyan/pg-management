import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailLog } from '../../entities/email-log.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('emails')
@Controller('emails')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class EmailsController {
  constructor(
    @InjectRepository(EmailLog)
    private emailLogRepository: Repository<EmailLog>,
  ) {}

  @Get('logs')
  @ApiOperation({ summary: 'Get email logs for organisation' })
  async getLogs(
    @CurrentUser('organisationId') organisationId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('type') type?: string,
    @Query('recipient') recipient?: string,
  ) {
    const pageNum = parseInt(page || '1', 10);
    const limitNum = parseInt(limit || '10', 10);
    const skip = (pageNum - 1) * limitNum;

    const where: any = { organisationId };
    if (type) where.emailType = type;
    if (recipient) where.recipientEmail = recipient;

    const [data, total] = await this.emailLogRepository.findAndCount({
      where,
      order: { sentAt: 'DESC' },
      skip,
      take: limitNum,
    });

    return {
      data,
      total,
      page: pageNum,
      limit: limitNum,
    };
  }
}
