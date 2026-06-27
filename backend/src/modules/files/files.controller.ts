import { Controller, Post, Get, Delete, Body, Query, Param, Res, HttpStatus, UseGuards, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { FilesService } from './files.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Response } from 'express';

@ApiTags('files')
@Controller('files')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class FilesController {
  constructor(private filesService: FilesService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload a file' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('organisationId') organisationId: string,
    @CurrentUser('id') userId: string,
    @Body('entityType') entityType?: string,
    @Body('entityId') entityId?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    return this.filesService.uploadFile(file, organisationId, userId, entityType, entityId);
  }

  @Post('presigned-url')
  @ApiOperation({ summary: 'Generate presigned URL for direct upload' })
  async generatePresignedUrl(
    @CurrentUser('organisationId') organisationId: string,
    @CurrentUser('id') userId: string,
    @Body() body: { fileName: string; mimeType: string; entityType: string; entityId: string },
  ) {
    return this.filesService.generatePresignedUploadUrl(
      organisationId,
      userId,
      body.fileName,
      body.mimeType,
      body.entityType,
      body.entityId,
    );
  }

  @Get()
  @ApiOperation({ summary: 'List files for organisation' })
  async listFiles(
    @CurrentUser('organisationId') organisationId: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
  ) {
    const files = await this.filesService.listFiles(organisationId, entityType, entityId);
    return Promise.all(
      files.map(async (f) => {
        const fileUrl = await this.filesService.getSignedUrl(f.s3Key, organisationId);
        return {
          id: f.id,
          fileName: f.fileName,
          fileUrl,
          mimeType: f.mimeType,
          entityType: f.entityType,
          entityId: f.entityId,
          uploadedAt: f.uploadedAt,
        };
      }),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get file metadata' })
  async getFileInfo(
    @CurrentUser('organisationId') organisationId: string,
    @Param('id') id: string,
  ) {
    return this.filesService.getFileMetadata(id, organisationId);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download a file' })
  async downloadFile(
    @CurrentUser('organisationId') organisationId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { url, mimeType, fileName } = await this.filesService.getDownloadUrl(id, organisationId);
    res.redirect(HttpStatus.TEMPORARY_REDIRECT, url);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a file' })
  async deleteFile(
    @CurrentUser('organisationId') organisationId: string,
    @Param('id') id: string,
  ) {
    await this.filesService.deleteFile(id, organisationId);
    return { message: 'File deleted successfully' };
  }
}
