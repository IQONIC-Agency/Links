CREATE TABLE "buttons" (
	"id" text PRIMARY KEY NOT NULL,
	"page_id" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"label" text NOT NULL,
	"url" text NOT NULL,
	"age_gate" boolean DEFAULT true NOT NULL,
	"deeplink" boolean DEFAULT true NOT NULL,
	"style" jsonb DEFAULT '{"bgColor":"#ffffff","textColor":"#111111","borderColor":"#ffffff","borderWidth":0,"radius":14}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"page_id" integer NOT NULL,
	"button_id" text,
	"type" text NOT NULL,
	"country" text,
	"device" text NOT NULL,
	"in_app" boolean NOT NULL,
	"in_app_name" text,
	"is_vpn" boolean,
	"visitor_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ip_checks" (
	"ip_hash" text PRIMARY KEY NOT NULL,
	"is_vpn" boolean NOT NULL,
	"proxy_type" text,
	"country" text,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" serial PRIMARY KEY NOT NULL,
	"domain" text NOT NULL,
	"slug" text NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"live" boolean DEFAULT false NOT NULL,
	"deeplink_enabled" boolean DEFAULT true NOT NULL,
	"block_vpn" boolean DEFAULT true NOT NULL,
	"blocked_countries" text[] DEFAULT '{}'::text[] NOT NULL,
	"config" jsonb DEFAULT '{"title":"","subtitle":"","backgroundColor":"#111111","backgroundOverlay":0.3,"textColor":"#ffffff","font":"inter"}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "buttons" ADD CONSTRAINT "buttons_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "buttons_page_idx" ON "buttons" USING btree ("page_id","position");--> statement-breakpoint
CREATE INDEX "events_page_time_idx" ON "events" USING btree ("page_id","created_at");--> statement-breakpoint
CREATE INDEX "events_time_idx" ON "events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pages_domain_slug_uq" ON "pages" USING btree ("domain","slug");