import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Rename all camelCase columns in the 'subscriptions' table to
 * snake_case, matching the convention used by every other table in the project.
 *
 * Chain-fix notes:
 * - FK constraints must be dropped BEFORE column rename (PostgreSQL constraint).
 * - Indexes referencing old column names are automatically updated by PostgreSQL
 *   RENAME COLUMN, but we drop and recreate them with consistent names.
 * - The raw SQL expression in subscription-expiry.processor.ts that referenced
 *   "endDate" has been updated to "end_date" in the same release.
 */
export class RenameSubscriptionColumnsToSnakeCase1700000000101
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Drop FK constraints (must be done before column rename)
    await queryRunner.query(`
      ALTER TABLE "subscriptions"
      DROP CONSTRAINT IF EXISTS "FK_subscriptions_organisationId"
    `);
    await queryRunner.query(`
      ALTER TABLE "subscriptions"
      DROP CONSTRAINT IF EXISTS "FK_subscriptions_paymentId"
    `);

    // 2. Rename columns (8 total) — only if the old camelCase column exists
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='subscriptions' AND column_name='organisationId') THEN
          ALTER TABLE "subscriptions" RENAME COLUMN "organisationId" TO "organisation_id";
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='subscriptions' AND column_name='planId') THEN
          ALTER TABLE "subscriptions" RENAME COLUMN "planId" TO "plan_id";
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='subscriptions' AND column_name='amountPaise') THEN
          ALTER TABLE "subscriptions" RENAME COLUMN "amountPaise" TO "amount_paise";
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='subscriptions' AND column_name='startDate') THEN
          ALTER TABLE "subscriptions" RENAME COLUMN "startDate" TO "start_date";
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='subscriptions' AND column_name='endDate') THEN
          ALTER TABLE "subscriptions" RENAME COLUMN "endDate" TO "end_date";
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='subscriptions' AND column_name='paymentId') THEN
          ALTER TABLE "subscriptions" RENAME COLUMN "paymentId" TO "payment_id";
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='subscriptions' AND column_name='createdAt') THEN
          ALTER TABLE "subscriptions" RENAME COLUMN "createdAt" TO "created_at";
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='subscriptions' AND column_name='updatedAt') THEN
          ALTER TABLE "subscriptions" RENAME COLUMN "updatedAt" TO "updated_at";
        END IF;
      END $$;
    `);

    // 3. Recreate FK constraints with new column names
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='FK_subscriptions_organisation_id') THEN
          ALTER TABLE "subscriptions"
          ADD CONSTRAINT "FK_subscriptions_organisation_id"
          FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id")
          ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='FK_subscriptions_payment_id') THEN
          ALTER TABLE "subscriptions"
          ADD CONSTRAINT "FK_subscriptions_payment_id"
          FOREIGN KEY ("payment_id") REFERENCES "payments"("id")
          ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // 4. Recreate indexes with new column names
    // (PostgreSQL auto-updates existing indexes, but we rename for consistency)
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_subscriptions_organisationId"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_subscriptions_endDate"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_subscriptions_org_status"
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_subscriptions_organisation_id"
      ON "subscriptions" ("organisation_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_subscriptions_end_date"
      ON "subscriptions" ("end_date")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_subscriptions_org_status"
      ON "subscriptions" ("organisation_id", "status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse FK drop
    await queryRunner.query(`
      ALTER TABLE "subscriptions"
      DROP CONSTRAINT IF EXISTS "FK_subscriptions_organisation_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "subscriptions"
      DROP CONSTRAINT IF EXISTS "FK_subscriptions_payment_id"
    `);

    // Reverse index drop
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_subscriptions_organisation_id"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_subscriptions_end_date"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_subscriptions_org_status"
    `);

    // Reverse column rename
    await queryRunner.query(`
      ALTER TABLE "subscriptions"
      RENAME COLUMN "organisation_id" TO "organisationId"
    `);
    await queryRunner.query(`
      ALTER TABLE "subscriptions"
      RENAME COLUMN "plan_id" TO "planId"
    `);
    await queryRunner.query(`
      ALTER TABLE "subscriptions"
      RENAME COLUMN "amount_paise" TO "amountPaise"
    `);
    await queryRunner.query(`
      ALTER TABLE "subscriptions"
      RENAME COLUMN "start_date" TO "startDate"
    `);
    await queryRunner.query(`
      ALTER TABLE "subscriptions"
      RENAME COLUMN "end_date" TO "endDate"
    `);
    await queryRunner.query(`
      ALTER TABLE "subscriptions"
      RENAME COLUMN "payment_id" TO "paymentId"
    `);
    await queryRunner.query(`
      ALTER TABLE "subscriptions"
      RENAME COLUMN "created_at" TO "createdAt"
    `);
    await queryRunner.query(`
      ALTER TABLE "subscriptions"
      RENAME COLUMN "updated_at" TO "updatedAt"
    `);

    // Recreate old FK constraints
    await queryRunner.query(`
      ALTER TABLE "subscriptions"
      ADD CONSTRAINT "FK_subscriptions_organisationId"
      FOREIGN KEY ("organisationId") REFERENCES "organisations"("id")
      ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "subscriptions"
      ADD CONSTRAINT "FK_subscriptions_paymentId"
      FOREIGN KEY ("paymentId") REFERENCES "payments"("id")
      ON DELETE SET NULL
    `);

    // Recreate old indexes
    await queryRunner.query(`
      CREATE INDEX "idx_subscriptions_organisationId"
      ON "subscriptions" ("organisationId")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_subscriptions_endDate"
      ON "subscriptions" ("endDate")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_subscriptions_org_status"
      ON "subscriptions" ("organisationId", "status")
    `);
  }
}
