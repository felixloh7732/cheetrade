export async function GET() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return Response.json({ error: "Authentication is not configured." }, { status: 503 });
  return Response.json({ url, key });
}
