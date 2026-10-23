// Налаштування web push для застосунку: публічний ключ VAPID і тестове сповіщення.
import { cors, admin, json, userFrom } from "../_shared/auth.ts";
import { pushConfigured, recordOutcomes, sendPush, vapidPublicKey } from "../_shared/webpush.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const user = await userFrom(req);
  if (!user) return json({ error: "unauthorized" }, 401);
  if (req.method === "GET") return json({ configured: pushConfigured, publicKey: pushConfigured ? vapidPublicKey : null });
  if (!pushConfigured) return json({ error: "not_configured" }, 503);
  const db = admin();
  const body = await req.json().catch(() => ({}));
  let q = db.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", user.id);
  if (body.endpoint) q = q.eq("endpoint", body.endpoint);
  const { data: subs, error } = await q;
  if (error) return json({ error: error.message }, 500);
  if (!subs.length) return json({ error: "no_subscriptions" }, 404);
  const outcomes = await Promise.all(subs.map(s => sendPush(s, { title: "Тестове сповіщення", body: "Сповіщення працюють на цьому пристрої.", tag: "test", url: "#reminders" })));
  await recordOutcomes(db, outcomes);
  return json({ sent: outcomes.filter(o => o.ok).length, failed: outcomes.filter(o => !o.ok).length, statuses: outcomes.map(o => o.status ?? null) });
});
