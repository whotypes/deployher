ALTER TABLE "deployments" ADD COLUMN "build_strategy" text NOT NULL DEFAULT 'unknown';
ALTER TABLE "deployments" ADD COLUMN "serve_strategy" text NOT NULL DEFAULT 'static';
