CREATE TABLE "admin_login_attempts" (
	"ip_hash" text PRIMARY KEY NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP TABLE "app_settings" CASCADE;--> statement-breakpoint
ALTER TABLE "templates" DROP COLUMN "csv_folder";--> statement-breakpoint
ALTER TABLE "templates" DROP COLUMN "parquet_folder";--> statement-breakpoint
ALTER TABLE "templates" DROP COLUMN "needs_check";--> statement-breakpoint
ALTER TABLE "templates" DROP COLUMN "visibility";--> statement-breakpoint
ALTER TABLE "templates" DROP COLUMN "visibility_checked_at";--> statement-breakpoint
UPDATE "templates" SET "status" = 'draf' WHERE "status" = 'draf_deteksi';
