// Викликається планувальником (pg_cron) щохвилини. Забирає нагадування, час яких настав,
// записує їх у журнал сповіщень і надсилає web push на пристрої користувача.
// Повторне надсилання виключене: claim_due_reminders повертає кожне спрацювання лише один раз.
import { admin, json } from "../_shared/auth.ts";
import { pushConfigured, recordOutcomes, sendPush } from "../_shared/webpush.ts";

const SECRET = Deno.env.get("CRON_SECRET") || "";

Deno.serve(async (req) => {
  if (!SECRET || req.headers.get("Authorization") !== `Bearer ${SECRET}`) return json({ error: "unauthorized" }, 401);
  const db = admin();
  const { data: claimed, error } = await db.rpc("claim_due_reminders", { max_rows: 200 });
  if (error) return json({ error: error.message }, 500);
  let sent = 0, failed = 0;
  if (pushConfigured && claimed.length) {
    const users = [...new Set(claimed.map((n: { user_id: string }) => n.user_id))];
    const { data: subs } = await db.from("push_subscriptions").select("id,user_id,endpoint,p256dh,auth").in("user_id", users);
    for (const n of claimed) {
      const mine = (subs || []).filter((s: { user_id: string }) => s.user_id === n.user_id);
      const outcomes = await Promise.all(mine.map((s: { id: string; endpoint: string; p256dh: string; auth: string }) =>
        sendPush(s, { title: n.title, body: n.body || "Нагадування", tag: n.reminder_id, reminderId: n.reminder_id, notificationId: n.id, url: "#reminders" })));
      const okN = outcomes.filter(o => o.ok).length; sent += okN; failed += outcomes.length - okN;
      await db.from("notifications").update({ push_sent: okN, push_failed: outcomes.length - okN }).eq("id", n.id);
      await recordOutcomes(db, outcomes);
    }
  }
  return json({ claimed: claimed.length, pushSent: sent, pushFailed: failed, pushConfigured });
});
