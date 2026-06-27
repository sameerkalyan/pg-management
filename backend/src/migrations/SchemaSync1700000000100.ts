import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Schema Sync Migration
 *
 * This migration brings the database schema in line with the current TypeORM entity definitions.
 * Previous migrations (CreateInitialTables, etc.) were written for an older schema that no longer
 * matches the entities. This migration applies ALTER TABLE statements to bridge the gap.
 *
 * ⚠ DATA PRESERVATION NOTE:
 * - Tables that only need column additions: handled via ALTER TABLE ADD COLUMN
 * - Tables that are fundamentally different (tenants, invoices): DROP and recreate
 *   (data migration required separately for production)
 *
 * Generated from entity files as of June 2026.
 */
export class SchemaSync1700000000100 implements MigrationInterface {
  name = 'SchemaSync1700000000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ──────────────────────────────────────────────
    // 1. USERS — Add missing columns
    // ──────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "locked_until" timestamp,
      ADD COLUMN IF NOT EXISTS "failed_login_attempts" integer DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "password_reset_token" varchar,
      ADD COLUMN IF NOT EXISTS "password_reset_expires" timestamp,
      ADD COLUMN IF NOT EXISTS "mfa_secret" varchar,
      ADD COLUMN IF NOT EXISTS "mfa_enabled" boolean DEFAULT false
    `);
    // Drop and recreate FK if it doesn't have ON DELETE CASCADE
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes WHERE indexname = 'IDX_users_password_reset_token'
        ) THEN
          CREATE INDEX "IDX_users_password_reset_token" ON "users" ("password_reset_token");
        END IF;
      END $$;
    `);

    // ──────────────────────────────────────────────
    // 2. PROPERTIES — Add/remove columns
    // ──────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "properties"
      ADD COLUMN IF NOT EXISTS "managed_by_user_id" uuid,
      ADD COLUMN IF NOT EXISTS "total_floors" integer
    `);
    // Drop columns that no longer exist in entity
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='properties' AND column_name='type') THEN
          ALTER TABLE "properties" DROP COLUMN "type";
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='properties' AND column_name='rules') THEN
          ALTER TABLE "properties" DROP COLUMN "rules";
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='properties' AND column_name='images') THEN
          ALTER TABLE "properties" DROP COLUMN "images";
        END IF;
      END $$;
    `);
    // Make address nullable if it was NOT NULL
    await queryRunner.query(`
      ALTER TABLE "properties" ALTER COLUMN "address" DROP NOT NULL,
      ALTER COLUMN "city" DROP NOT NULL,
      ALTER COLUMN "state" DROP NOT NULL
    `);

    // ──────────────────────────────────────────────
    // 3. ROOMS — Add/remove columns
    // ──────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "rooms"
      ADD COLUMN IF NOT EXISTS "description" text
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='rooms' AND column_name='current_occupancy') THEN
          ALTER TABLE "rooms" DROP COLUMN "current_occupancy";
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='rooms' AND column_name='rent_paise') THEN
          ALTER TABLE "rooms" DROP COLUMN "rent_paise";
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='rooms' AND column_name='deposit_paise') THEN
          ALTER TABLE "rooms" DROP COLUMN "deposit_paise";
        END IF;
      END $$;
    `);

    // ──────────────────────────────────────────────
    // 4. BEDS — Add missing columns
    // ──────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "beds"
      ADD COLUMN IF NOT EXISTS "rent" decimal(10,2),
      ADD COLUMN IF NOT EXISTS "amenities" json,
      ADD COLUMN IF NOT EXISTS "deleted_at" timestamp
    `);

    // ──────────────────────────────────────────────
    // 5. TENANTS — Recreate table (schema completely changed)
    // ──────────────────────────────────────────────
    // First create a new table with the correct schema
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tenants_new" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organisation_id" uuid NOT NULL,
        "user_id" uuid,
        "bed_id" uuid NOT NULL,
        "first_name" varchar NOT NULL,
        "last_name" varchar,
        "phone_number" varchar NOT NULL,
        "email" varchar,
        "id_proof_type" varchar,
        "id_proof_url" varchar,
        "photo_url" varchar,
        "emergency_contact_name" varchar,
        "emergency_contact_phone" varchar,
        "check_in_date" date NOT NULL,
        "check_out_date" date,
        "security_deposit" decimal(10,2),
        "security_deposit_status" varchar DEFAULT 'PENDING',
        "status" varchar DEFAULT 'ACTIVE',
        "agreement_url" varchar,
        "billing_date" integer DEFAULT 1,
        "created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP,
        "deleted_at" timestamp,
        CONSTRAINT "FK_tenants_organisation" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_tenants_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_tenants_bed" FOREIGN KEY ("bed_id") REFERENCES "beds"("id") ON DELETE CASCADE
      )
    `);
    // Copy data from old tenants table if it exists
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='tenants') THEN
          INSERT INTO "tenants_new" ("id", "bed_id", "check_in_date", "check_out_date", "status", "created_at", "updated_at", "deleted_at")
          SELECT "id", COALESCE("bed_id", (SELECT "id" FROM "beds" LIMIT 1)), "check_in_date", "check_out_date", "status", "created_at", "updated_at", "deleted_at"
          FROM "tenants";
        END IF;
      END $$;
    `);
    // Drop old tenants table and rename new one
    await queryRunner.query(`DROP TABLE IF EXISTS "tenants" CASCADE`);
    await queryRunner.query(`ALTER TABLE "tenants_new" RENAME TO "tenants"`);
    // Create indexes for tenants
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_tenants_organisationId" ON "tenants" ("organisation_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_tenants_status" ON "tenants" ("status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_tenants_createdAt" ON "tenants" ("created_at")`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tenants_bedId_status" ON "tenants" ("bed_id", "status") WHERE status = 'ACTIVE'`);

    // ──────────────────────────────────────────────
    // 6. INVOICES — Recreate table (schema completely changed)
    // ──────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "invoices_new" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organisation_id" uuid NOT NULL,
        "tenant_id" uuid NOT NULL,
        "invoice_number" varchar UNIQUE NOT NULL,
        "type" varchar DEFAULT 'RENT',
        "due_date" date NOT NULL,
        "billing_date" date NOT NULL,
        "amount_paise" bigint NOT NULL,
        "amount_paid_paise" bigint DEFAULT 0,
        "status" varchar DEFAULT 'PENDING',
        "description" text,
        "items" json,
        "sent_reminder_at" timestamp,
        "generated_at" timestamp,
        "created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP,
        "deleted_at" timestamp,
        CONSTRAINT "FK_invoices_organisation" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_invoices_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);
    // Copy data from old invoices table if it exists
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='invoices') THEN
          INSERT INTO "invoices_new" ("id", "tenant_id", "invoice_number", "amount_paise", "amount_paid_paise", "due_date", "status", "items", "created_at", "updated_at", "deleted_at", "billing_date", "organisation_id")
          SELECT "id", "tenant_id", "invoice_number", "amount_paise", "amount_paid_paise", "due_date", "status", "items", "created_at", "updated_at", "deleted_at", COALESCE("period_start", CURRENT_DATE), COALESCE((SELECT "organisation_id" FROM "tenants" WHERE "id" = "invoices"."tenant_id"), (SELECT "id" FROM "organisations" LIMIT 1))
          FROM "invoices";
        END IF;
      END $$;
    `);
    // Drop old invoices table and rename new one
    await queryRunner.query(`DROP TABLE IF EXISTS "invoices" CASCADE`);
    await queryRunner.query(`ALTER TABLE "invoices_new" RENAME TO "invoices"`);
    // Create indexes for invoices
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_invoices_organisationId" ON "invoices" ("organisation_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_invoices_tenantId" ON "invoices" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_invoices_status" ON "invoices" ("status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_invoices_billingDate" ON "invoices" ("billing_date")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_invoices_createdAt" ON "invoices" ("created_at")`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_invoices_tenant_billing_type" ON "invoices" ("tenant_id", "billing_date", "type")`);

    // ──────────────────────────────────────────────
    // 7. COMPLAINTS — Add/remove columns
    // ──────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "complaints"
      ADD COLUMN IF NOT EXISTS "organisation_id" uuid,
      ADD COLUMN IF NOT EXISTS "closed_at" timestamp,
      ADD COLUMN IF NOT EXISTS "sla_deadline" timestamp,
      ADD COLUMN IF NOT EXISTS "attachments" json
    `);
    // Rename resolution_notes to resolution if it still exists, then add resolution if missing
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='complaints' AND column_name='resolution_notes') THEN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='complaints' AND column_name='resolution') THEN
            ALTER TABLE "complaints" RENAME COLUMN "resolution_notes" TO "resolution";
          ELSE
            ALTER TABLE "complaints" DROP COLUMN "resolution_notes";
          END IF;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='complaints' AND column_name='resolution') THEN
          ALTER TABLE "complaints" ADD COLUMN "resolution" text;
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='complaints' AND column_name='images') THEN
          ALTER TABLE "complaints" DROP COLUMN "images";
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='complaints' AND column_name='room_id') THEN
          ALTER TABLE "complaints" DROP COLUMN "room_id";
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='complaints' AND column_name='property_id') THEN
          ALTER TABLE "complaints" DROP COLUMN "property_id";
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='complaints' AND column_name='deleted_at') THEN
          ALTER TABLE "complaints" DROP COLUMN "deleted_at";
        END IF;
      END $$;
    `);
    // Add FK for organisation_id
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='FK_complaints_organisation') THEN
          ALTER TABLE "complaints"
          ADD CONSTRAINT "FK_complaints_organisation"
          FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `);
    // Drop old FK constraints that no longer exist
    await queryRunner.query(`
      ALTER TABLE "complaints" DROP CONSTRAINT IF EXISTS "FK_complaints_room";
      ALTER TABLE "complaints" DROP CONSTRAINT IF EXISTS "FK_complaints_property";
    `);
    // Add indexes for complaint entity queries (SWE-34, SWE-61)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_complaints_organisationId" ON "complaints" ("organisation_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_complaints_priority" ON "complaints" ("priority")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_complaints_tenant_status" ON "complaints" ("tenant_id", "status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_complaints_org_status" ON "complaints" ("organisation_id", "status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_complaints_org_createdAt" ON "complaints" ("organisation_id", "created_at")`);

    // ──────────────────────────────────────────────
    // 8. Add missing indexes
    // ──────────────────────────────────────────────
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_users_locked_until" ON "users" ("locked_until")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_properties_createdAt" ON "properties" ("created_at")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_beds_createdAt" ON "beds" ("created_at")`);

    // ──────────────────────────────────────────────
    // 9b. Add composite indexes for query performance
    // ──────────────────────────────────────────────
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_users_org_email" ON "users" ("organisation_id", "email")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_payments_org_status" ON "payments" ("organisation_id", "status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_invoices_tenant_date_status" ON "invoices" ("tenant_id", "billing_date", "status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_properties_managed_by" ON "properties" ("managed_by_user_id")`);

    // ──────────────────────────────────────────────
    // 9. Create audit_logs table if not exists
    // ──────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organisation_id" uuid,
        "user_id" varchar NOT NULL,
        "user_email" varchar NOT NULL,
        "user_role" varchar NOT NULL,
        "action" varchar NOT NULL,
        "entity_type" varchar NOT NULL,
        "entity_id" varchar,
        "entity_name" varchar,
        "old_values" json,
        "new_values" json,
        "ip_address" varchar,
        "user_agent" varchar,
        "request_id" varchar,
        "created_at" timestamp DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Add organisation_id column to existing audit_logs (if table was created earlier)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='organisation_id') THEN
          ALTER TABLE "audit_logs" ADD COLUMN "organisation_id" uuid;
        END IF;
      END $$;
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_userId" ON "audit_logs" ("user_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_entityType" ON "audit_logs" ("entity_type")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_action" ON "audit_logs" ("action")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_createdAt" ON "audit_logs" ("created_at")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_organisationId" ON "audit_logs" ("organisation_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_org_action" ON "audit_logs" ("organisation_id", "action")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse is too complex — this migration is not reversible.
    // To revert, restore from backup or run a fresh database with the old migrations.
    console.warn('SchemaSync migration cannot be reversed. Manual intervention required.');
  }
}
