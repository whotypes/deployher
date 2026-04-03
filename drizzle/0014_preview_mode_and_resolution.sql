ALTER TABLE "projects" ADD COLUMN "preview_mode" text DEFAULT 'auto' NOT NULL;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "server_preview_target" text DEFAULT 'isolated-runner' NOT NULL;
--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "preview_resolution" jsonb;
--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "build_preview_mode" text;
--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "build_server_preview_target" text;
