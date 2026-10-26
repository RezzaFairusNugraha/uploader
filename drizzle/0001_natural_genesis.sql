ALTER TABLE "templates" DROP CONSTRAINT "templates_slug_unique";--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "volume_created_by_app" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "deleted_by" text;--> statement-breakpoint
CREATE UNIQUE INDEX "templates_slug_active_unique" ON "templates" USING btree ("slug") WHERE "templates"."deleted_at" IS NULL;