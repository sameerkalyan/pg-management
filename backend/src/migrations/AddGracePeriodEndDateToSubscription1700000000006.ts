import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGracePeriodEndDateToSubscription1700000000006 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "subscriptions"
      ADD COLUMN "grace_period_end_date" timestamp NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_subscriptions_grace_period_end_date"
      ON "subscriptions" ("grace_period_end_date")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX "IDX_subscriptions_grace_period_end_date"
    `);
    await queryRunner.query(`
      ALTER TABLE "subscriptions"
      DROP COLUMN "grace_period_end_date"
    `);
  }
}
