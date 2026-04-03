ALTER TABLE "deployments" ADD COLUMN "worker_id" text;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "last_heartbeat_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "run_attempt" integer DEFAULT 0 NOT NULL;