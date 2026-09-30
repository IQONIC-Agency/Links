import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";
import sharp from "sharp";
import { randomId } from "@/lib/ids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOCAL_DIR = path.join(process.cwd(), ".uploads");
const MAX_INPUT_BYTES = 4.5 * 1024 * 1024; // Vercel function body limit

/** Protected by the /api/admin/* Basic-auth check in middleware. */
export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob)) return Response.json({ error: "Keine Datei" }, { status: 400 });
  if (file.size > MAX_INPUT_BYTES) return Response.json({ error: "Datei zu groß (max. 4,5 MB)" }, { status: 413 });

  let webp: Buffer;
  try {
    webp = await sharp(Buffer.from(await file.arrayBuffer()), { failOn: "error" })
      .rotate() // apply EXIF orientation from phone photos
      .resize({ width: 1600, withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    return Response.json({ error: "Kein gültiges Bild" }, { status: 400 });
  }

  const name = `uploads/${randomId(16)}.webp`;

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    // Local development without Blob: files go to .uploads/ and are served by app/uploads/[file].
    if (process.env.VERCEL) return Response.json({ error: "BLOB_READ_WRITE_TOKEN fehlt" }, { status: 500 });
    await mkdir(LOCAL_DIR, { recursive: true });
    await writeFile(path.join(LOCAL_DIR, path.basename(name)), webp);
    return Response.json({ url: `/${name}`, bytes: webp.length });
  }

  const blob = await put(name, webp, {
    access: "public",
    contentType: "image/webp",
    cacheControlMaxAge: 60 * 60 * 24 * 365,
  });
  return Response.json({ url: blob.url, bytes: webp.length });
}
