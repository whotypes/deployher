CREATE TABLE "preview_traffic_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"deployment_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"client_ip" text NOT NULL,
	"method" text NOT NULL,
	"status_code" integer NOT NULL,
	"path_bucket" text
);
--> statement-breakpoint
CREATE TABLE "project_alert_destinations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"webhook_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_alert_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"destination_id" uuid NOT NULL,
	"rule_type" text NOT NULL,
	"threshold" integer NOT NULL,
	"cooldown_seconds" integer DEFAULT 3600 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_fired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_alert_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"http_status" integer,
	"error_message" text
);
--> statement-breakpoint
ALTER TABLE "preview_traffic_events" ADD CONSTRAINT "preview_traffic_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "preview_traffic_events" ADD CONSTRAINT "preview_traffic_events_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_alert_destinations" ADD CONSTRAINT "project_alert_destinations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_alert_rules" ADD CONSTRAINT "project_alert_rules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_alert_rules" ADD CONSTRAINT "project_alert_rules_destination_id_project_alert_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."project_alert_destinations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_alert_deliveries" ADD CONSTRAINT "project_alert_deliveries_rule_id_project_alert_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."project_alert_rules"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "preview_traffic_events_project_id_occurred_at_idx" ON "preview_traffic_events" USING btree ("project_id","occurred_at");
--> statement-breakpoint
CREATE INDEX "project_alert_destinations_project_id_idx" ON "project_alert_destinations" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX "project_alert_rules_project_id_idx" ON "project_alert_rules" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX "project_alert_deliveries_rule_id_idx" ON "project_alert_deliveries" USING btree ("rule_id");
