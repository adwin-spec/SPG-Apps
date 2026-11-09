-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "SpgCategoryCode" AS ENUM ('GROSIR', 'HORECA', 'REGULER');

-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "SpgStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ON_LEAVE', 'RESIGNED');

-- CreateEnum
CREATE TYPE "OutletChannel" AS ENUM ('WHOLESALER', 'RETAILER', 'HORECA', 'REGULAR');

-- CreateEnum
CREATE TYPE "OutletStatus" AS ENUM ('PROSPECT', 'ACTIVE', 'INACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "RelationType" AS ENUM ('PRIMARY', 'ALTERNATIVE');

-- CreateEnum
CREATE TYPE "ProductOwner" AS ENUM ('COMPANY', 'COMPETITOR');

-- CreateEnum
CREATE TYPE "DataNature" AS ENUM ('ACTUAL', 'ESTIMATE', 'OBSERVATION');

-- CreateEnum
CREATE TYPE "DataSource" AS ENUM ('MANUAL', 'OFFLINE_SYNC', 'OCR', 'IMPORT');

-- CreateEnum
CREATE TYPE "ValidationStatus" AS ENUM ('SUBMITTED', 'VALIDATED', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED', 'SUPERSEDED', 'REVERSED');

-- CreateEnum
CREATE TYPE "GeofenceStatus" AS ENUM ('INSIDE', 'OUTSIDE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VisitPlanStatus" AS ENUM ('PLANNED', 'VISITED', 'MISSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('CHECKED_IN', 'CHECKED_OUT', 'ABSENT', 'LEAVE');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'REVISION_REQUIRED', 'APPROVED');

-- CreateEnum
CREATE TYPE "StockAvailability" AS ENUM ('IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('NO_ORDER', 'ORDERED', 'CONFIRMED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PosmStatus" AS ENUM ('INSTALLED', 'MISSING', 'DAMAGED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "ProgramStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "ImplementationStatus" AS ENUM ('PLANNED', 'EXECUTED', 'PARTIAL', 'NOT_EXECUTED');

-- CreateEnum
CREATE TYPE "KpiDimension" AS ENUM ('PRODUCTIVITY', 'COVERAGE', 'COMMERCIAL', 'EXECUTION', 'INTELLIGENCE', 'DATA_QUALITY', 'REPORTING_COMPLIANCE');

-- CreateEnum
CREATE TYPE "KpiDirection" AS ENUM ('HIGHER_IS_BETTER', 'LOWER_IS_BETTER');

-- CreateEnum
CREATE TYPE "KpiPeriod" AS ENUM ('MONTHLY');

-- CreateEnum
CREATE TYPE "KpiDataStatus" AS ENUM ('OK', 'NO_DATA', 'NO_TARGET', 'ZERO_TARGET');

-- CreateEnum
CREATE TYPE "FileSource" AS ENUM ('APP_UPLOAD', 'GOOGLE_DRIVE');

-- CreateEnum
CREATE TYPE "FileLogStatus" AS ENUM ('UPLOADED', 'PROCESSING', 'OCR_COMPLETED', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED', 'SYNC_FAILED');

-- CreateEnum
CREATE TYPE "DuplicateType" AS ENUM ('NONE', 'EXACT_DUPLICATE', 'POTENTIAL_DUPLICATE', 'RE_UPLOAD', 'CORRECTED_SUBMISSION');

-- CreateEnum
CREATE TYPE "SyncJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('OPEN', 'RESOLVED', 'IGNORED');

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regions" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "areas" (
    "id" UUID NOT NULL,
    "region_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "districts" (
    "id" UUID NOT NULL,
    "area_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "districts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subdistricts" (
    "id" UUID NOT NULL,
    "district_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subdistricts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "territories" (
    "id" UUID NOT NULL,
    "area_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "territories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supervisors" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "area_id" UUID NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "supervisors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spg_assignments" (
    "id" UUID NOT NULL,
    "spg_id" UUID NOT NULL,
    "area_id" UUID NOT NULL,
    "territory_id" UUID,
    "supervisor_id" UUID,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "reason" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spg_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" VARCHAR(160) NOT NULL,
    "phone" VARCHAR(32),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "region_id" UUID,
    "area_id" UUID,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "last_login_at" TIMESTAMPTZ(6),
    "password_changed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" VARCHAR(48) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "module" VARCHAR(48) NOT NULL,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "family_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "replaced_by" UUID,
    "user_agent" VARCHAR(300),
    "ip" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spg_categories" (
    "id" UUID NOT NULL,
    "code" "SpgCategoryCode" NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" TEXT,

    CONSTRAINT "spg_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spgs" (
    "id" UUID NOT NULL,
    "employee_code" VARCHAR(32) NOT NULL,
    "user_id" UUID,
    "full_name" VARCHAR(160) NOT NULL,
    "phone" VARCHAR(32),
    "category_id" UUID NOT NULL,
    "status" "SpgStatus" NOT NULL DEFAULT 'ACTIVE',
    "join_date" DATE NOT NULL,
    "end_date" DATE,
    "current_area_id" UUID NOT NULL,
    "current_supervisor_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "spgs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spg_employment_history" (
    "id" UUID NOT NULL,
    "spg_id" UUID NOT NULL,
    "event_type" VARCHAR(40) NOT NULL,
    "from_value" JSONB,
    "to_value" JSONB,
    "effective_date" DATE NOT NULL,
    "note" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spg_employment_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outlet_categories" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "channel" "OutletChannel" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "outlet_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outlets" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "normalized_name" VARCHAR(200) NOT NULL,
    "channel" "OutletChannel" NOT NULL,
    "category_id" UUID,
    "address" TEXT,
    "district_id" UUID NOT NULL,
    "subdistrict_id" UUID,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "geofence_radius_m" INTEGER,
    "pic_name" VARCHAR(120),
    "phone" VARCHAR(32),
    "potential_class" VARCHAR(16),
    "status" "OutletStatus" NOT NULL DEFAULT 'ACTIVE',
    "assigned_spg_id" UUID,
    "first_recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "outlets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outlet_assignment_history" (
    "id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "spg_id" UUID,
    "effective_from" TIMESTAMPTZ(6) NOT NULL,
    "effective_to" TIMESTAMPTZ(6),
    "reason" TEXT,
    "created_by_id" UUID,

    CONSTRAINT "outlet_assignment_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retailer_wholesale_relationships" (
    "id" UUID NOT NULL,
    "retailer_outlet_id" UUID NOT NULL,
    "wholesaler_outlet_id" UUID NOT NULL,
    "relation_type" "RelationType" NOT NULL,
    "effective_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMPTZ(6),
    "created_by_id" UUID,

    CONSTRAINT "retailer_wholesale_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitors" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "competitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brands" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "owner" "ProductOwner" NOT NULL,
    "competitor_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "brand_id" UUID NOT NULL,
    "category" VARCHAR(80),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "sku" VARCHAR(60) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "size" VARCHAR(40),
    "unit" VARCHAR(20) NOT NULL,
    "pack_size" INTEGER,
    "list_price" DECIMAL(18,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitor_products" (
    "id" UUID NOT NULL,
    "competitor_id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,
    "sku" VARCHAR(60),
    "name" VARCHAR(200) NOT NULL,
    "variant" VARCHAR(80),
    "unit" VARCHAR(20),
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "competitor_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "spg_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'CHECKED_IN',
    "check_in_at" TIMESTAMPTZ(6),
    "check_in_lat" DECIMAL(9,6),
    "check_in_lng" DECIMAL(9,6),
    "check_in_accuracy_m" INTEGER,
    "check_in_photo_id" UUID,
    "check_out_at" TIMESTAMPTZ(6),
    "check_out_lat" DECIMAL(9,6),
    "check_out_lng" DECIMAL(9,6),
    "check_out_accuracy_m" INTEGER,
    "source" "DataSource" NOT NULL DEFAULT 'MANUAL',
    "client_recorded_at" TIMESTAMPTZ(6),
    "note" TEXT,
    "override_by_id" UUID,
    "override_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_plans" (
    "id" UUID NOT NULL,
    "spg_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "planned_date" DATE NOT NULL,
    "status" "VisitPlanStatus" NOT NULL DEFAULT 'PLANNED',
    "note" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "visit_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visits" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "spg_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "channel" "OutletChannel" NOT NULL,
    "visit_plan_id" UUID,
    "is_planned" BOOLEAN NOT NULL DEFAULT false,
    "visit_date" DATE NOT NULL,
    "status" "VisitStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "check_in_at" TIMESTAMPTZ(6) NOT NULL,
    "check_in_lat" DECIMAL(9,6),
    "check_in_lng" DECIMAL(9,6),
    "check_in_accuracy_m" INTEGER,
    "check_in_distance_m" INTEGER,
    "geofence_status" "GeofenceStatus" NOT NULL DEFAULT 'UNKNOWN',
    "check_out_at" TIMESTAMPTZ(6),
    "check_out_lat" DECIMAL(9,6),
    "check_out_lng" DECIMAL(9,6),
    "duration_min" INTEGER,
    "purpose" TEXT,
    "pic_met" VARCHAR(120),
    "outcome" TEXT,
    "notes" TEXT,
    "follow_up_action" TEXT,
    "order_status" "OrderStatus",
    "is_late" BOOLEAN NOT NULL DEFAULT false,
    "source" "DataSource" NOT NULL DEFAULT 'MANUAL',
    "client_recorded_at" TIMESTAMPTZ(6),
    "override_by_id" UUID,
    "override_reason" TEXT,
    "validation_status" "ValidationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_evidence" (
    "id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "evidence_type" VARCHAR(40) NOT NULL,
    "caption" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visit_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_reports" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "spg_id" UUID NOT NULL,
    "report_date" DATE NOT NULL,
    "channel" "OutletChannel" NOT NULL,
    "summary" TEXT,
    "issues" TEXT,
    "content" JSONB,
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "submitted_at" TIMESTAMPTZ(6),
    "is_late" BOOLEAN NOT NULL DEFAULT false,
    "completeness_score" DECIMAL(5,2),
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "review_note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "daily_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "action" VARCHAR(80) NOT NULL,
    "entity" VARCHAR(60),
    "entity_id" UUID,
    "meta" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wholesale_reports" (
    "id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "wholesaler_outlet_id" UUID NOT NULL,
    "reported_retailer_count" INTEGER,
    "stock_notes" TEXT,
    "market_notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wholesale_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retailer_transactions" (
    "id" UUID NOT NULL,
    "transaction_no" VARCHAR(40) NOT NULL,
    "client_id" UUID NOT NULL,
    "retailer_outlet_id" UUID NOT NULL,
    "wholesaler_outlet_id" UUID,
    "spg_id" UUID NOT NULL,
    "visit_id" UUID,
    "transaction_date" DATE NOT NULL,
    "data_nature" "DataNature" NOT NULL DEFAULT 'ACTUAL',
    "source" "DataSource" NOT NULL DEFAULT 'MANUAL',
    "file_log_id" UUID,
    "evidence_file_id" UUID,
    "total_quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "total_value" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "validation_status" "ValidationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "validation_issues" JSONB,
    "duplicate_type" "DuplicateType" NOT NULL DEFAULT 'NONE',
    "duplicate_of_id" UUID,
    "correction_of_id" UUID,
    "reversal_of_id" UUID,
    "correction_reason" TEXT,
    "notes" TEXT,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "client_recorded_at" TIMESTAMPTZ(6),
    "created_by_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "retailer_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retailer_transaction_items" (
    "id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "product_owner" "ProductOwner" NOT NULL,
    "product_variant_id" UUID,
    "competitor_product_id" UUID,
    "brand_text" VARCHAR(120),
    "sku_text" VARCHAR(120),
    "product_text" VARCHAR(200),
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" VARCHAR(20) NOT NULL,
    "unit_price" DECIMAL(18,2),
    "line_total" DECIMAL(18,2),

    CONSTRAINT "retailer_transaction_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitor_observations" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "spg_id" UUID NOT NULL,
    "visit_id" UUID,
    "channel" "OutletChannel" NOT NULL,
    "outlet_id" UUID NOT NULL,
    "wholesaler_outlet_id" UUID,
    "brand_id" UUID,
    "competitor_product_id" UUID,
    "brand_text" VARCHAR(120),
    "sku_text" VARCHAR(120),
    "variant" VARCHAR(80),
    "observation_date" DATE NOT NULL,
    "quantity_purchased" DECIMAL(14,3),
    "purchase_price" DECIMAL(18,2),
    "selling_price" DECIMAL(18,2),
    "stock_availability" "StockAvailability" NOT NULL DEFAULT 'UNKNOWN',
    "purchase_frequency" VARCHAR(40),
    "facing" INTEGER,
    "has_posm" BOOLEAN,
    "has_promotion" BOOLEAN,
    "promotion_detail" TEXT,
    "activity_detail" TEXT,
    "visibility_note" TEXT,
    "photo_file_id" UUID,
    "data_nature" "DataNature" NOT NULL DEFAULT 'OBSERVATION',
    "validation_status" "ValidationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "source" "DataSource" NOT NULL DEFAULT 'MANUAL',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competitor_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wholesale_observations" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "spg_id" UUID NOT NULL,
    "visit_id" UUID,
    "wholesaler_outlet_id" UUID NOT NULL,
    "product_variant_id" UUID NOT NULL,
    "observation_date" DATE NOT NULL,
    "stock_quantity" DECIMAL(14,3),
    "stock_availability" "StockAvailability" NOT NULL DEFAULT 'UNKNOWN',
    "buy_price" DECIMAL(18,2),
    "sell_price" DECIMAL(18,2),
    "restock_frequency" VARCHAR(40),
    "last_restock_date" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wholesale_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "horeca_visits" (
    "id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "pic_role" VARCHAR(80),
    "visit_purpose" VARCHAR(60) NOT NULL,
    "result" TEXT,
    "next_follow_up_date" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "horeca_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "horeca_sales" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "spg_id" UUID NOT NULL,
    "visit_id" UUID,
    "outlet_id" UUID NOT NULL,
    "product_variant_id" UUID NOT NULL,
    "sale_date" DATE NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" VARCHAR(20) NOT NULL,
    "unit_price" DECIMAL(18,2),
    "sales_value" DECIMAL(18,2),
    "is_order" BOOLEAN NOT NULL DEFAULT true,
    "is_repeat_order" BOOLEAN NOT NULL DEFAULT false,
    "stock_quantity" DECIMAL(14,3),
    "restock_frequency" VARCHAR(40),
    "data_nature" "DataNature" NOT NULL DEFAULT 'ACTUAL',
    "validation_status" "ValidationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "correction_of_id" UUID,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "horeca_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "horeca_programs" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "program_type" VARCHAR(40) NOT NULL,
    "description" TEXT,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "budget" DECIMAL(18,2),
    "status" "ProgramStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "horeca_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "horeca_program_implementations" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "spg_id" UUID NOT NULL,
    "visit_id" UUID,
    "implementation_date" DATE NOT NULL,
    "status" "ImplementationStatus" NOT NULL,
    "actual_cost" DECIMAL(18,2),
    "realization_note" TEXT,
    "effectiveness_note" TEXT,
    "photo_file_id" UUID,
    "validation_status" "ValidationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "horeca_program_implementations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_records" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "spg_id" UUID NOT NULL,
    "visit_id" UUID,
    "outlet_id" UUID NOT NULL,
    "product_variant_id" UUID NOT NULL,
    "record_date" DATE NOT NULL,
    "is_available" BOOLEAN NOT NULL,
    "stock_quantity" DECIMAL(14,3),
    "oos_reason" VARCHAR(120),
    "last_restock_date" DATE,
    "validation_status" "ValidationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availability_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visibility_records" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "spg_id" UUID NOT NULL,
    "visit_id" UUID,
    "outlet_id" UUID NOT NULL,
    "record_date" DATE NOT NULL,
    "company_facing" INTEGER NOT NULL,
    "competitor_facing" INTEGER NOT NULL,
    "total_category_facing" INTEGER NOT NULL,
    "share_of_shelf_pct" DECIMAL(6,2),
    "has_display" BOOLEAN NOT NULL DEFAULT false,
    "display_type" VARCHAR(60),
    "has_promotion" BOOLEAN NOT NULL DEFAULT false,
    "promotion_detail" TEXT,
    "notes" TEXT,
    "photo_file_id" UUID,
    "validation_status" "ValidationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visibility_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posm_records" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "spg_id" UUID NOT NULL,
    "visit_id" UUID,
    "outlet_id" UUID NOT NULL,
    "channel" "OutletChannel" NOT NULL,
    "record_date" DATE NOT NULL,
    "posm_type" VARCHAR(40) NOT NULL,
    "status" "PosmStatus" NOT NULL,
    "quantity" INTEGER,
    "notes" TEXT,
    "photo_file_id" UUID,
    "validation_status" "ValidationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "posm_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outlet_orders" (
    "id" UUID NOT NULL,
    "order_no" VARCHAR(40) NOT NULL,
    "client_id" UUID NOT NULL,
    "spg_id" UUID NOT NULL,
    "visit_id" UUID,
    "outlet_id" UUID NOT NULL,
    "order_date" DATE NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'ORDERED',
    "is_restock" BOOLEAN NOT NULL DEFAULT false,
    "total_quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "total_value" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "data_nature" "DataNature" NOT NULL DEFAULT 'ACTUAL',
    "validation_status" "ValidationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "correction_of_id" UUID,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "outlet_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outlet_order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "product_variant_id" UUID NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" VARCHAR(20) NOT NULL,
    "unit_price" DECIMAL(18,2) NOT NULL,
    "line_total" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "outlet_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_definitions" (
    "id" UUID NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "category_id" UUID NOT NULL,
    "dimension" "KpiDimension" NOT NULL,
    "unit" VARCHAR(20) NOT NULL,
    "period" "KpiPeriod" NOT NULL DEFAULT 'MONTHLY',
    "direction" "KpiDirection" NOT NULL DEFAULT 'HIGHER_IS_BETTER',
    "is_activity" BOOLEAN NOT NULL,
    "data_source" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "kpi_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_formulas" (
    "id" UUID NOT NULL,
    "kpi_definition_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "metric_key" VARCHAR(80) NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "achievement_cap_pct" DECIMAL(6,2),
    "thresholds" JSONB,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kpi_formulas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_weights" (
    "id" UUID NOT NULL,
    "kpi_definition_id" UUID NOT NULL,
    "weight_pct" DECIMAL(6,2) NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "reason" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kpi_weights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "targets" (
    "id" UUID NOT NULL,
    "kpi_definition_id" UUID NOT NULL,
    "period_month" DATE NOT NULL,
    "value" DECIMAL(18,4) NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "target_assignments" (
    "id" UUID NOT NULL,
    "kpi_definition_id" UUID NOT NULL,
    "spg_id" UUID NOT NULL,
    "period_month" DATE NOT NULL,
    "value" DECIMAL(18,4) NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "target_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_results" (
    "id" UUID NOT NULL,
    "spg_id" UUID NOT NULL,
    "kpi_definition_id" UUID NOT NULL,
    "period_month" DATE NOT NULL,
    "formula_version" INTEGER NOT NULL,
    "actual_value" DECIMAL(18,4),
    "target_value" DECIMAL(18,4),
    "target_source" VARCHAR(20),
    "achievement_pct" DECIMAL(9,2),
    "scored_pct" DECIMAL(9,2),
    "weight_pct" DECIMAL(6,2),
    "weighted_score" DECIMAL(9,4),
    "data_status" "KpiDataStatus" NOT NULL,
    "source_count" INTEGER NOT NULL DEFAULT 0,
    "trace" JSONB,
    "computed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_snapshots" (
    "id" UUID NOT NULL,
    "spg_id" UUID NOT NULL,
    "period_month" DATE NOT NULL,
    "total_score" DECIMAL(9,2),
    "activity_score" DECIMAL(9,2),
    "outcome_score" DECIMAL(9,2),
    "weight_coverage" DECIMAL(6,2),
    "rank_in_category" INTEGER,
    "performance_status" VARCHAR(20),
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "locked_by_id" UUID,
    "locked_at" TIMESTAMPTZ(6),
    "config_snapshot" JSONB,
    "computed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL,
    "storage_key" VARCHAR(400) NOT NULL,
    "original_name" VARCHAR(260) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "checksum_sha256" VARCHAR(64) NOT NULL,
    "source" "FileSource" NOT NULL DEFAULT 'APP_UPLOAD',
    "external_id" VARCHAR(200),
    "uploaded_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_logs" (
    "id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "form_id" VARCHAR(60),
    "spg_id" UUID,
    "wholesaler_outlet_id" UUID,
    "report_date" DATE,
    "status" "FileLogStatus" NOT NULL DEFAULT 'UPLOADED',
    "duplicate_type" "DuplicateType" NOT NULL DEFAULT 'NONE',
    "duplicate_of_id" UUID,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "sheet_row_ref" VARCHAR(60),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "file_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ocr_raw" (
    "id" UUID NOT NULL,
    "file_log_id" UUID NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "raw_text" TEXT,
    "raw_json" JSONB,
    "parsed_fields" JSONB NOT NULL,
    "confidence" DECIMAL(5,4),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ocr_raw_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ocr_reviews" (
    "id" UUID NOT NULL,
    "ocr_raw_id" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "corrections" JSONB NOT NULL,
    "final_payload" JSONB NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "decision_note" TEXT,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "result_transaction_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ocr_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_jobs" (
    "id" UUID NOT NULL,
    "integration" VARCHAR(40) NOT NULL,
    "job_type" VARCHAR(60) NOT NULL,
    "status" "SyncJobStatus" NOT NULL DEFAULT 'QUEUED',
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "stats" JSONB,
    "error" TEXT,
    "triggered_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_logs" (
    "id" UUID NOT NULL,
    "sync_job_id" UUID,
    "level" "Severity" NOT NULL,
    "message" TEXT NOT NULL,
    "context" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approvals" (
    "id" UUID NOT NULL,
    "entity_type" VARCHAR(60) NOT NULL,
    "entity_id" UUID NOT NULL,
    "request_type" VARCHAR(40) NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "original_snapshot" JSONB,
    "proposed_change" JSONB,
    "reason" TEXT NOT NULL,
    "requested_by_id" UUID NOT NULL,
    "decided_by_id" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "decision_note" TEXT,
    "result_entity_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" VARCHAR(60) NOT NULL,
    "severity" "Severity" NOT NULL DEFAULT 'INFO',
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT,
    "link" VARCHAR(300),
    "dedup_key" VARCHAR(200),
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(60) NOT NULL,
    "entity_type" VARCHAR(60) NOT NULL,
    "entity_id" VARCHAR(64),
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "ip" VARCHAR(64),
    "user_agent" VARCHAR(300),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" VARCHAR(100) NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "is_simulation_default" BOOLEAN NOT NULL DEFAULT false,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "method" VARCHAR(10) NOT NULL,
    "path" VARCHAR(300) NOT NULL,
    "request_hash" VARCHAR(64) NOT NULL,
    "response_status" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_quality_issues" (
    "id" UUID NOT NULL,
    "rule_code" VARCHAR(60) NOT NULL,
    "dimension" VARCHAR(20) NOT NULL,
    "entity_type" VARCHAR(60) NOT NULL,
    "entity_id" UUID NOT NULL,
    "spg_id" UUID,
    "severity" "Severity" NOT NULL,
    "message" TEXT NOT NULL,
    "status" "IssueStatus" NOT NULL DEFAULT 'OPEN',
    "detected_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),
    "resolved_by_id" UUID,

    CONSTRAINT "data_quality_issues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_code_key" ON "companies"("code");

-- CreateIndex
CREATE UNIQUE INDEX "regions_code_key" ON "regions"("code");

-- CreateIndex
CREATE INDEX "regions_company_id_idx" ON "regions"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "areas_code_key" ON "areas"("code");

-- CreateIndex
CREATE INDEX "areas_region_id_idx" ON "areas"("region_id");

-- CreateIndex
CREATE UNIQUE INDEX "districts_code_key" ON "districts"("code");

-- CreateIndex
CREATE INDEX "districts_area_id_idx" ON "districts"("area_id");

-- CreateIndex
CREATE UNIQUE INDEX "subdistricts_code_key" ON "subdistricts"("code");

-- CreateIndex
CREATE INDEX "subdistricts_district_id_idx" ON "subdistricts"("district_id");

-- CreateIndex
CREATE UNIQUE INDEX "territories_code_key" ON "territories"("code");

-- CreateIndex
CREATE INDEX "territories_area_id_idx" ON "territories"("area_id");

-- CreateIndex
CREATE UNIQUE INDEX "supervisors_user_id_key" ON "supervisors"("user_id");

-- CreateIndex
CREATE INDEX "supervisors_area_id_idx" ON "supervisors"("area_id");

-- CreateIndex
CREATE INDEX "spg_assignments_spg_id_effective_from_idx" ON "spg_assignments"("spg_id", "effective_from");

-- CreateIndex
CREATE INDEX "spg_assignments_supervisor_id_idx" ON "spg_assignments"("supervisor_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- CreateIndex
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE UNIQUE INDEX "spg_categories_code_key" ON "spg_categories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "spgs_employee_code_key" ON "spgs"("employee_code");

-- CreateIndex
CREATE UNIQUE INDEX "spgs_user_id_key" ON "spgs"("user_id");

-- CreateIndex
CREATE INDEX "spgs_category_id_status_idx" ON "spgs"("category_id", "status");

-- CreateIndex
CREATE INDEX "spgs_current_area_id_idx" ON "spgs"("current_area_id");

-- CreateIndex
CREATE INDEX "spgs_current_supervisor_id_idx" ON "spgs"("current_supervisor_id");

-- CreateIndex
CREATE INDEX "spg_employment_history_spg_id_effective_date_idx" ON "spg_employment_history"("spg_id", "effective_date");

-- CreateIndex
CREATE UNIQUE INDEX "outlet_categories_code_key" ON "outlet_categories"("code");

-- CreateIndex
CREATE INDEX "outlet_categories_channel_idx" ON "outlet_categories"("channel");

-- CreateIndex
CREATE UNIQUE INDEX "outlets_code_key" ON "outlets"("code");

-- CreateIndex
CREATE INDEX "outlets_channel_status_idx" ON "outlets"("channel", "status");

-- CreateIndex
CREATE INDEX "outlets_district_id_idx" ON "outlets"("district_id");

-- CreateIndex
CREATE INDEX "outlets_subdistrict_id_idx" ON "outlets"("subdistrict_id");

-- CreateIndex
CREATE INDEX "outlets_assigned_spg_id_idx" ON "outlets"("assigned_spg_id");

-- CreateIndex
CREATE INDEX "outlet_assignment_history_outlet_id_effective_from_idx" ON "outlet_assignment_history"("outlet_id", "effective_from");

-- CreateIndex
CREATE INDEX "retailer_wholesale_relationships_retailer_outlet_id_idx" ON "retailer_wholesale_relationships"("retailer_outlet_id");

-- CreateIndex
CREATE INDEX "retailer_wholesale_relationships_wholesaler_outlet_id_idx" ON "retailer_wholesale_relationships"("wholesaler_outlet_id");

-- CreateIndex
CREATE UNIQUE INDEX "competitors_code_key" ON "competitors"("code");

-- CreateIndex
CREATE UNIQUE INDEX "brands_code_key" ON "brands"("code");

-- CreateIndex
CREATE INDEX "brands_owner_idx" ON "brands"("owner");

-- CreateIndex
CREATE UNIQUE INDEX "products_code_key" ON "products"("code");

-- CreateIndex
CREATE INDEX "products_brand_id_idx" ON "products"("brand_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_sku_key" ON "product_variants"("sku");

-- CreateIndex
CREATE INDEX "product_variants_product_id_idx" ON "product_variants"("product_id");

-- CreateIndex
CREATE INDEX "competitor_products_competitor_id_idx" ON "competitor_products"("competitor_id");

-- CreateIndex
CREATE UNIQUE INDEX "competitor_products_brand_id_name_variant_key" ON "competitor_products"("brand_id", "name", "variant");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_client_id_key" ON "attendance"("client_id");

-- CreateIndex
CREATE INDEX "attendance_work_date_idx" ON "attendance"("work_date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_spg_id_work_date_key" ON "attendance"("spg_id", "work_date");

-- CreateIndex
CREATE INDEX "visit_plans_planned_date_status_idx" ON "visit_plans"("planned_date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "visit_plans_spg_id_outlet_id_planned_date_key" ON "visit_plans"("spg_id", "outlet_id", "planned_date");

-- CreateIndex
CREATE UNIQUE INDEX "visits_client_id_key" ON "visits"("client_id");

-- CreateIndex
CREATE INDEX "visits_spg_id_visit_date_idx" ON "visits"("spg_id", "visit_date");

-- CreateIndex
CREATE INDEX "visits_outlet_id_visit_date_idx" ON "visits"("outlet_id", "visit_date");

-- CreateIndex
CREATE INDEX "visits_visit_date_channel_idx" ON "visits"("visit_date", "channel");

-- CreateIndex
CREATE INDEX "visit_evidence_visit_id_idx" ON "visit_evidence"("visit_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_reports_client_id_key" ON "daily_reports"("client_id");

-- CreateIndex
CREATE INDEX "daily_reports_report_date_status_idx" ON "daily_reports"("report_date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "daily_reports_spg_id_report_date_key" ON "daily_reports"("spg_id", "report_date");

-- CreateIndex
CREATE INDEX "activity_logs_user_id_created_at_idx" ON "activity_logs"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "wholesale_reports_visit_id_key" ON "wholesale_reports"("visit_id");

-- CreateIndex
CREATE INDEX "wholesale_reports_wholesaler_outlet_id_idx" ON "wholesale_reports"("wholesaler_outlet_id");

-- CreateIndex
CREATE UNIQUE INDEX "retailer_transactions_transaction_no_key" ON "retailer_transactions"("transaction_no");

-- CreateIndex
CREATE UNIQUE INDEX "retailer_transactions_client_id_key" ON "retailer_transactions"("client_id");

-- CreateIndex
CREATE INDEX "retailer_transactions_spg_id_transaction_date_idx" ON "retailer_transactions"("spg_id", "transaction_date");

-- CreateIndex
CREATE INDEX "retailer_transactions_retailer_outlet_id_transaction_date_idx" ON "retailer_transactions"("retailer_outlet_id", "transaction_date");

-- CreateIndex
CREATE INDEX "retailer_transactions_wholesaler_outlet_id_transaction_date_idx" ON "retailer_transactions"("wholesaler_outlet_id", "transaction_date");

-- CreateIndex
CREATE INDEX "retailer_transactions_validation_status_transaction_date_idx" ON "retailer_transactions"("validation_status", "transaction_date");

-- CreateIndex
CREATE INDEX "retailer_transaction_items_product_variant_id_idx" ON "retailer_transaction_items"("product_variant_id");

-- CreateIndex
CREATE INDEX "retailer_transaction_items_competitor_product_id_idx" ON "retailer_transaction_items"("competitor_product_id");

-- CreateIndex
CREATE UNIQUE INDEX "retailer_transaction_items_transaction_id_line_no_key" ON "retailer_transaction_items"("transaction_id", "line_no");

-- CreateIndex
CREATE UNIQUE INDEX "competitor_observations_client_id_key" ON "competitor_observations"("client_id");

-- CreateIndex
CREATE INDEX "competitor_observations_observation_date_channel_idx" ON "competitor_observations"("observation_date", "channel");

-- CreateIndex
CREATE INDEX "competitor_observations_outlet_id_observation_date_idx" ON "competitor_observations"("outlet_id", "observation_date");

-- CreateIndex
CREATE INDEX "competitor_observations_brand_id_observation_date_idx" ON "competitor_observations"("brand_id", "observation_date");

-- CreateIndex
CREATE INDEX "competitor_observations_spg_id_observation_date_idx" ON "competitor_observations"("spg_id", "observation_date");

-- CreateIndex
CREATE UNIQUE INDEX "wholesale_observations_client_id_key" ON "wholesale_observations"("client_id");

-- CreateIndex
CREATE INDEX "wholesale_observations_wholesaler_outlet_id_observation_dat_idx" ON "wholesale_observations"("wholesaler_outlet_id", "observation_date");

-- CreateIndex
CREATE UNIQUE INDEX "horeca_visits_visit_id_key" ON "horeca_visits"("visit_id");

-- CreateIndex
CREATE UNIQUE INDEX "horeca_sales_client_id_key" ON "horeca_sales"("client_id");

-- CreateIndex
CREATE INDEX "horeca_sales_spg_id_sale_date_idx" ON "horeca_sales"("spg_id", "sale_date");

-- CreateIndex
CREATE INDEX "horeca_sales_outlet_id_sale_date_idx" ON "horeca_sales"("outlet_id", "sale_date");

-- CreateIndex
CREATE INDEX "horeca_sales_validation_status_sale_date_idx" ON "horeca_sales"("validation_status", "sale_date");

-- CreateIndex
CREATE UNIQUE INDEX "horeca_programs_code_key" ON "horeca_programs"("code");

-- CreateIndex
CREATE UNIQUE INDEX "horeca_program_implementations_client_id_key" ON "horeca_program_implementations"("client_id");

-- CreateIndex
CREATE INDEX "horeca_program_implementations_program_id_idx" ON "horeca_program_implementations"("program_id");

-- CreateIndex
CREATE INDEX "horeca_program_implementations_spg_id_implementation_date_idx" ON "horeca_program_implementations"("spg_id", "implementation_date");

-- CreateIndex
CREATE UNIQUE INDEX "availability_records_client_id_key" ON "availability_records"("client_id");

-- CreateIndex
CREATE INDEX "availability_records_outlet_id_record_date_idx" ON "availability_records"("outlet_id", "record_date");

-- CreateIndex
CREATE INDEX "availability_records_spg_id_record_date_idx" ON "availability_records"("spg_id", "record_date");

-- CreateIndex
CREATE INDEX "availability_records_product_variant_id_record_date_idx" ON "availability_records"("product_variant_id", "record_date");

-- CreateIndex
CREATE UNIQUE INDEX "visibility_records_client_id_key" ON "visibility_records"("client_id");

-- CreateIndex
CREATE INDEX "visibility_records_outlet_id_record_date_idx" ON "visibility_records"("outlet_id", "record_date");

-- CreateIndex
CREATE INDEX "visibility_records_spg_id_record_date_idx" ON "visibility_records"("spg_id", "record_date");

-- CreateIndex
CREATE UNIQUE INDEX "posm_records_client_id_key" ON "posm_records"("client_id");

-- CreateIndex
CREATE INDEX "posm_records_outlet_id_record_date_idx" ON "posm_records"("outlet_id", "record_date");

-- CreateIndex
CREATE INDEX "posm_records_spg_id_record_date_idx" ON "posm_records"("spg_id", "record_date");

-- CreateIndex
CREATE UNIQUE INDEX "outlet_orders_order_no_key" ON "outlet_orders"("order_no");

-- CreateIndex
CREATE UNIQUE INDEX "outlet_orders_client_id_key" ON "outlet_orders"("client_id");

-- CreateIndex
CREATE INDEX "outlet_orders_spg_id_order_date_idx" ON "outlet_orders"("spg_id", "order_date");

-- CreateIndex
CREATE INDEX "outlet_orders_outlet_id_order_date_idx" ON "outlet_orders"("outlet_id", "order_date");

-- CreateIndex
CREATE INDEX "outlet_orders_validation_status_order_date_idx" ON "outlet_orders"("validation_status", "order_date");

-- CreateIndex
CREATE INDEX "outlet_order_items_product_variant_id_idx" ON "outlet_order_items"("product_variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "outlet_order_items_order_id_line_no_key" ON "outlet_order_items"("order_id", "line_no");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_definitions_code_key" ON "kpi_definitions"("code");

-- CreateIndex
CREATE INDEX "kpi_definitions_category_id_is_active_idx" ON "kpi_definitions"("category_id", "is_active");

-- CreateIndex
CREATE INDEX "kpi_formulas_kpi_definition_id_effective_from_idx" ON "kpi_formulas"("kpi_definition_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_formulas_kpi_definition_id_version_key" ON "kpi_formulas"("kpi_definition_id", "version");

-- CreateIndex
CREATE INDEX "kpi_weights_kpi_definition_id_effective_from_idx" ON "kpi_weights"("kpi_definition_id", "effective_from");

-- CreateIndex
CREATE INDEX "targets_kpi_definition_id_period_month_is_current_idx" ON "targets"("kpi_definition_id", "period_month", "is_current");

-- CreateIndex
CREATE INDEX "target_assignments_spg_id_period_month_is_current_idx" ON "target_assignments"("spg_id", "period_month", "is_current");

-- CreateIndex
CREATE INDEX "target_assignments_kpi_definition_id_period_month_idx" ON "target_assignments"("kpi_definition_id", "period_month");

-- CreateIndex
CREATE INDEX "performance_results_period_month_idx" ON "performance_results"("period_month");

-- CreateIndex
CREATE UNIQUE INDEX "performance_results_spg_id_kpi_definition_id_period_month_key" ON "performance_results"("spg_id", "kpi_definition_id", "period_month");

-- CreateIndex
CREATE INDEX "performance_snapshots_period_month_idx" ON "performance_snapshots"("period_month");

-- CreateIndex
CREATE UNIQUE INDEX "performance_snapshots_spg_id_period_month_key" ON "performance_snapshots"("spg_id", "period_month");

-- CreateIndex
CREATE UNIQUE INDEX "files_storage_key_key" ON "files"("storage_key");

-- CreateIndex
CREATE INDEX "files_checksum_sha256_idx" ON "files"("checksum_sha256");

-- CreateIndex
CREATE INDEX "files_external_id_idx" ON "files"("external_id");

-- CreateIndex
CREATE INDEX "file_logs_status_created_at_idx" ON "file_logs"("status", "created_at");

-- CreateIndex
CREATE INDEX "file_logs_spg_id_report_date_idx" ON "file_logs"("spg_id", "report_date");

-- CreateIndex
CREATE INDEX "ocr_raw_file_log_id_idx" ON "ocr_raw"("file_log_id");

-- CreateIndex
CREATE INDEX "ocr_reviews_status_idx" ON "ocr_reviews"("status");

-- CreateIndex
CREATE INDEX "sync_jobs_integration_created_at_idx" ON "sync_jobs"("integration", "created_at");

-- CreateIndex
CREATE INDEX "integration_logs_sync_job_id_idx" ON "integration_logs"("sync_job_id");

-- CreateIndex
CREATE INDEX "integration_logs_created_at_idx" ON "integration_logs"("created_at");

-- CreateIndex
CREATE INDEX "approvals_status_created_at_idx" ON "approvals"("status", "created_at");

-- CreateIndex
CREATE INDEX "approvals_entity_type_entity_id_idx" ON "approvals"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedup_key_key" ON "notifications"("dedup_key");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "idempotency_keys_created_at_idx" ON "idempotency_keys"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_user_id_key_key" ON "idempotency_keys"("user_id", "key");

-- CreateIndex
CREATE INDEX "data_quality_issues_status_severity_idx" ON "data_quality_issues"("status", "severity");

-- CreateIndex
CREATE INDEX "data_quality_issues_spg_id_idx" ON "data_quality_issues"("spg_id");

-- CreateIndex
CREATE UNIQUE INDEX "data_quality_issues_rule_code_entity_type_entity_id_key" ON "data_quality_issues"("rule_code", "entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "regions" ADD CONSTRAINT "regions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "areas" ADD CONSTRAINT "areas_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "districts" ADD CONSTRAINT "districts_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subdistricts" ADD CONSTRAINT "subdistricts_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "territories" ADD CONSTRAINT "territories_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisors" ADD CONSTRAINT "supervisors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisors" ADD CONSTRAINT "supervisors_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spg_assignments" ADD CONSTRAINT "spg_assignments_spg_id_fkey" FOREIGN KEY ("spg_id") REFERENCES "spgs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spg_assignments" ADD CONSTRAINT "spg_assignments_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spg_assignments" ADD CONSTRAINT "spg_assignments_territory_id_fkey" FOREIGN KEY ("territory_id") REFERENCES "territories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spg_assignments" ADD CONSTRAINT "spg_assignments_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "supervisors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spgs" ADD CONSTRAINT "spgs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spgs" ADD CONSTRAINT "spgs_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "spg_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spgs" ADD CONSTRAINT "spgs_current_area_id_fkey" FOREIGN KEY ("current_area_id") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spgs" ADD CONSTRAINT "spgs_current_supervisor_id_fkey" FOREIGN KEY ("current_supervisor_id") REFERENCES "supervisors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spg_employment_history" ADD CONSTRAINT "spg_employment_history_spg_id_fkey" FOREIGN KEY ("spg_id") REFERENCES "spgs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "outlet_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_subdistrict_id_fkey" FOREIGN KEY ("subdistrict_id") REFERENCES "subdistricts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_assigned_spg_id_fkey" FOREIGN KEY ("assigned_spg_id") REFERENCES "spgs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlet_assignment_history" ADD CONSTRAINT "outlet_assignment_history_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retailer_wholesale_relationships" ADD CONSTRAINT "retailer_wholesale_relationships_retailer_outlet_id_fkey" FOREIGN KEY ("retailer_outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retailer_wholesale_relationships" ADD CONSTRAINT "retailer_wholesale_relationships_wholesaler_outlet_id_fkey" FOREIGN KEY ("wholesaler_outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brands" ADD CONSTRAINT "brands_competitor_id_fkey" FOREIGN KEY ("competitor_id") REFERENCES "competitors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_products" ADD CONSTRAINT "competitor_products_competitor_id_fkey" FOREIGN KEY ("competitor_id") REFERENCES "competitors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_products" ADD CONSTRAINT "competitor_products_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_spg_id_fkey" FOREIGN KEY ("spg_id") REFERENCES "spgs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_plans" ADD CONSTRAINT "visit_plans_spg_id_fkey" FOREIGN KEY ("spg_id") REFERENCES "spgs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_plans" ADD CONSTRAINT "visit_plans_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_spg_id_fkey" FOREIGN KEY ("spg_id") REFERENCES "spgs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_visit_plan_id_fkey" FOREIGN KEY ("visit_plan_id") REFERENCES "visit_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_evidence" ADD CONSTRAINT "visit_evidence_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_evidence" ADD CONSTRAINT "visit_evidence_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_reports" ADD CONSTRAINT "daily_reports_spg_id_fkey" FOREIGN KEY ("spg_id") REFERENCES "spgs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wholesale_reports" ADD CONSTRAINT "wholesale_reports_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retailer_transactions" ADD CONSTRAINT "retailer_transactions_retailer_outlet_id_fkey" FOREIGN KEY ("retailer_outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retailer_transactions" ADD CONSTRAINT "retailer_transactions_wholesaler_outlet_id_fkey" FOREIGN KEY ("wholesaler_outlet_id") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retailer_transactions" ADD CONSTRAINT "retailer_transactions_spg_id_fkey" FOREIGN KEY ("spg_id") REFERENCES "spgs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retailer_transaction_items" ADD CONSTRAINT "retailer_transaction_items_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "retailer_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retailer_transaction_items" ADD CONSTRAINT "retailer_transaction_items_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retailer_transaction_items" ADD CONSTRAINT "retailer_transaction_items_competitor_product_id_fkey" FOREIGN KEY ("competitor_product_id") REFERENCES "competitor_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_observations" ADD CONSTRAINT "competitor_observations_spg_id_fkey" FOREIGN KEY ("spg_id") REFERENCES "spgs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_observations" ADD CONSTRAINT "competitor_observations_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_observations" ADD CONSTRAINT "competitor_observations_wholesaler_outlet_id_fkey" FOREIGN KEY ("wholesaler_outlet_id") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_observations" ADD CONSTRAINT "competitor_observations_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_observations" ADD CONSTRAINT "competitor_observations_competitor_product_id_fkey" FOREIGN KEY ("competitor_product_id") REFERENCES "competitor_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wholesale_observations" ADD CONSTRAINT "wholesale_observations_spg_id_fkey" FOREIGN KEY ("spg_id") REFERENCES "spgs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wholesale_observations" ADD CONSTRAINT "wholesale_observations_wholesaler_outlet_id_fkey" FOREIGN KEY ("wholesaler_outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wholesale_observations" ADD CONSTRAINT "wholesale_observations_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "horeca_visits" ADD CONSTRAINT "horeca_visits_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "horeca_sales" ADD CONSTRAINT "horeca_sales_spg_id_fkey" FOREIGN KEY ("spg_id") REFERENCES "spgs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "horeca_sales" ADD CONSTRAINT "horeca_sales_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "horeca_sales" ADD CONSTRAINT "horeca_sales_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "horeca_program_implementations" ADD CONSTRAINT "horeca_program_implementations_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "horeca_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "horeca_program_implementations" ADD CONSTRAINT "horeca_program_implementations_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "horeca_program_implementations" ADD CONSTRAINT "horeca_program_implementations_spg_id_fkey" FOREIGN KEY ("spg_id") REFERENCES "spgs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_records" ADD CONSTRAINT "availability_records_spg_id_fkey" FOREIGN KEY ("spg_id") REFERENCES "spgs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_records" ADD CONSTRAINT "availability_records_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_records" ADD CONSTRAINT "availability_records_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visibility_records" ADD CONSTRAINT "visibility_records_spg_id_fkey" FOREIGN KEY ("spg_id") REFERENCES "spgs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visibility_records" ADD CONSTRAINT "visibility_records_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posm_records" ADD CONSTRAINT "posm_records_spg_id_fkey" FOREIGN KEY ("spg_id") REFERENCES "spgs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posm_records" ADD CONSTRAINT "posm_records_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlet_orders" ADD CONSTRAINT "outlet_orders_spg_id_fkey" FOREIGN KEY ("spg_id") REFERENCES "spgs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlet_orders" ADD CONSTRAINT "outlet_orders_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlet_order_items" ADD CONSTRAINT "outlet_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "outlet_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlet_order_items" ADD CONSTRAINT "outlet_order_items_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_definitions" ADD CONSTRAINT "kpi_definitions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "spg_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_formulas" ADD CONSTRAINT "kpi_formulas_kpi_definition_id_fkey" FOREIGN KEY ("kpi_definition_id") REFERENCES "kpi_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_weights" ADD CONSTRAINT "kpi_weights_kpi_definition_id_fkey" FOREIGN KEY ("kpi_definition_id") REFERENCES "kpi_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "targets" ADD CONSTRAINT "targets_kpi_definition_id_fkey" FOREIGN KEY ("kpi_definition_id") REFERENCES "kpi_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "target_assignments" ADD CONSTRAINT "target_assignments_kpi_definition_id_fkey" FOREIGN KEY ("kpi_definition_id") REFERENCES "kpi_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "target_assignments" ADD CONSTRAINT "target_assignments_spg_id_fkey" FOREIGN KEY ("spg_id") REFERENCES "spgs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_results" ADD CONSTRAINT "performance_results_spg_id_fkey" FOREIGN KEY ("spg_id") REFERENCES "spgs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_results" ADD CONSTRAINT "performance_results_kpi_definition_id_fkey" FOREIGN KEY ("kpi_definition_id") REFERENCES "kpi_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_snapshots" ADD CONSTRAINT "performance_snapshots_spg_id_fkey" FOREIGN KEY ("spg_id") REFERENCES "spgs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_logs" ADD CONSTRAINT "file_logs_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocr_raw" ADD CONSTRAINT "ocr_raw_file_log_id_fkey" FOREIGN KEY ("file_log_id") REFERENCES "file_logs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocr_reviews" ADD CONSTRAINT "ocr_reviews_ocr_raw_id_fkey" FOREIGN KEY ("ocr_raw_id") REFERENCES "ocr_raw"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_logs" ADD CONSTRAINT "integration_logs_sync_job_id_fkey" FOREIGN KEY ("sync_job_id") REFERENCES "sync_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
