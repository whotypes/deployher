ALTER TABLE "deployments" ADD COLUMN "runtime_config" jsonb;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "preview_manifest_key" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" text DEFAULT 'user' NOT NULL;