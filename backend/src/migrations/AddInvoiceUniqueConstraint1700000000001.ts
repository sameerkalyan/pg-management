import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInvoiceUniqueConstraint1700000000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add unique constraint on (tenant_id, billing_date, type) to prevent duplicate invoices
    // Note: Using billing_date and type columns matching the current Invoice entity definition
    const table = await queryRunner.getTable('invoices');
    const hasConstraint = table?.indices?.some(
      (idx) => idx.name === 'UQ_invoices_tenant_billing_type',
    );

    if (!hasConstraint) {
      await queryRunner.query(`
        CREATE UNIQUE INDEX "UQ_invoices_tenant_billing_type"
        ON "invoices" ("tenant_id", "billing_date", "type")
        WHERE "deleted_at" IS NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_invoices_tenant_billing_type"
    `);
  }
}
