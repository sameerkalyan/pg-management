import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
  DeleteDateColumn,
} from 'typeorm';

@Entity('files')
@Index(['organisationId'])
@Index(['entityType', 'entityId'])
@Index(['uploadedBy'])
export class FileEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organisation_id' })
  organisationId: string;

  @Column({ name: 'uploaded_by' })
  uploadedBy: string;

  @Column({ name: 'file_name' })
  fileName: string;

  @Column({ name: 's3_key' })
  s3Key: string;

  @Column({ name: 'mime_type' })
  mimeType: string;

  @Column({ name: 'file_size' })
  fileSize: number;

  @Column({ name: 'entity_type' })
  entityType: string;

  @Column({ name: 'entity_id' })
  entityId: string;

  @CreateDateColumn({ name: 'uploaded_at' })
  uploadedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
