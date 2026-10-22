import webpush from "npm:web-push@3.6.7";

const PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com";
export const pushConfigured = !!(PUBLIC && PRIVATE);
export const vapidPublicKey = PUBLIC;
if (pushConfigured) webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);

type Sub = { id: string; endpoint: string; p256dh: string; auth: string };
export type PushOutcome = { id: string; ok: boolean; gone: boolean; status?: number };

/** Надсилає одне повідомлення на одну підписку. gone = підписка більше не існує (її слід видалити). */
export async function sendPush(sub: Sub, payload: Record<string, unknown>): Promise<PushOutcome> {
  try {
    const r = await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 3600, urgency: "high", topic: String(payload.tag || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined });
    return { id: sub.id, ok: true, gone: false, status: r.statusCode };
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    if (!status) console.error("push send failed", (e as Error).message);
    return { id: sub.id, ok: false, gone: status === 404 || status === 410, status };
  }
}

/** Оновлює стан підписок після надсилання: прибирає зниклі, рахує збої. */
// deno-lint-ignore no-explicit-any
export async function recordOutcomes(db: any, outcomes: PushOutcome[]) {
  const gone = outcomes.filter(o => o.gone).map(o => o.id);
  if (gone.length) await db.from("push_subscriptions").delete().in("id", gone);
  const ok = outcomes.filter(o => o.ok).map(o => o.id);
  if (ok.length) await db.from("push_subscriptions").update({ last_ok_at: new Date().toISOString(), failures: 0 }).in("id", ok);
  for (const o of outcomes.filter(o => !o.ok && !o.gone)) await db.rpc("bump_push_failure", { sub_id: o.id });
}
