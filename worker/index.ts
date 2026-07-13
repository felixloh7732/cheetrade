/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  CHEETRADE_ENCRYPTION_KEY?: string;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

const hex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
const base64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");

function keyBytes(encodedKey: string) {
  return Uint8Array.from(atob(encodedKey), (char) => char.charCodeAt(0));
}

async function encryptPassword(password: string, encodedKey: string) {
  const bytes = keyBytes(encodedKey);
  if (bytes.length !== 32) throw new Error("Invalid encryption-key configuration.");
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, new TextEncoder().encode(password)));
  return { cipher: `\\x${hex(cipher)}`, nonce: `\\x${hex(nonce)}` };
}

async function importSignature(userId: string, encodedKey: string) {
  const key = await crypto.subtle.importKey("raw", keyBytes(encodedKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(userId)));
}

async function importToken(userId: string, encodedKey: string) {
  return `${userId}.${base64Url(await importSignature(userId, encodedKey))}`;
}

async function importTokenUser(token: string, encodedKey: string) {
  const [userId, signature] = token.split(".");
  if (!userId || !signature || token.split(".").length !== 2) return null;
  return signature === base64Url(await importSignature(userId, encodedKey)) ? userId : null;
}

async function authenticatedUser(url: string, serviceKey: string, accessToken: string) {
  const identity = await fetch(`${url}/auth/v1/user`, { headers: { apikey: serviceKey, authorization: `Bearer ${accessToken}` } });
  return identity.ok ? await identity.json() as { id: string; email?: string } : null;
}

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "cache-control": "no-store" } });
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/config") {
      const missing = [!env.SUPABASE_URL && "SUPABASE_URL", !env.SUPABASE_PUBLISHABLE_KEY && "SUPABASE_PUBLISHABLE_KEY"].filter(Boolean);
      if (missing.length) return json({ error: `Missing Cloudflare setting: ${missing.join(", ")}.`, missing }, 503);
      return json({ url: env.SUPABASE_URL, key: env.SUPABASE_PUBLISHABLE_KEY });
    }

    if (url.pathname === "/api/mt5/connect" && request.method === "POST") {
      try {
        const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
        const encryptionKey = env.CHEETRADE_ENCRYPTION_KEY;
        const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!env.SUPABASE_URL || !serviceKey || !encryptionKey) return json({ error: "Cheetrade is not configured." }, 503);
        if (!accessToken) return json({ error: "Sign in before connecting an account." }, 401);
        const user = await authenticatedUser(env.SUPABASE_URL, serviceKey, accessToken);
        if (!user) return json({ error: "Your session expired. Sign in again." }, 401);
        const payload = await request.json() as { brokerServer?: string; accountNumber?: string; investorPassword?: string };
        const brokerServer = payload.brokerServer?.trim(), accountNumber = payload.accountNumber?.trim(), investorPassword = payload.investorPassword?.trim();
        if (!brokerServer || !accountNumber || !investorPassword) return json({ error: "Complete all three MT5 fields." }, 400);
        const encrypted = await encryptPassword(investorPassword, encryptionKey);
        const headers = { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json", prefer: "return=minimal" };
        const saved = await fetch(`${env.SUPABASE_URL}/rest/v1/mt5_connections`, { method: "POST", headers, body: JSON.stringify({ user_id: user.id, broker_server: brokerServer, account_number: accountNumber, credential_ciphertext: encrypted.cipher, credential_nonce: encrypted.nonce, status: "pending" }) });
        if (!saved.ok) {
          const failure = await saved.json().catch(() => ({})) as { message?: string; code?: string };
          console.error("MT5 connection save rejected", saved.status, failure.code, failure.message);
          throw new Error(`The database rejected the encrypted connection (${failure.code ?? saved.status}): ${failure.message ?? "unknown reason"}`);
        }
        return json({ ok: true });
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
      }
    }

    if (url.pathname === "/api/mt5/import-token" && request.method === "GET") {
      const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
      const encryptionKey = env.CHEETRADE_ENCRYPTION_KEY;
      const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
      if (!env.SUPABASE_URL || !serviceKey || !encryptionKey) return json({ error: "Cheetrade is not configured." }, 503);
      if (!accessToken) return json({ error: "Sign in before creating desktop sync setup." }, 401);
      const user = await authenticatedUser(env.SUPABASE_URL, serviceKey, accessToken);
      if (!user) return json({ error: "Your session expired. Sign in again." }, 401);
      return json({ token: await importToken(user.id, encryptionKey), importUrl: new URL("/api/mt5/import", request.url).toString() });
    }

    if (url.pathname === "/api/mt5/import" && request.method === "POST") {
      try {
        const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
        const encryptionKey = env.CHEETRADE_ENCRYPTION_KEY;
        const token = request.headers.get("x-cheetrade-import-token") ?? "";
        if (!env.SUPABASE_URL || !serviceKey || !encryptionKey) return json({ error: "Cheetrade is not configured." }, 503);
        const userId = await importTokenUser(token, encryptionKey);
        if (!userId) return json({ error: "Invalid desktop import code." }, 401);
        const payload = await request.json() as { accountNumber?: string; deals?: Array<Record<string, unknown>> };
        const accountNumber = payload.accountNumber?.trim();
        const deals = payload.deals;
        if (!accountNumber || !Array.isArray(deals) || deals.length === 0 || deals.length > 500) return json({ error: "Send 1 to 500 closed MT5 deals at a time." }, 400);
        const query = new URLSearchParams({ select: "id", user_id: `eq.${userId}`, account_number: `eq.${accountNumber}`, limit: "1" });
        const connection = await fetch(`${env.SUPABASE_URL}/rest/v1/mt5_connections?${query}`, { headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` } });
        const connections = await connection.json().catch(() => []) as Array<{ id: string }>;
        if (!connection.ok || !connections[0]) return json({ error: "No saved Cheetrade connection matches this MT5 account." }, 404);
        const rows = deals.map((deal) => ({
          connection_id: connections[0].id, user_id: userId, ticket: String(deal.ticket ?? ""), position_id: String(deal.positionId ?? ""), symbol: String(deal.symbol ?? ""), side: String(deal.side ?? ""),
          volume: Number(deal.volume ?? 0), price: Number(deal.price ?? 0), profit: Number(deal.profit ?? 0), commission: Number(deal.commission ?? 0), swap: Number(deal.swap ?? 0), fee: Number(deal.fee ?? 0), occurred_at: String(deal.occurredAt ?? ""), raw_data: deal.raw ?? {},
        }));
        if (rows.some((row) => !row.ticket || !row.symbol || !row.side || !row.occurred_at || !Number.isFinite(row.profit))) return json({ error: "The desktop helper sent an invalid MT5 deal." }, 400);
        const saved = await fetch(`${env.SUPABASE_URL}/rest/v1/mt5_deals?on_conflict=connection_id,ticket`, { method: "POST", headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json", prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows) });
        if (!saved.ok) { const failure = await saved.json().catch(() => ({})) as { message?: string }; throw new Error(failure.message ?? "MT5 deals could not be saved."); }
        return json({ ok: true, imported: rows.length });
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : "Unexpected import error" }, 500);
      }
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
