// Runs the Drizzle migrations before `next build`, so a deploy on Vercel
// creates/updates the tables itself. Skipped when no DATABASE_URL is set.
import { execSync } from "node:child_process";

if (!process.env.DATABASE_URL) {
  console.log("[migrate] DATABASE_URL not set, skipping migrations");
} else {
  execSync("npx drizzle-kit migrate", { stdio: "inherit" });
}
