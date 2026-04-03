ALTER TABLE "projects" ADD COLUMN "project_root_dir" text DEFAULT '.' NOT NULL;
ALTER TABLE "projects" ADD COLUMN "framework_hint" text DEFAULT 'auto' NOT NULL;
