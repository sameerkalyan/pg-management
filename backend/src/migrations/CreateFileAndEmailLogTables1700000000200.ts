import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFileAndEmailLogTables1700000000200 implements MigrationInterface {
  name = 'CreateFileAndEmailLogTables1700000000200';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create files table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "files" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        "organisation_id" UUID NOT NULL,
        "uploaded_by" UUID NOT NULL,
        "file_name" VARCHAR(255) NOT NULL,
        "s3_key" VARCHAR(500) NOT NULL,
        "mime_type" VARCHAR(100) NOT NULL,
        "file_size" INTEGER NOT NULL,
        "entity_type" VARCHAR(50) NOT NULL,
        "entity_id" VARCHAR(255) NOT NULL,
        "uploaded_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_files_organisation_id" ON "files" ("organisation_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_files_entity" ON "files" ("entity_type", "entity_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_files_uploaded_by" ON "files" ("uploaded_by")
    `);

    // Create email_logs table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "email_logs" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        "organisation_id" UUID NOT NULL,
        "recipient_email" VARCHAR(255) NOT NULL,
        "email_type" VARCHAR(50) NOT NULL,
        "subject" VARCHAR(500) NOT NULL,
        "html_body" TEXT NOT NULL,
        "text_body" TEXT NULL,
        "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        "metadata" JSON NULL,
        "error_message" TEXT NULL,
        "sent_at" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_email_logs_organisation_id" ON "email_logs" ("organisation_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_email_logs_recipient_email" ON "email_logs" ("recipient_email")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_email_logs_email_type" ON "email_logs" ("email_type")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_email_logs_status" ON "email_logs" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_email_logs_sent_at" ON "email_logs" ("sent_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "email_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "files"`);
  }
}
