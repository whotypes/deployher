ALTER TABLE "projects" ADD COLUMN "workspace_root_dir" text DEFAULT '.' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "runtime_image_mode" text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "dockerfile_path" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "docker_build_target" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "skip_host_strategy_build" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "runtime_container_port" integer DEFAULT 3000 NOT NULL;
