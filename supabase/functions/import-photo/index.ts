// Завантажує фото товару за посиланням (наприклад, із сайту постачальника) у приватне сховище користувача.
// Браузер не може сам завантажити чуже зображення через обмеження CORS, тому це робить сервер.
// Викликається лише після підтвердження користувачем у картці AI.
import { admin, cors, json, userFrom } from "../_shared/auth.ts";

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const ID = /^[\w-]{1,100}$/;

/** Лише публічні адреси https: без IP-адрес, localhost і внутрішніх імен. */
function publicHttps(raw: string): URL | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return null;
  const h = u.hostname.toLowerCase();
  if (!h.includes(".") || h.endsWith(".local") || h.endsWith(".internal") || h === "localhost" || h.endsWith(".localhost")) return null;
  if (/^[\d.]+$/.test(h) || h.includes(":") || h.startsWith("[")) return null;
  return u;
}

async function download(start: URL): Promise<{ bytes: Uint8Array; type: string }> {
  let url = start;
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15_000), headers: { Accept: "image/jpeg,image/png,image/webp" } });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location"); await res.body?.cancel();
      const u = next ? publicHttps(new URL(next, url).toString()) : null;
      if (!u) throw new Error("redirect");
      url = u; continue;
    }
    if (!res.ok) { await res.body?.cancel(); throw new Error("status " + res.status); }
    const type = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!TYPES[type]) { await res.body?.cancel(); throw new Error("type"); }
    if (Number(res.headers.get("content-length") || 0) > MAX_BYTES) { await res.body?.cancel(); throw new Error("size"); }
    const reader = res.body!.getReader(); const parts: Uint8Array[] = []; let size = 0;
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > MAX_BYTES) { await reader.cancel(); throw new Error("size"); }
      parts.push(value);
    }
    const bytes = new Uint8Array(size); let o = 0; for (const p of parts) { bytes.set(p, o); o += p.length; }
    return { bytes, type };
  }
  throw new Error("redirect");
}

const REASONS: Record<string, string> = {
  type: "за посиланням не зображення JPEG, PNG чи WebP", size: "файл більший за 5 МБ", redirect: "сайт перенаправляє на недозволену адресу",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const user = await userFrom(req);
  if (!user) return json({ error: "unauthorized" }, 401);
  let url: URL | null = null, productId = "";
  try { const b = await req.json(); url = publicHttps(String(b.url || "")); productId = String(b.productId || ""); } catch { /* нижче */ }
  if (!url || !ID.test(productId)) return json({ error: "bad_request", detail: "Потрібне посилання https на зображення" }, 400);
  let file;
  try { file = await download(url); }
  catch (e) {
    const code = e instanceof Error ? e.message : "";
    return json({ error: "fetch_failed", detail: REASONS[code] || (code.startsWith("status") ? `сайт відповів помилкою (${code.slice(7)})` : "не вдалося завантажити зображення") }, 422);
  }
  const id = crypto.randomUUID();
  const path = `${user.id}/${productId}/${id}.${TYPES[file.type]}`;
  const { error } = await admin().storage.from("product-photos").upload(path, file.bytes, { contentType: file.type, upsert: false });
  if (error) return json({ error: "storage", detail: error.message }, 500);
  return json({ id, path });
});
