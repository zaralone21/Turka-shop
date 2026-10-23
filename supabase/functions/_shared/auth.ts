import { createClient } from "npm:@supabase/supabase-js@2.118.0";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Службовий клієнт (обходить RLS). Використовується лише на сервері. */
export const admin = () => createClient(URL_, SERVICE, { auth: { persistSession: false } });

/** Перевіряє токен користувача з заголовка Authorization. */
export async function userFrom(req: Request) {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  const client = createClient(URL_, ANON, { auth: { persistSession: false }, global: { headers: { Authorization: auth } } });
  const { data, error } = await client.auth.getUser(auth.slice(7));
  return error ? null : data.user;
}
