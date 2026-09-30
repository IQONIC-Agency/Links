import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

/** Local development only: serves images the upload route stored in .uploads/ when Blob is not configured. */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  if (process.env.VERCEL) return new Response("Not found", { status: 404 });
  const { file } = await params;
  if (!/^[a-z0-9]+\.webp$/.test(file)) return new Response("Not found", { status: 404 });
  try {
    const buf = await readFile(path.join(process.cwd(), ".uploads", file));
    return new Response(new Uint8Array(buf), { headers: { "content-type": "image/webp", "cache-control": "public, max-age=3600" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
