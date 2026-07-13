const toHex = (value: Uint8Array) => Array.from(value, (b) => b.toString(16).padStart(2, "0")).join("");

async function encrypt(value: string, encodedKey: string) {
  const rawKey = Uint8Array.from(atob(encodedKey), (c) => c.charCodeAt(0));
  if (rawKey.length !== 32) throw new Error("Invalid encryption-key configuration.");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value)));
  return { cipher: `\\x${toHex(cipher)}`, iv: `\\x${toHex(iv)}` };
}

export async function POST(request: Request) {
  try {
    const url = process.env.SUPABASE_URL, serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY, encryptionKey = process.env.CHEETRADE_ENCRYPTION_KEY;
    const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!url || !serviceKey || !encryptionKey) return Response.json({ error: "Cheetrade is not configured." }, { status: 503 });
    if (!accessToken) return Response.json({ error: "Sign in before connecting an account." }, { status: 401 });
    const identity = await fetch(`${url}/auth/v1/user`, { headers: { apikey: serviceKey, authorization: `Bearer ${accessToken}` } });
    if (!identity.ok) return Response.json({ error: "Your session expired. Sign in again." }, { status: 401 });
    const user = await identity.json() as { id: string; email?: string };
    const payload = await request.json() as { brokerServer?: string; accountNumber?: string; investorPassword?: string };
    const brokerServer = payload.brokerServer?.trim(), accountNumber = payload.accountNumber?.trim(), investorPassword = payload.investorPassword?.trim();
    if (!brokerServer || !accountNumber || !investorPassword) return Response.json({ error: "Complete all three MT5 fields." }, { status: 400 });
    const encrypted = await encrypt(investorPassword, encryptionKey);
    const headers = { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json", prefer: "resolution=merge-duplicates,return=representation" };
    await fetch(`${url}/rest/v1/profiles?on_conflict=id`, { method: "POST", headers, body: JSON.stringify({ id: user.id, display_name: user.email?.split("@")[0] ?? "Trader" }) });
    const saved = await fetch(`${url}/rest/v1/mt5_connections?on_conflict=user_id,broker_server,account_number`, { method: "POST", headers, body: JSON.stringify({ user_id: user.id, broker_server: brokerServer, account_number: accountNumber, credential_ciphertext: encrypted.cipher, credential_nonce: encrypted.iv, status: "pending" }) });
    if (!saved.ok) throw new Error("The encrypted connection could not be saved.");
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
  }
}
