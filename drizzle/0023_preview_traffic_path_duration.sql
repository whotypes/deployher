ALTER TABLE "preview_traffic_events" ADD COLUMN "path" text;
--> statement-breakpoint
ALTER TABLE "preview_traffic_events" ADD COLUMN "duration_ms" integer;
--> statement-breakpoint
CREATE INDEX "preview_traffic_events_deployment_id_occurred_at_idx" ON "preview_traffic_events" USING btree ("deployment_id","occurred_at");
