ALTER TABLE "templates" ADD COLUMN "csv_folder" text DEFAULT 'csv' NOT NULL;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "parquet_folder" text DEFAULT 'parquet' NOT NULL;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "workspace_host" text;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "needs_check" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "visibility" text;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "visibility_checked_at" timestamp with time zone;