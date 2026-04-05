ALTER TABLE "projects" ADD COLUMN "site_icon_url" text;
ALTER TABLE "projects" ADD COLUMN "site_og_image_url" text;
ALTER TABLE "projects" ADD COLUMN "site_meta_fetched_at" timestamp with time zone;
ALTER TABLE "projects" ADD COLUMN "site_meta_error" text;
