CREATE TABLE "app_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"workspace_url" text NOT NULL,
	"token_encrypted" text NOT NULL,
	"catalog" text NOT NULL,
	"schema" text NOT NULL,
	"max_upload_mb" integer DEFAULT 100 NOT NULL,
	"max_templates" integer DEFAULT 50 NOT NULL,
	"admin_password_hash" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"change_summary" text NOT NULL,
	"is_breaking" boolean DEFAULT false NOT NULL,
	"changed_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "template_versions_template_id_version_unique" UNIQUE("template_id","version")
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"delimiter" text DEFAULT ';' NOT NULL,
	"status" text DEFAULT 'membuat' NOT NULL,
	"catalog" text NOT NULL,
	"schema" text NOT NULL,
	"volume_name" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"columns" jsonb NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "templates_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "upload_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"original_name" text NOT NULL,
	"stored_name" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"format" text NOT NULL,
	"destination_path" text NOT NULL,
	"status" text NOT NULL,
	"row_count" integer,
	"uploader_name" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE no action ON UPDATE no action;