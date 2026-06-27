import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Rename all camelCase columns in the 'subscription_plans' table to
 * snake_case, matching the convention used by every other table in the project.
 *
 * This is the second part of the snake_case migration for the subscriptions module.
 * The first part (RenameSubscriptionColumnsToSnakeCase) handled the 'subscriptions' table.
 * This migration handles the 'subscription_plans' table.
 */
export class RenameSubscriptionPlanColumnsToSnakeCase1700000000102
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Rename columns (6 total) — only if the old camelCase column exists
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='subscription_plans' AND column_name='amountPaise') THEN
          ALTER TABLE "subscription_plans" RENAME COLUMN "amountPaise" TO "amount_paise";
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='subscription_plans' AND column_name='durationMonths') THEN
          ALTER TABLE "subscription_plans" RENAME COLUMN "durationMonths" TO "duration_months";
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='subscription_plans' AND column_name='isActive') THEN
          ALTER TABLE "subscription_plans" RENAME COLUMN "isActive" TO "is_active";
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='subscription_plans' AND column_name='createdAt') THEN
          ALTER TABLE "subscription_plans" RENAME COLUMN "createdAt" TO "created_at";
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='subscription_plans' AND column_name='updatedAt') THEN
          ALTER TABLE "subscription_plans" RENAME COLUMN "updatedAt" TO "updated_at";
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='subscription_plans' AND column_name='deletedAt') THEN
          ALTER TABLE "subscription_plans" RENAME COLUMN "deletedAt" TO "deleted_at";
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse column rename
    await queryRunner.query(`
      ALTER TABLE "subscription_plans"
      RENAME COLUMN "amount_paise" TO "amountPaise"
    `);
    await queryRunner.query(`
      ALTER TABLE "subscription_plans"
      RENAME COLUMN "duration_months" TO "durationMonths"
    `);
    await queryRunner.query(`
      ALTER TABLE "subscription_plans"
      RENAME COLUMN "is_active" TO "isActive"
    `);
    await queryRunner.query(`
      ALTER TABLE "subscription_plans"
      RENAME COLUMN "created_at" TO "createdAt"
    `);
    await queryRunner.query(`
      ALTER TABLE "subscription_plans"
      RENAME COLUMN "updated_at" TO "updatedAt"
    `);
    await queryRunner.query(`
      ALTER TABLE "subscription_plans"
      RENAME COLUMN "deleted_at" TO "deletedAt"
    `);
  }
}
