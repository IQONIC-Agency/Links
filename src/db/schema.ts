import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export type FontKey =
  | "inter"
  | "poppins"
  | "montserrat"
  | "playfair"
  | "roboto"
  | "lato"
  | "oswald"
  | "dmsans";

/** Everything the editor controls that is not a button. */
export type PageConfig = {
  title?: string;
  subtitle?: string;
  avatarUrl?: string;
  backgroundImageUrl?: string;
  backgroundColor: string;
  /** 0–0.9, dark overlay over the background image for readability */
  backgroundOverlay: number;
  textColor: string;
  font: FontKey;
};

export type ButtonStyle = {
  bgColor: string;
  textColor: string;
  borderColor: string;
  borderWidth: number;
  radius: number;
  imageUrl?: string;
};

export const defaultPageConfig: PageConfig = {
  title: "",
  subtitle: "",
  backgroundColor: "#111111",
  backgroundOverlay: 0.3,
  textColor: "#ffffff",
  font: "inter",
};

export const defaultButtonStyle: ButtonStyle = {
  bgColor: "#ffffff",
  textColor: "#111111",
  borderColor: "#ffffff",
  borderWidth: 0,
  radius: 14,
};

/** A customer account. Every page and domain belongs to exactly one tenant. */
export const tenants = pgTable("tenants", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Role = "superadmin" | "member";

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    /** lower case */
    email: text("email").notNull(),
    name: text("name").notNull().default(""),
    /** scrypt$<salt b64>$<hash b64> */
    passwordHash: text("password_hash").notNull(),
    /** superadmin sees every tenant; member only its own */
    role: text("role").$type<Role>().notNull().default("member"),
    /** null only for superadmins */
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "restrict" }),
    /** bumped on password change / "log out everywhere"; old session cookies stop working */
    sessionVersion: integer("session_version").notNull().default(1),
    disabled: boolean("disabled").notNull().default(false),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email)],
);

/** Custom domains, registered with the Vercel project from the admin. */
export const domains = pgTable("domains", {
  /** normalized host without www. and port */
  domain: text("domain").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "restrict" }),
  /** last time Vercel reported a valid DNS configuration */
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Failed logins, for throttling (keyed by email and by IP hash). */
export const loginFailures = pgTable(
  "login_failures",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    key: text("key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("login_failures_key_time_idx").on(t.key, t.createdAt)],
);

export const pages = pgTable(
  "pages",
  {
    id: serial("id").primaryKey(),
    /** always the tenant of `domain` */
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    /** normalized host without www. and port, e.g. "example.com" */
    domain: text("domain")
      .notNull()
      .references(() => domains.domain, { onDelete: "restrict", onUpdate: "cascade" }),
    slug: text("slug").notNull(),
    /** grouping key in stats (the creator/model this page belongs to) */
    model: text("model").notNull().default(""),
    /** id of the creator in the CRM; the CRM matches stats by this, not by name */
    crmId: text("crm_id").notNull().default(""),
    /** free text, e.g. which IG account uses this link */
    notes: text("notes").notNull().default(""),
    live: boolean("live").notNull().default(false),
    deeplinkEnabled: boolean("deeplink_enabled").notNull().default(true),
    blockVpn: boolean("block_vpn").notNull().default(true),
    /** ISO-3166 alpha-2, upper case */
    blockedCountries: text("blocked_countries")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    config: jsonb("config").$type<PageConfig>().notNull().default(defaultPageConfig),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("pages_domain_slug_uq").on(t.domain, t.slug), index("pages_tenant_idx").on(t.tenantId)],
);

export const buttons = pgTable(
  "buttons",
  {
    /** random id used in the masked /r/<id> URL, not guessable */
    id: text("id").primaryKey(),
    pageId: integer("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    label: text("label").notNull(),
    url: text("url").notNull(),
    ageGate: boolean("age_gate").notNull().default(true),
    deeplink: boolean("deeplink").notNull().default(true),
    style: jsonb("style").$type<ButtonStyle>().notNull().default(defaultButtonStyle),
  },
  (t) => [index("buttons_page_idx").on(t.pageId, t.position)],
);

export type EventType = "pageview" | "click" | "age_confirm";

export const events = pgTable(
  "events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    pageId: integer("page_id").notNull(),
    buttonId: text("button_id"),
    type: text("type").$type<EventType>().notNull(),
    country: text("country"),
    /** ios | android | desktop | other */
    device: text("device").notNull(),
    inApp: boolean("in_app").notNull(),
    /** instagram | threads | facebook | tiktok | null */
    inAppName: text("in_app_name"),
    /** null = unknown (check failed or disabled) */
    isVpn: boolean("is_vpn"),
    /** HMAC-SHA-256(IP + UA, VISITOR_SALT), hex */
    visitorHash: text("visitor_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("events_page_time_idx").on(t.pageId, t.createdAt),
    index("events_time_idx").on(t.createdAt),
  ],
);

/** proxycheck.io results, keyed by a salted IP hash so no raw IPs are stored */
export const ipChecks = pgTable("ip_checks", {
  ipHash: text("ip_hash").primaryKey(),
  isVpn: boolean("is_vpn").notNull(),
  proxyType: text("proxy_type"),
  country: text("country"),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Page = typeof pages.$inferSelect;
export type User = typeof users.$inferSelect;
export type Domain = typeof domains.$inferSelect;
export type Button = typeof buttons.$inferSelect;
