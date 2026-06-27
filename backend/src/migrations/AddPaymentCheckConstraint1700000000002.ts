import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentCheckConstraint1700000000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add check constraint to ensure amount_paise is always positive
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='CHK_payments_amount_positive') THEN
          ALTER TABLE "payments"
          ADD CONSTRAINT "CHK_payments_amount_positive" 
          CHECK ("amount_paise" > 0);
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop the check constraint
    await queryRunner.query(`
      ALTER TABLE "payments"
      DROP CONSTRAINT "CHK_payments_amount_positive"
    `);
  }
}
