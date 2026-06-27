import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSubscriptionNotificationFields1700000000103 implements MigrationInterface {
  name = 'AddSubscriptionNotificationFields1700000000103';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add notification tracking fields to subscriptions table
    await queryRunner.query(`
      ALTER TABLE "subscriptions"
      ADD COLUMN IF NOT EXISTS "last_reminder_sent_at" TIMESTAMP NULL,
      ADD COLUMN IF NOT EXISTS "grace_period_notified_at" TIMESTAMP NULL
    `);

    // Add indexes for notification queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_subscriptions_last_reminder" 
      ON "subscriptions" ("last_reminder_sent_at")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_subscriptions_grace_notified" 
      ON "subscriptions" ("grace_period_notified_at")
    `);

    console.log('Subscription notification fields added successfully');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_subscriptions_last_reminder"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_subscriptions_grace_notified"
    `);

    // Drop columns
    await queryRunner.query(`
      ALTER TABLE "subscriptions"
      DROP COLUMN IF EXISTS "last_reminder_sent_at",
      DROP COLUMN IF EXISTS "grace_period_notified_at"
    `);

    console.log('Subscription notification fields removed');
  }
}
