import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInitialTables1700000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create Organisations table
    await queryRunner.query(`
      CREATE TABLE "organisations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar UNIQUE NOT NULL,
        "address" varchar,
        "city" varchar,
        "state" varchar,
        "pincode" varchar,
        "phone" varchar,
        "email" varchar,
        "status" varchar DEFAULT 'PENDING',
        "settings" json,
        "rejection_reason" varchar,
        "created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_organisations_status" ON "organisations" ("status")`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_organisations_email" ON "organisations" ("email")`);

    // Create Users table
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organisation_id" uuid,
        "email" varchar UNIQUE NOT NULL,
        "password" varchar NOT NULL,
        "first_name" varchar NOT NULL,
        "last_name" varchar,
        "phone_number" varchar,
        "role" varchar DEFAULT 'TENANT',
        "status" varchar DEFAULT 'ACTIVE',
        "avatar_url" varchar,
        "google_id" varchar,
        "picture_url" varchar,
        "last_login_at" timestamp,
        "created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP,
        "deleted_at" timestamp,
        CONSTRAINT "FK_users_organisation" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_users_organisationId" ON "users" ("organisation_id")`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_users_email" ON "users" ("email")`);
    await queryRunner.query(`CREATE INDEX "IDX_users_status" ON "users" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_users_createdAt" ON "users" ("created_at")`);

    // Create Properties table
    await queryRunner.query(`
      CREATE TABLE "properties" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organisation_id" uuid NOT NULL,
        "name" varchar NOT NULL,
        "address" varchar NOT NULL,
        "city" varchar NOT NULL,
        "state" varchar NOT NULL,
        "pincode" varchar,
        "type" varchar DEFAULT 'PG',
        "description" text,
        "amenities" json,
        "rules" text,
        "images" json,
        "status" varchar DEFAULT 'ACTIVE',
        "created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP,
        "deleted_at" timestamp,
        CONSTRAINT "FK_properties_organisation" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_properties_organisationId" ON "properties" ("organisation_id")`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_properties_status" ON "properties" ("status")`);

    // Create Rooms table
    await queryRunner.query(`
      CREATE TABLE "rooms" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "property_id" uuid NOT NULL,
        "room_number" varchar NOT NULL,
        "floor" integer,
        "type" varchar DEFAULT 'SHARED',
        "capacity" integer DEFAULT 1,
        "current_occupancy" integer DEFAULT 0,
        "rent_paise" bigint NOT NULL,
        "deposit_paise" bigint,
        "amenities" json,
        "status" varchar DEFAULT 'AVAILABLE',
        "created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP,
        "deleted_at" timestamp,
        CONSTRAINT "FK_rooms_property" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_rooms_propertyId" ON "rooms" ("property_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_rooms_status" ON "rooms" ("status")`);

    // Create Beds table
    await queryRunner.query(`
      CREATE TABLE "beds" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "room_id" uuid NOT NULL,
        "bed_number" varchar NOT NULL,
        "status" varchar DEFAULT 'AVAILABLE',
        "created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "FK_beds_room" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_beds_roomId" ON "beds" ("room_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_beds_status" ON "beds" ("status")`);

    // Create Tenants table
    await queryRunner.query(`
      CREATE TABLE "tenants" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "room_id" uuid,
        "bed_id" uuid,
        "property_id" uuid NOT NULL,
        "check_in_date" date NOT NULL,
        "check_out_date" date,
        "rent_paise" bigint NOT NULL,
        "deposit_paise" bigint,
        "status" varchar DEFAULT 'ACTIVE',
        "emergency_contact_name" varchar,
        "emergency_contact_phone" varchar,
        "documents" json,
        "created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP,
        "deleted_at" timestamp,
        CONSTRAINT "FK_tenants_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_tenants_room" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_tenants_bed" FOREIGN KEY ("bed_id") REFERENCES "beds"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_tenants_property" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_tenants_userId" ON "tenants" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_tenants_roomId" ON "tenants" ("room_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_tenants_propertyId" ON "tenants" ("property_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_tenants_status" ON "tenants" ("status")`);

    // Create Invoices table
    await queryRunner.query(`
      CREATE TABLE "invoices" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "property_id" uuid NOT NULL,
        "invoice_number" varchar UNIQUE NOT NULL,
        "amount_paise" bigint NOT NULL,
        "amount_paid_paise" bigint DEFAULT 0,
        "due_date" date NOT NULL,
        "billing_date" date NOT NULL,
        "type" varchar DEFAULT 'RENT',
        "status" varchar DEFAULT 'PENDING',
        "period_start" date NOT NULL,
        "period_end" date NOT NULL,
        "items" json,
        "notes" text,
        "created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP,
        "deleted_at" timestamp,
        CONSTRAINT "FK_invoices_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_invoices_property" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_invoices_tenantId" ON "invoices" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_invoices_propertyId" ON "invoices" ("property_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_invoices_status" ON "invoices" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_invoices_dueDate" ON "invoices" ("due_date")`);

    // Create Payments table
    await queryRunner.query(`
      CREATE TABLE "payments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organisation_id" uuid NOT NULL,
        "invoice_id" uuid,
        "payment_number" varchar UNIQUE NOT NULL,
        "amount_paise" bigint NOT NULL,
        "method" varchar NOT NULL,
        "status" varchar DEFAULT 'PENDING',
        "transaction_id" varchar,
        "razorpay_order_id" varchar,
        "razorpay_payment_id" varchar,
        "razorpay_signature" varchar,
        "notes" text,
        "receipt_url" varchar,
        "paid_at" timestamp,
        "created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP,
        "deleted_at" timestamp,
        CONSTRAINT "FK_payments_organisation" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_payments_invoice" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_payments_organisationId" ON "payments" ("organisation_id")`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_payments_invoiceId" ON "payments" ("invoice_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_payments_status" ON "payments" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_payments_createdAt" ON "payments" ("created_at")`);

    // Create Complaints table
    await queryRunner.query(`
      CREATE TABLE "complaints" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organisation_id" uuid NOT NULL,
        "tenant_id" uuid NOT NULL,
        "room_id" uuid,
        "property_id" uuid NOT NULL,
        "category" varchar NOT NULL,
        "description" text NOT NULL,
        "status" varchar DEFAULT 'PENDING',
        "priority" varchar DEFAULT 'MEDIUM',
        "assigned_to" uuid,
        "resolved_at" timestamp,
        "resolution_notes" text,
        "images" json,
        "created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP,
        "deleted_at" timestamp,
        CONSTRAINT "FK_complaints_organisation" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_complaints_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_complaints_room" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_complaints_property" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_complaints_assigned_to" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_complaints_tenantId" ON "complaints" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_complaints_roomId" ON "complaints" ("room_id")`);
    await queryRunner.query(
      `CREATE INDEX "IDX_complaints_propertyId" ON "complaints" ("property_id")`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_complaints_status" ON "complaints" ("status")`);
    await queryRunner.query(
      `CREATE INDEX "IDX_complaints_organisationId" ON "complaints" ("organisation_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_complaints_tenant_status" ON "complaints" ("tenant_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_complaints_org_status" ON "complaints" ("organisation_id", "status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "complaints"`);
    await queryRunner.query(`DROP TABLE "payments"`);
    await queryRunner.query(`DROP TABLE "invoices"`);
    await queryRunner.query(`DROP TABLE "tenants"`);
    await queryRunner.query(`DROP TABLE "beds"`);
    await queryRunner.query(`DROP TABLE "rooms"`);
    await queryRunner.query(`DROP TABLE "properties"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TABLE "organisations"`);
  }
}
