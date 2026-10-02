CREATE TABLE "domains" (
	"domain" text PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_failures" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"tenant_id" integer,
	"session_version" integer DEFAULT 1 NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Everything that exists so far belongs to the owner's own account.
INSERT INTO "tenants" ("name") VALUES ('Mein Konto');--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "tenant_id" integer;--> statement-breakpoint
UPDATE "pages" SET "tenant_id" = (SELECT min("id") FROM "tenants");--> statement-breakpoint
ALTER TABLE "pages" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
INSERT INTO "domains" ("domain", "tenant_id", "verified_at")
  SELECT DISTINCT "domain", (SELECT min("id") FROM "tenants"), now() FROM "pages";--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "login_failures_key_time_idx" ON "login_failures" USING btree ("key","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_domain_domains_domain_fk" FOREIGN KEY ("domain") REFERENCES "public"."domains"("domain") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "pages_tenant_idx" ON "pages" USING btree ("tenant_id");