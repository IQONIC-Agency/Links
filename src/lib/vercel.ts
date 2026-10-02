import "server-only";

// Registers custom domains on this Vercel project, so customers never need
// Vercel access. Needs VERCEL_TOKEN + VERCEL_PROJECT_ID (+ VERCEL_TEAM_ID when
// the project lives in a team). The token stays on the server.

const API = process.env.VERCEL_API_URL || "https://api.vercel.com";
const TIMEOUT_MS = 8000;
/** Vercel's generic apex IP. Used when the API gives no recommendation. */
const FALLBACK_A = "76.76.21.21";

export function vercelConfigured(): boolean {
  return Boolean(process.env.VERCEL_TOKEN && process.env.VERCEL_PROJECT_ID);
}

type VercelError = { error?: { code?: string; message?: string } };

async function call<T>(method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T & VercelError }> {
  const url = new URL(API + path);
  if (process.env.VERCEL_TEAM_ID) url.searchParams.set("teamId", process.env.VERCEL_TEAM_ID);
  const res = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${process.env.VERCEL_TOKEN}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as T & VercelError;
  return { ok: res.ok, status: res.status, data };
}

const project = () => encodeURIComponent(process.env.VERCEL_PROJECT_ID!);

export type DnsRecord = { type: "A" | "TXT" | "CNAME"; name: string; value: string };

export type DomainStatus =
  | { state: "unconfigured" } // no Vercel credentials: the owner adds the domain in Vercel by hand
  | { state: "error"; message: string }
  | { state: "missing" } // not (or no longer) on the Vercel project
  | { state: "pending"; records: DnsRecord[] }
  | { state: "active" };

type ProjectDomain = {
  name: string;
  verified: boolean;
  verification?: { type: string; domain: string; value: string; reason: string }[];
};
type DomainConfig = {
  misconfigured: boolean;
  recommendedIPv4?: { rank: number; value: string[] }[];
};

function vercelMessage(r: { status: number; data: VercelError }): string {
  return r.data.error?.message || `Vercel antwortet mit Status ${r.status}`;
}

/** Adds the domain to the project. Already on this project counts as success. */
export async function addDomain(domain: string): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!vercelConfigured()) return { ok: true };
  try {
    const r = await call<ProjectDomain>("POST", `/v10/projects/${project()}/domains`, { name: domain });
    if (r.ok) return { ok: true };
    if (r.status === 409 || r.status === 400) {
      // Already on THIS project (e.g. added by hand in Vercel) is fine; on another project/account it is not.
      const again = await call<ProjectDomain>("GET", `/v9/projects/${project()}/domains/${encodeURIComponent(domain)}`);
      if (again.ok) return { ok: true };
    }
    return { ok: false, message: vercelMessage(r) };
  } catch (e) {
    return { ok: false, message: `Vercel nicht erreichbar (${(e as Error).name})` };
  }
}

export async function removeDomain(domain: string): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!vercelConfigured()) return { ok: true };
  try {
    const r = await call("DELETE", `/v9/projects/${project()}/domains/${encodeURIComponent(domain)}`);
    if (r.ok || r.status === 404) return { ok: true };
    return { ok: false, message: vercelMessage(r) };
  } catch (e) {
    return { ok: false, message: `Vercel nicht erreichbar (${(e as Error).name})` };
  }
}

/**
 * Current state plus the DNS records the customer has to create.
 * `verify` additionally asks Vercel to re-check the ownership TXT record.
 */
export async function domainStatus(domain: string, verify = false): Promise<DomainStatus> {
  if (!vercelConfigured()) return { state: "unconfigured" };
  try {
    const name = encodeURIComponent(domain);
    let pd = await call<ProjectDomain>("GET", `/v9/projects/${project()}/domains/${name}`);
    if (pd.status === 404) return { state: "missing" };
    if (!pd.ok) return { state: "error", message: vercelMessage(pd) };
    if (verify && !pd.data.verified) {
      const v = await call<ProjectDomain>("POST", `/v9/projects/${project()}/domains/${name}/verify`);
      if (v.ok) pd = v;
    }
    const cfg = await call<DomainConfig>("GET", `/v6/domains/${name}/config`);
    if (!cfg.ok) return { state: "error", message: vercelMessage(cfg) };

    if (pd.data.verified && !cfg.data.misconfigured) return { state: "active" };

    // Generic apex IP shared by all Vercel sites (a project-specific CNAME would link customers' domains).
    const best = [...(cfg.data.recommendedIPv4 ?? [])].sort((a, b) => a.rank - b.rank)[0]?.value[0];
    const records: DnsRecord[] = [{ type: "A", name: "@", value: best || FALLBACK_A }];
    for (const v of pd.data.verification ?? []) {
      if (v.type === "TXT") records.push({ type: "TXT", name: v.domain.replace(new RegExp(`\\.?${domain.replace(/\./g, "\\.")}$`), "") || "@", value: v.value });
    }
    return { state: "pending", records };
  } catch (e) {
    return { state: "error", message: `Vercel nicht erreichbar (${(e as Error).name})` };
  }
}
