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

async function encryptPassword(password: string, encodedKey: string) {
  const bytes = Uint8Array.from(atob(encodedKey), (char) => char.charCodeAt(0));
  if (bytes.length !== 32) throw new Error("Invalid encryption-key configuration.");
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, new TextEncoder().encode(password)));
  return { cipher: `\\x${hex(cipher)}`, nonce: `\\x${hex(nonce)}` };
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
      if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return json({ error: "Authentication is not configured." }, 503);
      return json({ url: env.SUPABASE_URL, key: env.SUPABASE_PUBLISHABLE_KEY });
    }

    if (url.pathname === "/api/mt5/connect" && request.method === "POST") {
      try {
        const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
        const encryptionKey = env.CHEETRADE_ENCRYPTION_KEY;
        const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!env.SUPABASE_URL || !serviceKey || !encryptionKey) return json({ error: "Cheetrade is not configured." }, 503);
        if (!accessToken) return json({ error: "Sign in before connecting an account." }, 401);
        const identity = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: serviceKey, authorization: `Bearer ${accessToken}` } });
        if (!identity.ok) return json({ error: "Your session expired. Sign in again." }, 401);
        const user = await identity.json() as { id: string; email?: string };
        const payload = await request.json() as { brokerServer?: string; accountNumber?: string; investorPassword?: string };
        const brokerServer = payload.brokerServer?.trim(), accountNumber = payload.accountNumber?.trim(), investorPassword = payload.investorPassword?.trim();
        if (!brokerServer || !accountNumber || !investorPassword) return json({ error: "Complete all three MT5 fields." }, 400);
        const encrypted = await encryptPassword(investorPassword, encryptionKey);
        const headers = { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json", prefer: "resolution=merge-duplicates,return=representation" };
        await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?on_conflict=id`, { method: "POST", headers, body: JSON.stringify({ id: user.id, display_name: user.email?.split("@")[0] ?? "Trader" }) });
        const saved = await fetch(`${env.SUPABASE_URL}/rest/v1/mt5_connections?on_conflict=user_id,broker_server,account_number`, { method: "POST", headers, body: JSON.stringify({ user_id: user.id, broker_server: brokerServer, account_number: accountNumber, credential_ciphertext: encrypted.cipher, credential_nonce: encrypted.nonce, status: "pending" }) });
        if (!saved.ok) throw new Error("The encrypted connection could not be saved.");
        return json({ ok: true });
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
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
