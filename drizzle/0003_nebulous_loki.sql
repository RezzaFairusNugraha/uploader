ALTER TABLE "app_settings" ALTER COLUMN "schema" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "default_volume_name" text DEFAULT 'file_storage' NOT NULL;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "schema_created_by_app" boolean DEFAULT false NOT NULL;