UPDATE "projects" SET "server_preview_target" = 'isolated-runner' WHERE "server_preview_target" = 'trusted-local-docker';--> statement-breakpoint
UPDATE "deployments" SET "build_server_preview_target" = 'isolated-runner' WHERE "build_server_preview_target" = 'trusted-local-docker';
