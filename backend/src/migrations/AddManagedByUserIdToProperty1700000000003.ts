import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddManagedByUserIdToProperty1700000000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "properties"
      ADD COLUMN IF NOT EXISTS "managed_by_user_id" uuid NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_properties_managed_by_user_id"
      ON "properties" ("managed_by_user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX "IDX_properties_managed_by_user_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "properties"
      DROP COLUMN "managed_by_user_id"
    `);
  }
}
