import { Injectable, BadRequestException, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import * as mime from 'mime-types';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { FileEntity } from '../../entities/file.entity';

@Injectable()
export class FilesService {
  private s3Client: S3Client;
  private readonly MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  private readonly ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private configService: ConfigService,
    @InjectRepository(FileEntity)
    private fileRepository: Repository<FileEntity>,
  ) {
    this.s3Client = new S3Client({
      endpoint: this.configService.get('S3_ENDPOINT'),
      credentials: {
        accessKeyId: this.configService.get('S3_ACCESS_KEY'),
        secretAccessKey: this.configService.get('S3_SECRET_KEY'),
      },
      region: this.configService.get('S3_REGION', 'us-east-1'),
      forcePathStyle: true,
    });
  }

  async uploadFile(file: Express.Multer.File, organisationId: string, userId: string, entityType?: string, entityId?: string) {
    if (file.size > this.MAX_FILE_SIZE) {
      throw new BadRequestException('File size exceeds 5MB limit');
    }

    const detectedMime = mime.lookup(file.originalname);
    if (!detectedMime || !this.ALLOWED_TYPES.includes(detectedMime) || !this.ALLOWED_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Invalid file type. Only JPEG, PNG, and PDF allowed');
    }

    const filenameParts = file.originalname.split('.');
    const extension = filenameParts.length > 1 ? filenameParts.pop() : '';
    const safeFilename = extension ? `${uuidv4()}.${extension}` : uuidv4();
    const key = `organisations/${organisationId}/${safeFilename}`;

    try {
      const command = new PutObjectCommand({
        Bucket: this.configService.get('S3_BUCKET'),
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      });

      await this.s3Client.send(command);

      const fileRecord = this.fileRepository.create({
        organisationId,
        uploadedBy: userId,
        fileName: file.originalname,
        s3Key: key,
        mimeType: file.mimetype,
        fileSize: file.size,
        entityType: entityType || 'GENERAL',
        entityId: entityId || organisationId,
      });

      const saved = await this.fileRepository.save(fileRecord);

      const signedUrl = await this.getSignedUrl(key, organisationId);

      this.logger.log(`File uploaded successfully: ${key} for organisation: ${organisationId}`);

      return {
        id: saved.id,
        fileName: saved.fileName,
        fileUrl: signedUrl,
        mimeType: saved.mimeType,
        entityType: saved.entityType,
        entityId: saved.entityId,
        uploadedAt: saved.uploadedAt,
      };
    } catch (error) {
      this.logger.error(`File upload failed for organisation ${organisationId}: ${error.message}`, error.stack);
      throw new BadRequestException('File upload failed. Please try again.');
    }
  }

  getEndpoint(): string | null {
    return this.configService.get('S3_ENDPOINT') || null;
  }

  async getSignedUrl(key: string, organisationId: string): Promise<string> {
    const keyParts = key.split('/');
    if (keyParts.length < 3 || keyParts[0] !== 'organisations' || keyParts[1] !== organisationId) {
      this.logger.warn(`Unauthorized file access attempt: ${key} by organisation: ${organisationId}`);
      throw new BadRequestException('Unauthorized access to file');
    }

    const getCommand = new GetObjectCommand({
      Bucket: this.configService.get('S3_BUCKET'),
      Key: key,
    });
    return getSignedUrl(this.s3Client, getCommand, {
      expiresIn: 3600,
    });
  }

  async findOne(id: string, organisationId: string): Promise<FileEntity> {
    const file = await this.fileRepository.findOne({
      where: { id, organisationId },
    });
    if (!file) {
      throw new NotFoundException('File not found');
    }
    return file;
  }

  async getFileMetadata(id: string, organisationId: string) {
    const file = await this.findOne(id, organisationId);
    const signedUrl = await this.getSignedUrl(file.s3Key, organisationId);
    return {
      id: file.id,
      fileName: file.fileName,
      fileUrl: signedUrl,
      mimeType: file.mimeType,
      entityType: file.entityType,
      entityId: file.entityId,
      uploadedAt: file.uploadedAt,
    };
  }

  async getDownloadUrl(id: string, organisationId: string): Promise<{ url: string; mimeType: string; fileName: string }> {
    const file = await this.findOne(id, organisationId);
    const url = await this.getSignedUrl(file.s3Key, organisationId);
    return { url, mimeType: file.mimeType, fileName: file.fileName };
  }

  async listFiles(organisationId: string, entityType?: string, entityId?: string): Promise<FileEntity[]> {
    const where: any = { organisationId };
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    return this.fileRepository.find({ where, order: { uploadedAt: 'DESC' } });
  }

  async deleteFile(id: string, organisationId: string): Promise<void> {
    const file = await this.findOne(id, organisationId);

    try {
      const deleteCommand = new DeleteObjectCommand({
        Bucket: this.configService.get('S3_BUCKET'),
        Key: file.s3Key,
      });
      await this.s3Client.send(deleteCommand);
    } catch (error) {
      this.logger.warn(`Failed to delete S3 object ${file.s3Key}: ${error.message}`);
    }

    await this.fileRepository.softDelete(id);
  }

  async generatePresignedUploadUrl(
    organisationId: string,
    userId: string,
    fileName: string,
    mimeType: string,
    entityType: string,
    entityId: string,
  ) {
    if (!this.ALLOWED_TYPES.includes(mimeType)) {
      throw new BadRequestException('Invalid file type. Only JPEG, PNG, and PDF allowed');
    }

    const filenameParts = fileName.split('.');
    const extension = filenameParts.length > 1 ? filenameParts.pop() : '';
    const safeFilename = extension ? `${uuidv4()}.${extension}` : uuidv4();
    const key = `organisations/${organisationId}/${safeFilename}`;

    const fileRecord = this.fileRepository.create({
      organisationId,
      uploadedBy: userId,
      fileName,
      s3Key: key,
      mimeType,
      fileSize: 0,
      entityType,
      entityId,
    });

    const saved = await this.fileRepository.save(fileRecord);

    const putCommand = new PutObjectCommand({
      Bucket: this.configService.get('S3_BUCKET'),
      Key: key,
      ContentType: mimeType,
    });

    const uploadUrl = await getSignedUrl(this.s3Client, putCommand, {
      expiresIn: 3600,
    });

    return {
      uploadUrl,
      fileId: saved.id,
    };
  }
}
