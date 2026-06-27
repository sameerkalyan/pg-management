import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateSubscriptionEntities1700000000005 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create subscription_plans table
    await queryRunner.createTable(
      new Table({
        name: 'subscription_plans',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '50',
            isPrimary: true,
          },
          {
            name: 'name',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'amount_paise',
            type: 'bigint',
          },
          {
            name: 'duration_months',
            type: 'int',
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'deleted_at',
            type: 'timestamp',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // Create subscriptions table
    await queryRunner.createTable(
      new Table({
        name: 'subscriptions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'organisationId',
            type: 'uuid',
          },
          {
            name: 'planId',
            type: 'varchar',
            length: '50',
          },
          {
            name: 'amountPaise',
            type: 'bigint',
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['ACTIVE', 'EXPIRED', 'CANCELLED'],
            default: "'ACTIVE'",
          },
          {
            name: 'startDate',
            type: 'timestamp',
          },
          {
            name: 'endDate',
            type: 'timestamp',
          },
          {
            name: 'paymentId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'deletedAt',
            type: 'timestamp',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // Add foreign key for subscriptions.organisationId
    await queryRunner.createForeignKey(
      'subscriptions',
      new TableForeignKey({
        columnNames: ['organisationId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'organisations',
        onDelete: 'CASCADE',
      }),
    );

    // Add foreign key for subscriptions.paymentId
    await queryRunner.createForeignKey(
      'subscriptions',
      new TableForeignKey({
        columnNames: ['paymentId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'payments',
        onDelete: 'SET NULL',
      }),
    );

    // Add indexes for subscriptions
    await queryRunner.createIndex(
      'subscriptions',
      new TableIndex({
        name: 'idx_subscriptions_organisationId',
        columnNames: ['organisationId'],
      }),
    );

    await queryRunner.createIndex(
      'subscriptions',
      new TableIndex({
        name: 'idx_subscriptions_status',
        columnNames: ['status'],
      }),
    );

    await queryRunner.createIndex(
      'subscriptions',
      new TableIndex({
        name: 'idx_subscriptions_endDate',
        columnNames: ['endDate'],
      }),
    );

    await queryRunner.createIndex(
      'subscriptions',
      new TableIndex({
        name: 'idx_subscriptions_org_status',
        columnNames: ['organisationId', 'status'],
      }),
    );

    // Insert default subscription plan
    await queryRunner.query(`
      INSERT INTO subscription_plans (id, name, description, amount_paise, duration_months, is_active)
      VALUES (
        'BASIC_MONTHLY',
        'Basic Monthly',
        'Manage unlimited properties, unlimited tenants, invoice generation, payment tracking, complaint management, dashboard analytics, email support, mobile access',
        500000,
        1,
        true
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.dropIndex('subscriptions', 'idx_subscriptions_org_status');
    await queryRunner.dropIndex('subscriptions', 'idx_subscriptions_endDate');
    await queryRunner.dropIndex('subscriptions', 'idx_subscriptions_status');
    await queryRunner.dropIndex('subscriptions', 'idx_subscriptions_organisationId');

    // Drop foreign keys
    await queryRunner.dropForeignKey('subscriptions', 'paymentId');
    await queryRunner.dropForeignKey('subscriptions', 'organisationId');

    // Drop tables
    await queryRunner.dropTable('subscriptions');
    await queryRunner.dropTable('subscription_plans');
  }
}
